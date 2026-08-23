import type { Api, TaskItem } from './api';
import { ApiError } from './api';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 轮询后台任务直到完成/失败/取消（用于「提示词→出图」这类链式操作的中间步骤）。
 * onTick 每 intervalMs 带回任务状态（可显示进度文案）。
 */
export async function pollTask(
  api: Api,
  taskId: number,
  opts?: { intervalMs?: number; timeoutMs?: number; onTick?: (t: TaskItem) => void },
): Promise<TaskItem> {
  const intervalMs = opts?.intervalMs ?? 5000;
  const deadline = Date.now() + (opts?.timeoutMs ?? 20 * 60 * 1000);
  // 先等一小段再开始查，给任务启动留时间
  await sleep(1500);
  while (Date.now() < deadline) {
    const t = await api.getTask(taskId);
    if (t.status === 'completed') return t;
    if (t.status === 'failed' || t.status === 'cancelled') {
      throw new ApiError(0, t.error || `任务已${t.status === 'failed' ? '失败' : '取消'}`);
    }
    opts?.onTick?.(t);
    await sleep(intervalMs);
  }
  throw new ApiError(0, '任务超时未完成，可到任务页查看');
}
