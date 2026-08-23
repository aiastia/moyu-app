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
  cover_prompt?: string | null;
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
  /** 服务端是 JSON 数组（list[str]）；历史数据/网页端手填的可能是换行分隔字符串，两种都兼容 */
  key_points?: string[] | string | null;
  /** 服务端全量字段，编辑保存时需原样回传（PUT 是全量覆盖语义，漏传会被默认空值清掉） */
  scenes?: unknown[] | null;
  characters?: unknown[] | null;
  organizations?: unknown[] | null;
  structure?: Record<string, unknown> | null;
}

export interface CharacterItem {
  id: number;
  name: string;
  role: string;
  gender?: string | null;
  age?: string | null;
  identity?: string | null;
  appearance?: string | null;
  personality?: string | null;
  background?: string | null;
  growth_experience?: string | null;
  ability?: string | null;
  story_goal?: string | null;
  motivation?: string | null;
  weakness?: string | null;
  arc_type?: string | null;
  character_change?: string | null;
  speech_style?: string | null;
  status?: string | null;
  mental_state?: string | null;
  main_career_id?: number | null;
  main_career_stage?: number | null;
  main_career_stage_desc?: string | null;
  sub_careers?: unknown[] | null;
  organization_id?: number | null;
  reference_image?: string | null;
  reference_prompt?: string | null;
}

