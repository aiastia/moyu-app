/** 墨鱼写作系统 REST API 客户端（对接自部署服务端） */

export interface Book {
  id: number;
  title: string;
  cover?: string | null;
  desc?: string | null;
  chapter_count: number;
  written_chapter_count: number;
  target_word_count: number;
  current_word_count: number;
  updated?: string | null;
  tag?: string | null;
  status?: string | null;
  type?: string | null;
  story_kind: 'long' | 'short' | string;
  outline_mode?: string;
}

export interface ProjectDetail {
  id: number;
  title: string;
  genre: string;
  synopsis?: string | null;
  status?: string | null;
  story_kind: string;
  target_word_count: number;
  current_word_count: number;
  chapter_count: number;
  narrative_pov?: string | null;
  pen_name?: string | null;
  target_platform?: string | null;
  is_fanfic?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ChapterRow {
  id: number;
  chapter_number: number;
  title: string;
  word_count: number;
  status: string;
  quality_score?: number | null;
  summary?: string | null;
  can_generate?: boolean;
  generate_disabled_reason?: string | null;
}

export interface ChapterFull {
  id: number;
  chapter_number: number;
  title: string;
  content: string;
  word_count: number;
  status: string;
  summary?: string | null;
  quality_score?: number | null;
}

export interface NavNeighbor {
  id: number;
  chapter_number: number;
  title: string;
}

export interface ChapterNav {
  current: NavNeighbor;
  previous: NavNeighbor | null;
  next: NavNeighbor | null;
}

export interface OutlineItem {
  id: number;
  chapter_number: number;
  title: string;
  summary?: string | null;
  emotion?: string | null;
  goal?: string | null;
}

export interface CharacterItem {
  id: number;
  name: string;
  role: string;
  gender?: string | null;
  identity?: string | null;
  appearance?: string | null;
  personality?: string | null;
  background?: string | null;
  status?: string | null;
}

export interface TaskItem {
  id: number;
  project_id?: number | null;
  task_type: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling' | string;
  progress: number;
  status_message?: string | null;
  error?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}

export interface LoginUser {
  id: number;
  username: string;
  nickname?: string | null;
  is_admin?: boolean;
}

export interface WorldItem {
  id: number;
  name: string;
  category: string;
  content: string;
}

export interface ForeshadowItem {
  id: number;
  title: string;
  content: string;
  foreshadow_type: string;
  status: string;
  source_type: string;
  plant_chapter_number?: number | null;
  actual_plant_chapter?: number | null;
  target_resolve_chapter_number?: number | null;
  actual_resolve_chapter?: number | null;
  priority: number;
  structure?: Record<string, unknown>;
}

export interface CreateProjectBody {
  title: string;
  genre?: string;
  synopsis?: string;
  target_word_count?: number;
  narrative_pov?: string;
  story_kind?: string;
  pen_name?: string;
  target_platform?: string;
}

export interface ForeshadowBody {
  title: string;
  content?: string;
  foreshadow_type?: string;
  priority?: number;
  plant_chapter_number?: number | null;
  target_resolve_chapter_number?: number | null;
}

export const FORESHADOW_STATUS_LABEL: Record<string, string> = {
  pending: '计划中',
  planted: '已埋入',
  resolved: '已回收',
  partial: '部分回收',
  abandoned: '已放弃',
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeBaseUrl(raw: string): string {
  let u = raw.trim().replace(/\s+/g, '');
  if (!u) throw new Error('请填写服务器地址');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/\/+$/, '');
  u = u.replace(/\/api$/i, '');
  return u;
}

export async function loginRequest(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ access_token: string; user: LoginUser }> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401 || res.status === 400 || res.status === 422) {
    let msg = '用户名或密码错误';
    try {
      const j = await res.json();
      if (j?.detail && typeof j.detail === 'string') msg = j.detail;
    } catch { /* keep default */ }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 404 || res.status === 405) {
    throw new ApiError(res.status, '该地址没有找到登录接口，请确认服务器地址是否正确');
  }
  if (!res.ok) {
    throw new ApiError(res.status, `服务器返回 ${res.status}，请稍后再试`);
  }
  const data = await res.json();
  if (!data?.access_token) throw new ApiError(0, '服务器响应异常：缺少 token');
  return { access_token: data.access_token, user: data.user ?? { id: 0, username } };
}

