/** 字数格式化：12345 -> "1.2万" */
export function fmtWords(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '0字';
  if (n < 10000) return `${n}字`;
  const w = n / 10000;
  return `${w >= 100 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')}万字`;
}

export function fmtPercent(cur?: number | null, target?: number | null): number {
  if (!target || target <= 0 || cur == null) return 0;
  return Math.min(100, Math.round((cur / target) * 100));
}

/** 相对时间 */
export function fmtRelative(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}天前`;
  const d = new Date(t);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const pad = (x: number) => `${x}`.padStart(2, '0');
  return sameYear ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const STORY_KIND_LABEL: Record<string, string> = { long: '长篇', short: '短篇' };

export const STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  cancelling: '取消中',
};
