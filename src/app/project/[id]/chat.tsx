import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, EmptyState, ScreenHeader, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import { FindingsSheet } from '@/components/chat/FindingsSheet';
import { ReadReviewSheet } from '@/components/chat/ReadReviewSheet';
import { RevisionsSheet } from '@/components/chat/RevisionsSheet';
import type { AiModelConfig, ChatBuiltinSkill, ChatMessage, ChatSession, ChatToolEvent, UserSkillItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { SSEEvent } from '@/lib/sse';
import { friendlyError, useAuth } from '@/lib/auth';
import { fmtRelative } from '@/lib/format';
import { C, R, SP } from '@/lib/theme';

/** 常用聊天工具的展示名（未命中的显示原始名） */
const TOOL_LABEL: Record<string, string> = {
  query_character: '查角色',
  query_organization: '查组织',
  query_world_setting: '查设定',
  query_item: '查物品',
  query_location: '查地点',
  query_memory: '查记忆',
  query_plot_timeline: '查时间线',
  read_chapter: '读章节',
  add_finding: '记问题',
  preview_read_review: '审稿预览',
  get_review_status: '审稿进度',
  list_findings: '列发现',
  apply_fix: '应用修改',
  update_chapter: '改正文',
  generate_chapter: '生成章节',
  polish_chapter: '润色章节',
};

function toolName(t?: string): string {
  return t ? (TOOL_LABEL[t] ?? t) : '工具';
}

/** SSE 实时事件 → 消息存储的 tool_events 条目形状。
 *  注意 SSE 的 tool_result 事件字段是 tool（消息里存的才是 tool_result 键），这里归一。 */
function sseToToolEvent(ev: SSEEvent): ChatToolEvent {
  if (ev.type === 'tool_result') {
    return { tool_result: typeof ev.tool === 'string' ? ev.tool : '', ms: typeof ev.ms === 'number' ? ev.ms : undefined, brief: typeof ev.brief === 'string' ? ev.brief : undefined };
  }
  return { tool: typeof ev.tool === 'string' ? ev.tool : '', args: ev.args };
}

/** 工具调用事件行（tool_events 条目 / SSE 实时事件共用渲染） */
function ToolEventRow({ ev }: { ev: ChatToolEvent }) {
  if (ev.tool_result) {
    return (
      <View style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start' }}>
        <Ionicons name="checkmark-circle-outline" size={13} color={C.green} style={{ marginTop: 2 }} />
        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17, flex: 1 }}>
          {toolName(ev.tool_result)} 完成{ev.ms ? ` · ${(ev.ms / 1000).toFixed(1)}s` : ''}
          {ev.brief ? ` · ${ev.brief}` : ''}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start' }}>
      <Ionicons name="construct-outline" size={13} color={C.blue} style={{ marginTop: 2 }} />
      <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17, flex: 1 }}>
        {toolName(ev.tool)}
        {ev.args ? ` · ${summarizeArgs(ev.args)}` : ''}
      </Text>
    </View>
  );
}

/** 参数摘要：取第一个字符串值截断（够认出查的是什么即可） */
function summarizeArgs(args: unknown): string {
  if (typeof args === 'string') return args.slice(0, 40);
  if (args && typeof args === 'object') {
    for (const v of Object.values(args as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) return v.slice(0, 40);
      if (typeof v === 'number') return String(v);
    }
  }
  return '';
}