export interface TaskItem {
  id: number;
  project_id?: number | null;
  task_type: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling' | string;
  progress: number;
  status_message?: string | null;
  cancel_requested?: boolean;
  error?: string | null;
  stage?: string | null;
  queue_position?: number | null;
  started_at?: string | null;
  retry_count?: number | null;
  max_retries?: number | null;
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

export interface CharacterBody {
  name: string;
  role?: string;
  gender?: string;
  age?: string;
  identity?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  ability?: string;
  story_goal?: string;
  motivation?: string;
  weakness?: string;
  speech_style?: string;
  mental_state?: string;
  arc_type?: string;
  character_change?: string;
  growth_experience?: string;
  status?: string;
  /** 以下为服务端 CharacterCreate 的全量字段：PUT 是全量覆盖语义，编辑时必须原样回传 */
  main_career_id?: number | null;
  main_career_stage?: number;
  main_career_stage_desc?: string;
  sub_careers?: unknown[];
  organization_id?: number | null;
}

export interface ForeshadowBody {
  title: string;
  content?: string;
  foreshadow_type?: string;
  status?: string;
  source_type?: string;
  priority?: number;
  plant_chapter_number?: number | null;
  target_resolve_chapter_number?: number | null;
  /** 扩展字段：关联角色/暗示文本/备注/长线伏笔等（与网页端同口径存 structure JSON） */
  structure?: Record<string, unknown>;
}

/** 核心世界观（存于 Project 上的四维度设定，网页端世界观页第一张卡） */
export interface WorldCore {
  world_time_period: string;
  world_location: string;
  world_atmosphere: string;
  world_rules: string;
}

/** 项目元信息编辑（网页端仪表盘「项目信息卡」同款字段；status 用于归档/恢复） */
export interface ProjectUpdateBody {
  title?: string;
  genre?: string;
  synopsis?: string;
  narrative_pov?: string;
  target_word_count?: number;
  target_platform?: string;
  pen_name?: string;
  status?: string;
}

export const FORESHADOW_STATUS_LABEL: Record<string, string> = {
  pending: '计划中',
  planted: '已埋入',
  resolved: '已回收',
  partially_resolved: '部分回收',
  missed: '漏埋',
  abandoned: '已放弃',
};

/** 角色生死状态 → 展示文案（网页端角色卡同款） */
export const CHARACTER_STATUS_LABEL: Record<string, string> = {
  alive: '存活',
  dead: '死亡',
  missing: '失踪',
  unknown: '未知',
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

  getBooks(opts?: { archived?: boolean }) {
    return this.req<Book[]>(`/api/books${opts?.archived ? '?archived=true' : ''}`);
  }

  getProject(id: number) {
    return this.req<ProjectDetail>(`/api/projects/${id}`);
  }

  /** 编辑项目元信息（书名/笔名/题材/视角/目标平台/字数/简介），status 传 archived/active 做归档恢复 */
  updateProject(id: number, body: ProjectUpdateBody) {
    return this.req<{ ok: boolean }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  getChapters(projectId: number) {
    return this.req<ChapterRow[]>(`/api/projects/${projectId}/chapters`);
  }

  getChapter(projectId: number, chapterId: number) {
    return this.req<ChapterFull>(`/api/projects/${projectId}/chapters/${chapterId}`);
  }

  updateChapter(projectId: number, chapterId: number, body: { title?: string; content?: string; status?: string }) {
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

  /** 更新大纲。服务端 PUT 按 OutlineCreate 全量覆盖：scenes/characters/structure 等
   *  未编辑字段必须原样回传，否则会被空默认值清掉（网页端 onSave 同一口径）。 */
  updateOutline(
    projectId: number,
    outlineId: number,
    body: {
      chapter_number: number;
      title?: string;
      summary?: string;
      emotion?: string;
      goal?: string;
      key_points?: string[];
      scenes?: unknown[];
      characters?: unknown[];
      organizations?: unknown[];
      structure?: Record<string, unknown>;
    },
  ) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/outlines/${outlineId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
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

  /** 重试失败任务，返回新任务 id */
  retryTask(taskId: number) {
    return this.req<{ task_id: number }>(`/api/tasks/${taskId}/retry`, { method: 'POST' });
  }

  deleteTask(taskId: number) {
    return this.req<unknown>(`/api/tasks/${taskId}`, { method: 'DELETE' });
  }

  clearCompletedTasks() {
    return this.req<{ ok: boolean; deleted: number }>(`/api/tasks/clear-completed`, { method: 'POST' });
  }

  // ===== 角色 =====
  createCharacter(projectId: number, body: CharacterBody) {
    return this.req<{ id: number }>(`/api/projects/${projectId}/characters`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** 编辑角色。服务端 PUT 按 CharacterCreate 全量覆盖：网页端设置的职业境界/所属组织/
   *  成长经历等 App 表单没有的字段，调用方必须从列表数据原样带回，否则会被默认空值清掉。 */
  updateCharacter(projectId: number, characterId: number, body: CharacterBody) {
    return this.req<unknown>(`/api/projects/${projectId}/characters/${characterId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteCharacter(projectId: number, characterId: number) {
    return this.req<unknown>(`/api/projects/${projectId}/characters/${characterId}`, { method: 'DELETE' });
  }

  /** AI 批量生成角色（异步任务，返回 task_id）。role 空=AI 自由分配 */
  generateCharactersAsync(projectId: number, body: { count: number; role?: string; requirements?: string }) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/characters/batch-generate-async`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
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

  // ===== 核心世界观（时间/地点/氛围/规则，存于 Project） =====
  getWorldCore(projectId: number) {
    return this.req<WorldCore>(`/api/projects/${projectId}/world-core`);
  }

  /** 手动编辑核心世界观（四字段部分更新，服务端只改传入的键） */
  updateWorldCore(projectId: number, body: Partial<WorldCore>) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/world-core`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /** AI 重新生成核心世界观（异步任务，返回 task_id；会覆盖现有四项） */
  generateWorldCoreAsync(projectId: number) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/world-core/generate-async`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** AI 生成详细世界设定条目（同步接口，AI 跑完才返回，调用方需 loading 态） */
  generateWorlds(projectId: number, body: { idea?: string }) {
    return this.req<{ count: number; items: { name: string; category: string }[] }>(`/api/projects/${projectId}/worlds/generate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
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

  /** 编辑伏笔。服务端 PUT 按 ForeshadowCreate 全量覆盖：status/source_type/structure
   *  未回传会被重置（状态退回计划中、来源变手动），编辑时必须从原数据带回。 */
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

  /** AI 自动规划伏笔（异步任务）。source: outline=基于大纲 / blueprint=基于蓝图；chapterRange 限定章号范围 */
  planForeshadowsAsync(projectId: number, source: 'outline' | 'blueprint', chapterRange?: [number, number] | null) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/foreshadows/plan/async`, {
      method: 'POST',
      body: JSON.stringify({ source, chapter_range: chapterRange ?? null }),
    });
  }

  /** 单个任务详情（轮询用） */
  getTask(taskId: number) {
    return this.req<TaskItem>(`/api/tasks/${taskId}`);
  }

  /** 一键连写：循环「大纲→正文」直到写满 total_chapters */
  startAutoWrite(
    projectId: number,
    body: { total_chapters: number; batch_size?: number; enable_analysis?: boolean; enable_polish?: boolean; story_direction?: string },
  ) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/auto-write/start`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ===== 封面 =====
  /** AI 生成封面提示词（异步任务，结果写进 project.cover_prompt） */
  coverPromptAsync(projectId: number) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/cover/generate-prompt`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** 用提示词生成封面图片（异步任务，结果通过 cover/image 查看） */
  coverImageAsync(projectId: number, prompt: string, size = '1024x1536') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/cover/generate-image`, {
      method: 'POST',
      body: JSON.stringify({ prompt, size }),
    });
  }

  // ===== 角色立绘 =====
  portraitPromptAsync(projectId: number, characterId: number, body: { style: string; view: string; extra_requirements?: string }) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/characters/${characterId}/portrait/generate-prompt`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  portraitImageAsync(projectId: number, characterId: number, prompt: string, size = '1024x1536') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/characters/${characterId}/portrait/generate-image`, {
      method: 'POST',
      body: JSON.stringify({ prompt, size }),
    });
  }

  deletePortraitImage(projectId: number, characterId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/characters/${characterId}/portrait/image`, { method: 'DELETE' });
  }

  portraitUrl(characterId: number) {
    return `${this.baseUrl}/api/portraits/${characterId}/image`;
  }

  coverUrl(projectId: number) {
    return `${this.baseUrl}/api/projects/${projectId}/cover/image`;
  }
}
