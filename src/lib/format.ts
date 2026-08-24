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

/**
 * 解析服务端时间戳为毫秒。后端用 datetime.utcnow + isoformat 输出 naive UTC
 * （形如 2026-08-25T02:30:00，不带 Z），new Date 会误按本地时区解析导致差出时区偏移，
 * 这里无时区标记时统一补 Z；纯日期字符串（无 T）仍按本地零点处理。
 */
function parseServerTime(iso: string): number {
  if (!iso.includes('T')) return new Date(`${iso}T00:00:00`).getTime();
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  // isoformat 可能带 6 位微秒，超出 JS 毫秒精度，截到 3 位
  const s = iso.replace(/(\.\d{3})\d+/, '$1');
  return new Date(hasTz ? s : `${s}Z`).getTime();
}

/** 相对时间 */
export function fmtRelative(iso?: string | null): string {
  if (!iso) return '';
  const t = parseServerTime(iso);
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

/** 本地时区日期 YYYY-MM-DD */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const t = parseServerTime(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  const d = new Date(t);
  const pad = (x: number) => `${x}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
