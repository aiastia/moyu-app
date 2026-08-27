/**
 * SSE（text/event-stream）POST 客户端。
 *
 * 必须用 expo/fetch 的具名导入：SDK57 起 iOS/Android 原生支持流式 resp.body.getReader()
 * （WinterCG Streams API），RN 内置 fetch 不支持流式（拿不到增量 chunk）。
 *
 * 服务端协议（sse_event_wrap）：POST JSON → `data: {"type":"start"}` → 任意多个
 * `data: {"type":"tool_call"|"tool_result"|"status"|...}` → 结束帧 `data: {"type":"done","data":{...}}`
 * 或 `data: {"type":"error","message":"..."}`；每 10s 一条 `: keep-alive` 注释行作心跳。
 */

import { fetch as expoFetch } from 'expo/fetch';

import { ApiError } from './api';

/** 一帧 SSE 事件：必有 type，其余字段按端点而异（tool/brief/ms/args/data/message…） */
export interface SSEEvent {
  type: string;
  [k: string]: unknown;
}

export interface SSEResult {
  /** done 帧的 data 载荷（live 空闲时是 {idle:true}） */
  data?: Record<string, unknown>;
  /** error 帧的错误文案 */
  error?: string;
}

export interface PostSSEOptions {
  /** 每收到一帧非 start/done/error 事件回调一次（实时渲染工具活动） */
  onEvent?: (ev: SSEEvent) => void;
  /** 断开流（AbortController.signal）；轮次在服务端后台继续跑，重连走 /live */
  signal?: AbortSignal;
}

/** 把累积 buffer 按 \n\n 切帧，返回 [事件数组, 残留 buffer]。`: xxx` 注释行（心跳）直接忽略 */
function parseFrames(buffer: string): { events: SSEEvent[]; rest: string } {
  const events: SSEEvent[] = [];
  let rest = buffer;
  // 兼容 \r\n\r\n 分帧
  let idx = rest.search(/\n\n|\r\n\r\n/);
  while (idx !== -1) {
    const frame = rest.slice(0, idx);
    rest = rest.slice(idx + (rest[idx] === '\r' ? 4 : 2));
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue; // 「: keep-alive」等注释行与空行忽略
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        events.push(JSON.parse(payload) as SSEEvent);
      } catch {
        // 非 JSON 的 data 行（不应出现），跳过不致命
      }
    }
    idx = rest.search(/\n\n|\r\n\r\n/);
  }
  return { events, rest };
}

/**
 * POST 一个 SSE 端点并消费事件流，读到 done/error 帧结束。
 * 非流式错误（如发消息时会话忙的 409 JSON）抛 ApiError（带 status）。
 * 流内 error 帧不抛异常，落在返回值的 error 字段（调用方按端点语义处理）。
 */
export async function postSSE(
  baseUrl: string,
  token: string,
  path: string,
  body: unknown,
  opts?: PostSSEOptions,
): Promise<SSEResult> {
  const res = await expoFetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
    signal: opts?.signal,
  });

  if (!res.ok) {
    // 端点在开流前就可能拒绝（409 忙 / 404 不存在 / 401 过期），返回普通 JSON
    let msg = `请求失败（${res.status}）`;
    try {
      const j = await res.json();
      if (j?.detail && typeof j.detail === 'string') msg = j.detail;
    } catch { /* keep default */ }
    throw new ApiError(res.status, msg);
  }
  if (!res.body) throw new ApiError(0, '服务器未返回事件流');

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let result: SSEResult = {};

  try {
    // 轮次可能长达数分钟；done/error 帧由服务端保证一定发（正常路径），循环读到为止。
    // 读到流自然关闭（EOF）还没有结束帧时按网络中断处理，抛错让调用方走重连/轮询兜底。
    let streamEnded = false;
    while (!streamEnded) {
      const { done, value } = await reader.read();
      if (done) {
        streamEnded = true;
      } else {
        buffer += decoder.decode(value, { stream: true });
      }
      const { events, rest } = parseFrames(buffer);
      buffer = rest;
      for (const ev of events) {
        if (ev.type === 'start') continue;
        if (ev.type === 'done') {
          result = { data: (ev.data as Record<string, unknown>) ?? {} };
        } else if (ev.type === 'error') {
          result = { error: typeof ev.message === 'string' ? ev.message : '处理失败' };
        } else {
          opts?.onEvent?.(ev);
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  if (result.data === undefined && result.error === undefined) {
    throw new ApiError(0, '连接中断，正在执行的部分不受影响');
  }
  return result;
}