/** 工具活动折叠块（助手气泡下方） */
function ToolEventsBlock({ events }: { events: ChatToolEvent[] }) {
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;
  return (
    <View style={{ gap: 4, marginTop: 2 }}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={12} color={C.text3} />
        <Text style={{ color: C.text3, fontSize: 11, fontWeight: '600' }}>工具调用 {events.length} 条{open ? '' : '（展开）'}</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 4, backgroundColor: '#0F121B', borderRadius: R.s, borderWidth: 1, borderColor: '#242A3B', padding: 9 }}>
          {events.map((ev, i) => (
            <ToolEventRow key={i} ev={ev} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 单条消息气泡。用户右对齐金色底；助手左对齐卡片；meta.report 通读报告特殊样式 */
function MessageBubble({ msg, onTruncate }: { msg: ChatMessage; onTruncate: (m: ChatMessage) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isUser = msg.role === 'user';
  const isReport = msg.meta?.report === true;
  const toolCount = msg.tool_events?.length ?? 0;

  if (isUser) {
    return (
      <Pressable onLongPress={() => onTruncate(msg)} style={{ alignSelf: 'flex-end', maxWidth: '86%' }}>
        <View style={{ backgroundColor: C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.35)', borderRadius: R.m, borderBottomRightRadius: 4, paddingHorizontal: 13, paddingVertical: 9 }}>
          <Text style={{ color: C.text, fontSize: 14, lineHeight: 21 }}>{msg.content}</Text>
        </View>
        {msg.created_at ? <Text style={{ color: C.text3, fontSize: 10, marginTop: 3, textAlign: 'right' }}>{fmtRelative(msg.created_at)}</Text> : null}
      </Pressable>
    );
  }

  const long = msg.content.length > 600;
  return (
    <Pressable onLongPress={() => onTruncate(msg)} style={{ alignSelf: 'flex-start', maxWidth: '92%', gap: 4 }}>
      <View
        style={{
          backgroundColor: isReport ? '#1A1508' : C.card,
          borderWidth: 1,
          borderColor: isReport ? 'rgba(229,181,88,0.45)' : C.borderSoft,
          borderLeftWidth: isReport ? 3 : 1,
          borderLeftColor: isReport ? C.gold : C.borderSoft,
          borderRadius: R.m,
          borderBottomLeftRadius: 4,
          paddingHorizontal: 13,
          paddingVertical: 10,
          gap: 6,
        }}
      >
        {isReport ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="document-text-outline" size={13} color={C.gold} />
            <Text style={{ color: C.gold, fontSize: 12, fontWeight: '800', flex: 1 }}>通读审稿报告</Text>
            {msg.meta?.interrupted ? <Chip label="中断" fg={C.seal} bg={C.sealSoft} /> : null}
          </View>
        ) : null}
        <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 21.5 }} numberOfLines={expanded || !long ? undefined : 18}>
          {msg.content}
        </Text>
        {long ? (
          <Pressable onPress={() => setExpanded(!expanded)} hitSlop={4}>
            <Text style={{ color: C.gold, fontSize: 11.5, fontWeight: '700' }}>{expanded ? '收起' : '展开全文'}</Text>
          </Pressable>
        ) : null}
      </View>
      {toolCount > 0 ? <ToolEventsBlock events={msg.tool_events} /> : null}
      {msg.created_at ? <Text style={{ color: C.text3, fontSize: 10 }}>{fmtRelative(msg.created_at)}</Text> : null}
    </Pressable>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const { api, logout } = useAuth();
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const [sessions, setSessions] = useState<ChatSession[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  /** 发送/重连期间的实时工具活动（done 后随增量拉取落到消息里） */
  const [liveEvents, setLiveEvents] = useState<ChatToolEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // 弹层：sessions=会话管理；settings=会话设置；readReview/findings/revisions 各功能面板
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readReviewOpen, setReadReviewOpen] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);
  const [renameText, setRenameText] = useState('');

  // 会话设置数据
  const [builtinSkills, setBuiltinSkills] = useState<ChatBuiltinSkill[] | null>(null);
  const [mySkills, setMySkills] = useState<UserSkillItem[] | null>(null);
  const [aiModels, setAiModels] = useState<AiModelConfig[] | null>(null);
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [draftModel, setDraftModel] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const insets = useSafeAreaInsets();
  const [kbH, setKbH] = useState(0);
  const { height: winH } = useWindowDimensions();

  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', (e) => setKbH(e.endCoordinates.height));
    const h = Keyboard.addListener('keyboardDidHide', () => setKbH(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const activeSession = useMemo(() => sessions?.find((s) => s.id === activeId) ?? null, [sessions, activeId]);

  const guard = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }
      toast(friendlyError(e));
    },
    [logout, toast],
  );

  const fetchDelta = useCallback(async () => {
    const sid = activeIdRef.current;
    if (!api || !sid) return;
    try {
      const list = await api.getChatMessages(projectId, sid, 0);
      // 请求期间可能已切换会话：旧结果丢弃
      if (activeIdRef.current !== sid) return;
      setMessages(list ?? []);
    } catch {
      // 增量失败不打断 UI，下一轮轮询再试
    }
  }, [api, projectId]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  /** busy 期间的轮询兜底：SSE 断开时按 3s 拉增量直到会话空闲 */
  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      if (!api || !activeId) return stopPolling();
      try {
        const list = await api.getChatMessages(projectId, activeId, 0);
        setMessages(list ?? []);
        const ss = await api.listChatSessions(projectId);
        setSessions(ss ?? []);
        if (!(ss ?? []).some((x) => x.id === activeId && x.busy)) stopPolling();
      } catch {
        // 网络抖动继续等下一轮
      }
    }, 3000);
  }, [api, projectId, activeId, stopPolling]);

  /** 订阅正在跑的一轮（发送时 409、或切到 busy 会话时接续直播）。
   *  定义在 openSession 之前（openSession 切到 busy 会话时要接流）。 */
  const attachLive = useCallback(
    async (sid: number) => {
      if (!api) return;
      setSending(true);
      setLiveEvents([]);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const r = await api.liveAttachSSE(
          projectId,
          sid,
          (ev) => setLiveEvents((prev) => [...prev, sseToToolEvent(ev)]),
          ac.signal,
        );
        if (r.error) toast(r.error);
        if (r.data && r.data.idle !== true) {
          const list = await api.getChatMessages(projectId, sid, 0).catch(() => null);
          if (list) setMessages(list);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status !== 401) {
          // SSE 断了但轮次在服务端后台继续跑 → 轮询兜底
          startPolling();
        } else {
          await guard(e);
        }
      } finally {
        setSending(false);
        // 实时活动块在增量拉取落库后清掉（否则与消息内的 tool_events 重复展示）
        await fetchDelta();
        setLiveEvents([]);
      }
    },
    [api, projectId, toast, startPolling, guard],
  );

  const openSession = useCallback(
    (sid: number, list?: ChatSession[]) => {
      stopPolling();
      abortRef.current?.abort();
      abortRef.current = null;
      activeIdRef.current = sid;
      setActiveId(sid);
      setMessages(null);
      setLiveEvents([]);
      // 只有带新列表时才覆盖（切换已有会话不清掉列表态）
      if (list !== undefined) setSessions(list);
      if (!api) return;
      api
        .getChatMessages(projectId, sid, 0)
        .then((m) => {
          if (activeIdRef.current === sid) setMessages(m ?? []);
        })
        .catch((e) => {
          if (activeIdRef.current === sid) setMessages([]);
          guard(e);
        });
      const sess = (list ?? sessions ?? []).find((s) => s.id === sid);
      if (sess?.busy) attachLive(sid);
    },
    [api, projectId, stopPolling, sessions, guard, attachLive],
  );

  /** 全量刷新（下拉/进入页面） */
  const reload = useCallback(
    async () => {
      if (!api || Number.isNaN(projectId)) return;
      try {
        const list = await api.listChatSessions(projectId);
        setSessions(list ?? []);
        const cur = activeIdRef.current;
        const target = cur && list?.some((s) => s.id === cur) ? cur : list?.[0]?.id ?? null;
        if (target !== cur) {
          openSession(target, list ?? undefined);
        }
      } catch (e) {
        await guard(e);
      }
    },
    [api, projectId, openSession, guard],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉会话列表（异步请求后 setState）
    reload();
    return () => {
      stopPolling();
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /** 自动滚到底：消息数或实时事件变化时 */
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages?.length, liveEvents.length, kbH]);

  const send = useCallback(async () => {
    if (!api || !activeId || sending) return;
    const text = input.trim();
    if (!text) return;
    setInput('');
    setSending(true);
    setLiveEvents([]);
    // 乐观用户气泡（负数临时 id，done 后增量拉取替换为真实消息）
    const optimistic: ChatMessage = { id: -Date.now(), session_id: activeId, role: 'user', content: text, tool_events: [], meta: {} };
    setMessages((prev) => [...(prev ?? []), optimistic]);
    // 409 转接实时流后 sending 由 attachLive 自己管理，finally 不再强制关
    let handedOff = false;
    try {
      const r = await api.sendChatMessageSSE(projectId, activeId, text, (ev) =>
        setLiveEvents((prev) => [...prev, sseToToolEvent(ev)]),
      );
      if (r.error) toast(`本轮处理失败：${r.error}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast('上一条还在处理中，已接续实时进度；这条消息保留在输入框，稍后再发');
        setInput(text);
        handedOff = true;
        attachLive(activeId);
      } else {
        toast(friendlyError(e));
        // 网络断开：轮次在服务端继续跑，转轮询兜底
        startPolling();
      }
    } finally {
      if (!handedOff) setSending(false);
      await fetchDelta();
      if (!handedOff) setLiveEvents([]);
    }
  }, [api, activeId, sending, input, projectId, toast, attachLive, startPolling, fetchDelta]);

  const createSession = useCallback(
    async (list?: ChatSession[]) => {
      if (!api) return;
      try {
        const s = await api.createChatSession(projectId);
        const next = [s, ...(list ?? sessions ?? [])];
        setSessions(next);
        openSession(s.id, next);
        toast('已新建会话');
      } catch (e) {
        await guard(e);
      }
    },
    [api, projectId, sessions, openSession, toast, guard],
  );

  const removeSession = useCallback(
    (s: ChatSession) => {
      if (!api) return;
      confirm({
        title: '删除会话',
        message: `删除「${s.title}」？会话内全部消息与发现清单将一并删除，不可恢复。`,
        confirmText: '删除',
        destructive: true,
        onConfirm: () => {
          api
            .deleteChatSession(projectId, s.id)
            .then(() => {
              const next = (sessions ?? []).filter((x) => x.id !== s.id);
              setSessions(next);
              if (activeId === s.id) {
                setActiveId(null);
                setMessages(null);
                if (next.length > 0) openSession(next[0].id, next);
              }
              toast('已删除');
            })
            .catch((e) => toast(friendlyError(e)));
        },
      });
    },
    [api, projectId, sessions, activeId, confirm, openSession, toast],
  );

  const truncateFrom = useCallback(
    (m: ChatMessage) => {
      if (!api || !activeId || m.id < 0) return;
      const idx = (messages ?? []).findIndex((x) => x.id === m.id);
      const count = (messages ?? []).length - Math.max(idx, 0);
      confirm({
        title: '从这里删除',
        message: `删除这条消息及其后的 ${count} 条？之后的对话将不再参考这些内容（截断重发）。`,
        confirmText: '删除',
        destructive: true,
        onConfirm: () => {
          api
            .deleteChatMessageFrom(projectId, activeId, m.id)
            .then(() => {
              fetchDelta();
              toast('已删除');
            })
            .catch((e) => toast(friendlyError(e)));
        },
      });
    },
    [api, projectId, activeId, messages, confirm, fetchDelta, toast],
  );

  // ===== 会话设置（技能 + 模型覆盖） =====
  const openSettings = useCallback(() => {
    if (!activeSession) return;
    setDraftSkills([...(activeSession.enabled_skills ?? [])]);
    setDraftModel(activeSession.model_override ?? '');
    setSettingsOpen(true);
    if (builtinSkills === null) {
      api?.getChatBuiltinSkills(projectId).then((l) => setBuiltinSkills(l ?? [])).catch(() => setBuiltinSkills([]));
    }
    if (mySkills === null) {
      api
        ?.getUserSkills()
        .then((l) => setMySkills((l ?? []).filter((s) => s.skill_type === 'custom' && s.is_enabled !== false)))
        .catch(() => setMySkills([]));
    }
    if (aiModels === null) {
      api?.getAiModels().then((l) => setAiModels(l ?? [])).catch(() => setAiModels([]));
    }
  }, [activeSession, api, projectId, builtinSkills, mySkills, aiModels]);

  const saveSettings = useCallback(() => {
    if (!api || !activeSession) return;
    api
      .updateChatSession(projectId, activeSession.id, { enabled_skills: draftSkills, model_override: draftModel })
      .then((s) => {
        setSessions((prev) => (prev ? prev.map((x) => (x.id === s.id ? s : x)) : prev));
        setSettingsOpen(false);
        toast('会话设置已保存');
      })
      .catch((e) => toast(friendlyError(e)));
  }, [api, activeSession, projectId, draftSkills, draftModel, toast]);

  /** 模型覆盖下拉选项：全部配置里出现过的模型名去重；默认档实际模型标注出来 */
  const modelOptions = useMemo(() => {
    const names = new Set<string>();
    for (const m of aiModels ?? []) {
      for (const v of [m.model, m.chat_model, m.generation_model]) {
        if (typeof v === 'string' && v.trim()) names.add(v.trim());
      }
    }
    const def = (aiModels ?? []).find((m) => m.is_default);
    const chatDefault = def?.chat_model || def?.generation_model || def?.model || '';
    const opts: { value: string; label: string; hint?: string }[] = [{ value: '', label: '跟随默认档', hint: chatDefault ? `当前：${chatDefault}` : undefined }];
    for (const n of names) {
      opts.push({ value: n, label: n === chatDefault ? `${n}（默认）` : n });
    }
    return opts;
  }, [aiModels]);

  if (Number.isNaN(projectId)) return null;

  const noSession = sessions !== null && sessions.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      {confirmNode}
      <FindingsSheet projectId={projectId} session={activeSession} visible={findingsOpen} onClose={() => setFindingsOpen(false)} onRefreshMessages={fetchDelta} />
      <ReadReviewSheet projectId={projectId} session={activeSession} visible={readReviewOpen} onClose={() => setReadReviewOpen(false)} />
      <RevisionsSheet projectId={projectId} visible={revisionsOpen} onClose={() => setRevisionsOpen(false)} />

      {/* 会话管理 */}
      <SheetModal visible={sessionsOpen} onClose={() => setSessionsOpen(false)} title="会话管理">
        <Pressable
          onPress={() => {
            setSessionsOpen(false);
            createSession();
          }}
          style={{ height: 44, borderRadius: R.m, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.4)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}
        >
          <Ionicons name="add" size={16} color={C.gold} />
          <Text style={{ color: C.gold, fontSize: 14, fontWeight: '700' }}>新对话</Text>
        </Pressable>
        {(sessions ?? []).map((s) => (
          <View
            key={s.id}
            style={{
              backgroundColor: s.id === activeId ? C.goldSoft : C.card,
              borderWidth: 1,
              borderColor: s.id === activeId ? 'rgba(229,181,88,0.4)' : C.borderSoft,
              borderRadius: R.m,
              padding: 12,
              gap: 8,
            }}
          >
            <Pressable onPress={() => { setSessionsOpen(false); openSession(s.id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                {s.title || '未命名会话'}
              </Text>
              {s.busy ? <Chip label="生成中" fg={C.blue} bg={C.blueSoft} bold /> : null}
              {s.id === activeId ? <Ionicons name="checkmark" size={15} color={C.gold} /> : null}
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: C.text3, fontSize: 11, flex: 1 }}>{s.updated_at ? `活跃于 ${fmtRelative(s.updated_at)}` : ''}</Text>
              <Pressable
                onPress={() => {
                  setRenameTarget(s);
                  setRenameText(s.title ?? '');
                }}
                hitSlop={6}
                style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="create-outline" size={14} color={C.text2} />
              </Pressable>
              <Pressable
                onPress={() => removeSession(s)}
                hitSlop={6}
                style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="trash-outline" size={14} color={C.seal} />
              </Pressable>
            </View>
          </View>
        ))}
        {noSession ? <Text style={{ color: C.text3, fontSize: 12.5, textAlign: 'center', paddingVertical: 10 }}>还没有会话，点上方「新对话」开始</Text> : null}
      </SheetModal>

      {/* 重命名 */}
      <SheetModal visible={renameTarget !== null} onClose={() => setRenameTarget(null)} title="重命名会话">
        <TextInput
          value={renameText}
          onChangeText={setRenameText}
          placeholder="会话名称"
          placeholderTextColor="#5A6170"
          keyboardAppearance="dark"
          style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, paddingHorizontal: 13, height: 44, color: C.text, fontSize: 14.5 }}
        />
        <Pressable
          onPress={() => {
            if (!api || !renameTarget) return;
            const title = renameText.trim();
            if (!title) return;
            api
              .updateChatSession(projectId, renameTarget.id, { title })
              .then((s) => {
                setSessions((prev) => (prev ? prev.map((x) => (x.id === s.id ? s : x)) : prev));
                setRenameTarget(null);
                toast('已重命名');
              })
              .catch((e) => toast(friendlyError(e)));
          }}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>保存</Text>
        </Pressable>
      </SheetModal>

      {/* 会话设置：技能加载 + 模型覆盖 */}
      <SheetModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} title={`会话设置 · ${activeSession?.title ?? ''}`}>
        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }}>选中的技能提示词会注入本会话每轮对话（内置推荐为审稿向技能）</Text>
        <View style={{ gap: 8 }}>
          <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>内置推荐</Text>
          {(builtinSkills ?? []).map((s) => (
            <SkillToggleRow key={s.name} label={s.display_name} hint={s.prompt?.slice(0, 60)} on={draftSkills.includes(s.name)} onChange={(v) => setDraftSkills((d) => (v ? [...d, s.name] : d.filter((x) => x !== s.name)))} />
          ))}
          {builtinSkills === null ? <ActivityIndicator color={C.gold} /> : null}
        </View>
        {mySkills && mySkills.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>我的技能</Text>
            {mySkills.map((s) => (
              <SkillToggleRow key={s.name} label={s.display_name || s.name} hint={s.description ?? undefined} on={draftSkills.includes(s.name)} onChange={(v) => setDraftSkills((d) => (v ? [...d, s.name] : d.filter((x) => x !== s.name)))} />
            ))}
          </View>
        ) : null}
        {/* modelOptions 在下方 SelectField 用；这里自绘下拉行数太多，借用简单列表 */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>本会话模型</Text>
          <View style={{ gap: 4 }}>
            {modelOptions.map((o) => {
              const on = draftModel === o.value;
              return (
                <Pressable
                  key={o.value || '__default__'}
                  onPress={() => setDraftModel(o.value)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 13, borderRadius: R.m, backgroundColor: on ? C.goldSoft : 'transparent', borderWidth: 1, borderColor: on ? 'rgba(229,181,88,0.4)' : 'transparent' }}
                >
                  <View style={{ width: 19, height: 19, borderRadius: 7, borderWidth: 1.5, borderColor: on ? C.gold : '#3A4258', backgroundColor: on ? C.gold : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Ionicons name="checkmark" size={12} color="#1A1206" /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ color: on ? C.gold : C.text, fontSize: 14, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
                    {o.hint ? <Text style={{ color: C.text3, fontSize: 11 }}>{o.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            {aiModels === null ? <ActivityIndicator color={C.gold} /> : null}
          </View>
        </View>
        <Pressable onPress={saveSettings} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>保存设置</Text>
        </Pressable>
      </SheetModal>

      <View style={{ paddingHorizontal: SP.l, paddingTop: 10, gap: 12, flex: 1 }}>
        <ScreenHeader
          title="AI 助手"
          subtitle={activeSession ? activeSession.title : '查资料 · 审稿 · 按指令修改正文'}
          onBack={() => router.back()}
        />

        {/* 功能入口行（横向 ScrollView 必须 flexGrow:0，否则空列表时把剩余高度吞掉） */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {[
            { key: 'review', label: '通读审稿', icon: 'document-text-outline' as const, on: () => setReadReviewOpen(true), disabled: !activeSession },
            { key: 'findings', label: '发现清单', icon: 'alert-circle-outline' as const, on: () => setFindingsOpen(true), disabled: !activeSession },
            { key: 'revisions', label: '修改记录', icon: 'time-outline' as const, on: () => setRevisionsOpen(true) },
            { key: 'sessions', label: '会话', icon: 'chatbubbles-outline' as const, on: () => setSessionsOpen(true) },
            { key: 'settings', label: '会话设置', icon: 'options-outline' as const, on: openSettings, disabled: !activeSession },
          ].map((b) => (
            <Pressable
              key={b.key}
              onPress={b.on}
              disabled={b.disabled}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                backgroundColor: pressed ? C.card2 : C.card,
                borderWidth: 1,
                borderColor: C.borderSoft,
                opacity: b.disabled ? 0.45 : 1,
              })}
            >
              <Ionicons name={b.icon} size={14} color={C.gold} />
              <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '600' }}>{b.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* 消息流 */}
        {noSession ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              icon="chatbubbles-outline"
              title="还没有对话"
              sub="AI 助手能查阅设定与正文、通读审稿找出问题，还能按你的指令直接修改章节"
            />
            <Pressable
              onPress={() => createSession()}
              style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginHorizontal: 20 }}
            >
              <Ionicons name="add" size={17} color="#1A1206" />
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>开始新对话</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 14, paddingBottom: 14 }}
            keyboardDismissMode="interactive"
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.gold} colors={[C.gold]} onRefresh={async () => { setRefreshing(true); await reload(); await fetchDelta(); setRefreshing(false); }} />}
          >
            {messages === null ? (
              <Skeleton count={4} height={72} />
            ) : (
              <>
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} onTruncate={truncateFrom} />
                ))}
                {liveEvents.length > 0 ? (
                  <View style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, borderBottomLeftRadius: 4, padding: 10, gap: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {sending ? <ActivityIndicator size="small" color={C.gold} /> : <Ionicons name="checkmark-done-outline" size={13} color={C.gold} />}
                      <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700' }}>{sending ? '思考与调用工具中…' : '本轮活动'}</Text>
                    </View>
                    {liveEvents.slice(-6).map((ev, i) => (
                      <ToolEventRow key={i} ev={ev} />
                    ))}
                  </View>
                ) : null}
                {messages.length === 0 && liveEvents.length === 0 ? (
                  <EmptyState icon="sparkles-outline" title="问点什么吧" sub="例如：帮我查主角的人际关系 / 第 3 章节奏怎么样 / 把第 5 章开头改得更抓人" />
                ) : null}
              </>
            )}
          </ScrollView>
        )}

        {/* 输入区。edge-to-edge 下 adjustResize 不压缩窗口，键盘高度垫在本 wrapper 底部、
            挤压缩上方的消息 ScrollView，把输入卡整体抬到键盘上方（编辑器 v1.9.1 同款思路）；
            卡片 maxHeight 用固定上限——不能减键盘高度，真机键盘(~300dp) > 0.3×屏高会减出
            负值/过小值导致卡片塌陷被裁（v2.0.0 真机复现：发送按钮剩一半、字数计数不见）。 */}
        {activeSession ? (
          <View style={{ paddingBottom: Math.max(kbH, insets.bottom), gap: 8 }}>
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.l, padding: 9, gap: 8, maxHeight: Math.round(winH * 0.26) }}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={sending ? 'AI 正在处理…' : '发消息，Enter 换行'}
                placeholderTextColor="#5A6170"
                keyboardAppearance="dark"
                multiline
                blurOnSubmit={false}
                onSubmitEditing={() => send()}
                style={{ color: C.text, fontSize: 14.5, lineHeight: 21, paddingHorizontal: 6, maxHeight: Math.round(winH * 0.16) }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text3, fontSize: 11, flex: 1 }}>{input.length > 8000 ? `超出上限（${input.length}/8000）` : `${input.length}/8000`}</Text>
                <Pressable
                  onPress={send}
                  disabled={sending || !input.trim() || input.length > 8000}
                  style={({ pressed }) => ({
                    height: 38,
                    paddingHorizontal: 20,
                    borderRadius: 13,
                    backgroundColor: C.gold,
                    opacity: sending || !input.trim() || input.length > 8000 ? 0.45 : pressed ? 0.85 : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  })}
                >
                  {sending ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="arrow-up" size={15} color="#1A1206" />}
                  <Text style={{ color: '#1A1206', fontSize: 14, fontWeight: '800' }}>{sending ? '处理中' : '发送'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

/** 技能勾选行（会话设置） */
function SkillToggleRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.m, backgroundColor: on ? C.goldSoft : 'transparent', borderWidth: 1, borderColor: on ? 'rgba(229,181,88,0.4)' : 'transparent' }}
    >
      <View style={{ width: 19, height: 19, borderRadius: 7, borderWidth: 1.5, borderColor: on ? C.gold : '#3A4258', backgroundColor: on ? C.gold : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Ionicons name="checkmark" size={12} color="#1A1206" /> : null}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: on ? C.gold : C.text, fontSize: 13.5, fontWeight: on ? '700' : '500' }} numberOfLines={1}>
          {label}
        </Text>
        {hint ? <Text style={{ color: C.text3, fontSize: 11, lineHeight: 15 }} numberOfLines={2}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