export class Api {
  constructor(
    private baseUrl: string,
    public readonly token: string,
  ) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 401) throw new ApiError(401, '登录已过期，请重新登录');
    if (!res.ok) {
      let msg = `请求失败（${res.status}）`;
      try {
        const j = await res.json();
        if (j?.detail && typeof j.detail === 'string') msg = j.detail;
      } catch { /* keep default */ }
      throw new ApiError(res.status, msg);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  getBooks() {
    return this.req<Book[]>('/api/books');
  }

  getProject(id: number) {
    return this.req<ProjectDetail>(`/api/projects/${id}`);
  }

  getChapters(projectId: number) {
    return this.req<ChapterRow[]>(`/api/projects/${projectId}/chapters`);
  }

  getChapter(projectId: number, chapterId: number) {
    return this.req<ChapterFull>(`/api/projects/${projectId}/chapters/${chapterId}`);
  }

  updateChapter(projectId: number, chapterId: number, body: { title?: string; content?: string }) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/chapters/${chapterId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  getChapterNav(projectId: number, chapterId: number) {
    return this.req<ChapterNav>(`/api/projects/${projectId}/chapters/${chapterId}/navigation`);
  }

  getOutlines(projectId: number) {
    return this.req<OutlineItem[]>(`/api/projects/${projectId}/outlines`);
  }

  getCharacters(projectId: number) {
    return this.req<CharacterItem[]>(`/api/projects/${projectId}/characters`);
  }

  getTasks(opts?: { status?: string; projectId?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (opts?.status) q.set('status', opts.status);
    if (opts?.projectId) q.set('project_id', String(opts.projectId));
    q.set('limit', String(opts?.limit ?? 100));
    return this.req<TaskItem[]>(`/api/tasks?${q.toString()}`);
  }

  cancelTask(taskId: number) {
    return this.req<unknown>(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
  }

  /** 提交单章正文生成（异步任务，返回 task_id） */
  generateChapter(projectId: number, chapterId: number) {
    return this.req<{ task_id: number; chapter_id?: number }>(`/api/projects/${projectId}/chapters/${chapterId}/generate-async`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** 续写大纲（在已有大纲之后追加 N 章） */
  continueOutlines(projectId: number, chapterCount: number) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/outlines/continue-async`, {
      method: 'POST',
      body: JSON.stringify({ chapter_count: chapterCount }),
    });
  }

  /** 生成大纲（全书还没有大纲时） */
  generateOutlines(projectId: number, chapterCount: number) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/outlines/generate-async`, {
      method: 'POST',
      body: JSON.stringify({ chapter_count: chapterCount }),
    });
  }

  /** 创建新书 */
  createProject(body: CreateProjectBody) {
    return this.req<{ id: number; title: string }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ===== 世界观 =====
  getWorlds(projectId: number) {
    return this.req<WorldItem[]>(`/api/projects/${projectId}/worlds`);
  }

  createWorld(projectId: number, body: { name: string; category?: string; content?: string }) {
    return this.req<{ id: number }>(`/api/projects/${projectId}/worlds`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateWorld(projectId: number, worldId: number, body: { name: string; category?: string; content?: string }) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/worlds/${worldId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteWorld(projectId: number, worldId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/worlds/${worldId}`, { method: 'DELETE' });
  }

  getWorldCategories(projectId: number) {
    return this.req<{ categories: string[] }>(`/api/projects/${projectId}/worlds/categories`);
  }

  // ===== 伏笔 =====
  getForeshadows(projectId: number, status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.req<ForeshadowItem[]>(`/api/projects/${projectId}/foreshadows${q}`);
  }

  createForeshadow(projectId: number, body: ForeshadowBody) {
    return this.req<{ id: number }>(`/api/projects/${projectId}/foreshadows`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateForeshadow(projectId: number, foreshadowId: number, body: ForeshadowBody) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/foreshadows/${foreshadowId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteForeshadow(projectId: number, foreshadowId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/foreshadows/${foreshadowId}`, { method: 'DELETE' });
  }

  markForeshadowPlanted(projectId: number, foreshadowId: number, chapterNumber: number, hintText = '') {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/foreshadows/${foreshadowId}/plant`, {
      method: 'POST',
      body: JSON.stringify({ chapter_number: chapterNumber, hint_text: hintText }),
    });
  }

  markForeshadowResolved(projectId: number, foreshadowId: number, chapterNumber: number, resolutionText = '', isPartial = false) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/foreshadows/${foreshadowId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ chapter_number: chapterNumber, resolution_text: resolutionText, is_partial: isPartial }),
    });
  }

  abandonForeshadow(projectId: number, foreshadowId: number, reason = '') {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/foreshadows/${foreshadowId}/abandon`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  /** AI 自动规划伏笔（异步任务）。source: outline=基于大纲 / blueprint=基于蓝图 */
  planForeshadowsAsync(projectId: number, source: 'outline' | 'blueprint') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/foreshadows/plan/async`, {
      method: 'POST',
      body: JSON.stringify({ source }),
    });
  }

  coverUrl(projectId: number) {
    return `${this.baseUrl}/api/projects/${projectId}/cover/image`;
  }
}
