/** 墨鱼写作系统 REST API 客户端（对接自部署服务端） */

import { postSSE, type PostSSEOptions } from './sse';

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
  /** 后端与 tag 同值的类型原文（tag 是兜底"其他"后的值，搜索用 genre 原文） */
  genre?: string | null;
  status?: string | null;
  /** 归档书专有：归档前的连载状态（settings 暂存）；旧归档数据/在架书为 null（展示兜底连载中） */
  pre_archive_status?: string | null;
  type?: string | null;
  story_kind: 'long' | 'short' | string;
  outline_mode?: string;
  /** 投稿摘要（服务端 settings.submissions 的紧凑投影：计数 + 去重平台名，最多 5 个） */
  submissions?: { count: number; platforms: string[] } | null;
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
  /** 大纲模式：one_to_one（一章一卷）/ one_to_many（一卷展开 N 章） */
  outline_mode?: string;
  /** 当前绑定的写作风格（服务端存对象：{style_id, name, custom_prompt, …}，展示用 name） */
  writing_style?: { style_id?: number; name?: string; [k: string]: unknown } | null;
  /** 封面提示词列表（≤5 条，列表制权威数据；cover_prompt 恒=列表第一条=最旧一条，生成新词要读这里） */
  cover_prompts?: CoverPromptItem[] | null;
  /** 封面保留画廊（≤5 张，图片与提示词成对存档） */
  cover_gallery?: CoverGalleryEntry[] | null;
  /** 短篇故事卡（短篇项目才有，长篇为 null） */
  story_card?: StoryCard | null;
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
  /** 1→N 卷→章模式下子章节的序号（如 3.1、3.2 里的 1、2） */
  sub_index?: number | null;
  generation_mode?: string;
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
  /** 润色前的原文（没润色过为空；整章润色会覆盖 content，原文存这里可回滚） */
  raw_output?: string | null;
  raw_word_count?: number | null;
  /** 短篇整篇审稿结果（短篇项目跑过「短篇审稿」任务后有值，JSON 结构见 ShortReview） */
  short_review?: ShortReview | null;
}

// ===== 短篇（story_kind 三值：long=长篇连载 / short=多章短篇 / single=单章成篇） =====

/** 短篇故事卡（八字段，存 project.settings.story_card；结局为空时网页工作台禁止生成——结局先行） */
export interface StoryCard {
  premise?: string;
  hook?: string;
  protagonist?: string;
  goal?: string;
  conflict?: string;
  antagonist?: string;
  twist?: string;
  ending?: string;
  [k: string]: unknown;
}

/** 短篇审稿三标准的单条意见（severity: high/mid/low） */
export interface ShortReviewIssue {
  issue?: string;
  severity?: string;
  suggestion?: string;
  mode?: string;
}

/** 短篇整篇审稿结果（单章存 chapter.short_review，多章全书存 project.settings.short_review_book，结构相同） */
export interface ShortReview {
  verdict?: 'pass' | 'revise' | string;
  overall_score?: number;
  three_lines?: ShortReviewIssue | null;
  information_gap?: ShortReviewIssue | null;
  ending?: ShortReviewIssue | null;
  segment_notes?: { seg_index?: number; issue?: string; suggestion?: string }[] | null;
  summary?: string;
}

/** 段行（短篇分段写作的一等公民；章正文 = 各段拼接的合并缓存） */
export interface ChapterSegmentRow {
  id: number;
  seg_index: number;
  /** 段功能标签（如 铺垫/反转/收束，由结构图规划） */
  function?: string | null;
  /** 本段写作指令 */
  instruction?: string | null;
  /** 预算字数 */
  words?: number | null;
  content: string;
  status: string;
  word_count: number;
}

export interface ChapterSegments {
  chapter_id: number;
  chapter_status: string;
  word_count: number;
  segments: ChapterSegmentRow[];
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
  /** 1→N 模式：该卷是否已展开成章 / 展开的章数 */
  has_chapters?: boolean;
  chapter_count?: number;
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
  /** 别名/称呼列表（与 name 一起在正文里召回该角色）；NULL=未设置 */
  aliases?: string[] | null;
  /** 多套装扮（[{name, description}]，立绘/封面按名选装）；NULL/空=未设置（按档案外貌出图） */
  outfits?: CharacterOutfit[] | null;
  /** 立绘保留画廊（出图/上传自动入档；每视角本地 ≤5 条 + 外链不限） */
  portrait_gallery?: PortraitGalleryEntry[] | null;
  /** 立绘提示词版本列表（≤5 条；reference_prompt 兼容字段=工作字段恒最新） */
  portrait_prompts?: PortraitPromptItem[] | null;
}

/** 立绘提示词版本条目（三实体 portrait_prompts，最多 5 条；view 为可选视角标注 single/turnaround） */
export interface PortraitPromptItem {
  id: string;
  content: string;
  view?: string;
  rating?: number;
  created_at?: string;
}

/** 立绘画廊条目（出图/上传/外链自动入档，prompt_id 关联「出自版本N」） */
export interface PortraitGalleryEntry {
  id: string;
  view?: string;
  prompt?: string;
  prompt_id?: string;
  image?: string;
  created_at?: string;
}

/** 立绘宿主实体（角色/物品/地点三实体立绘面板共用最小形状） */
export interface PortraitEntity {
  id: number;
  name: string;
  reference_image?: string | null;
  reference_prompt?: string | null;
  portrait_gallery?: PortraitGalleryEntry[] | null;
  portrait_prompts?: PortraitPromptItem[] | null;
  outfits?: CharacterOutfit[] | null;
}

/** 立绘实体类型：决定 REST 路径段与全局图片端点前缀 */
export type PortraitKind = 'character' | 'item' | 'location';

/** 角色装扮条目（服务端 normalize_outfits 归一为 {name, description}，坏条目直接丢弃） */
export interface CharacterOutfit {
  name: string;
  description: string;
}

/** 封面提示词列表条目（存 projects.cover_prompts，最多 5 条；生成新词自动追加到尾部） */
export interface CoverPromptItem {
  id: string;
  content: string;
  rating?: number;
  created_at?: string;
}

/** 封面保留画廊条目（出图/上传/外链自动入档，prompt_id 关联「出自版本N」） */
export interface CoverGalleryEntry {
  id: string;
  prompt?: string;
  prompt_id?: string;
  image?: string;
  created_at?: string;
  [k: string]: unknown;
}

/** 能力模块（生成主链插件：context_provider/postprocess_hook 两钩子，项目级启停） */
export interface CapabilityModule {
  name: string;
  title: string;
  enabled: boolean;
  default_enabled: boolean;
  desc: string;
  params: { key: string; value?: number; [k: string]: unknown }[];
}

export interface TaskItem {
  id: number;
  project_id?: number | null;
  task_type: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling' | string;
  /** 任务类型的结构化进度（chat_read_review 通读审稿用：review/findings/phase/last_completed_chapter） */
  progress_details?: Record<string, unknown> | null;
  /** 父任务 id（一键连写等编排任务派生的子任务；NULL=独立任务）。父行不在列表时子行回落平铺渲染 */
  parent_task_id?: number | null;
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
  /** 任务结果（完成后才有；结构随 task_type 不同，如配装任务的 {added, saved, message}） */
  result?: Record<string, unknown> | null;
}

export interface LoginUser {
  id: number;
  username: string;
  nickname?: string | null;
  is_admin?: boolean;
}

/** 待补充实体候选：大纲/章节计划里出现但尚未入库的实体（value 结构见 pending_entity_service） */
export interface PendingEntityItem {
  name: string;
  description?: string;
  /** 首次出现的章节号 */
  from_chapter?: number;
  [k: string]: unknown;
}

export interface PendingEntitiesRes {
  pending_items: PendingEntityItem[];
  pending_locations: PendingEntityItem[];
  pending_characters: PendingEntityItem[];
  pending_organizations: PendingEntityItem[];
  total: number;
  ignored_items: PendingEntityItem[];
  ignored_locations: PendingEntityItem[];
  ignored_characters: PendingEntityItem[];
  ignored_organizations: PendingEntityItem[];
  ignored_total: number;
}

/** 投稿记录行：platform 必填，date 形如 2026-08-25（可空），note 备注（可空） */
export interface SubmissionRow {
  platform: string;
  date?: string;
  note?: string;
}

/** 个人偏好（GET/PUT /api/user/preferences）：昵称走用户列，其余存 user.settings */
export interface UserPreferences {
  nickname: string;
  default_pen_name: string;
  new_book_defaults: {
    narrative_pov: string;
    target_word_count: number;
  };
}

// ===== 用户级模型通道（每用户一份，存 user.settings） =====

/** 记忆向量（Embedding）通道：mode 决定本地/API 优先级 */
export interface EmbeddingConfig {
  model: string;
  base_url: string;
  api_key_configured: boolean;
  mode: 'local_first' | 'api_first' | 'api_only' | string;
}

/** 润色/图像场景通道。GET 不回显 key（只给 api_key_configured），PUT 时 key 传「•••••」=保留已存值 */
export interface SceneChannelConfig {
  base_url: string;
  model: string;
  api_key_configured: boolean;
  /** 仅 rewrite-config 返回：该通道是否配置过任意字段 */
  configured?: boolean;
  /** 仅 image-config 返回：图像通道开关 */
  enabled?: boolean;
}

/** 重建向量索引进度（全库/单用户共用同一个后台任务与状态） */
export interface EmbeddingRebuildStatus {
  running?: boolean;
  status?: string;
  total?: number;
  done?: number;
  failed?: number;
  error?: string;
  started_at?: string | null;
  finished_at?: string | null;
}

/** 书架横幅今日统计（北京时间切日；字数为所涉章节当前字数的近似口径） */
export interface BooksToday {
  books: number;
  chapters: number;
  words: number;
  archived_count: number;
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
  /** 别名/称呼列表（正文召回时与姓名一起匹配） */
  aliases?: string[];
  /** 多套装扮：服务端仅在载荷显式带 outfits 时才整表替换，不带不误清 */
  outfits?: CharacterOutfit[];
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

/** 项目元信息编辑（网页端仪表盘「项目信息卡」同款字段）。
 *  归档/恢复走独立旋钮 archived（true=归档，false=恢复，恢复优先回到归档前连载状态）；
 *  旧语义仍兼容：status 传 'archived'=归档、'active' 作用于归档书=恢复。
 *  归档书上 status 四态只改「归档前状态」暂存，书保持归档不复活。 */
export interface ProjectUpdateBody {
  title?: string;
  genre?: string;
  synopsis?: string;
  narrative_pov?: string;
  target_word_count?: number;
  target_platform?: string;
  pen_name?: string;
  status?: string;
  archived?: boolean;
}

// ===== 故事蓝图 =====
export interface BlueprintMilestone {
  title: string;
  description?: string;
  [k: string]: unknown;
}

export interface Blueprint {
  id: number;
  level: 'book' | 'volume' | string;
  volume_index?: number | null;
  title: string;
  start_chapter?: number | null;
  end_chapter?: number | null;
  theme?: string | null;
  main_conflict?: string | null;
  protagonist_growth?: string | null;
  key_milestones?: BlueprintMilestone[] | null;
  foreshadows_plan?: string | null;
  plot_arc?: string | null;
  plot_stage_guide?: unknown[] | null;
  structure?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BlueprintQueryResult {
  book: Blueprint | null;
  volumes: Blueprint[];
}

// ===== 组织 / 地点 / 物品 / 职业 =====
export interface OrganizationItem {
  id: number;
  name: string;
  org_type?: string | null;
  description?: string | null;
}

export interface LocationItem {
  id: number;
  name: string;
  location_type?: string | null;
  description?: string | null;
  atmosphere?: string | null;
  geography?: string | null;
  faction_control?: string | null;
  importance?: string | null;
  danger_level?: string | null;
  first_appear_chapter?: number | null;
  reference_image?: string | null;
  reference_prompt?: string | null;
  portrait_gallery?: PortraitGalleryEntry[] | null;
  portrait_prompts?: PortraitPromptItem[] | null;
}

export interface ItemEntity {
  id: number;
  name: string;
  category?: string | null;
  rarity?: string | null;
  description?: string | null;
  owner_name?: string | null;
  obtained_chapter?: number | null;
  status?: string | null;
  is_key_item?: boolean | number | null;
  reference_image?: string | null;
  reference_prompt?: string | null;
  portrait_gallery?: PortraitGalleryEntry[] | null;
  portrait_prompts?: PortraitPromptItem[] | null;
}

export const ITEM_RARITY_LABEL: Record<string, string> = {
  common: '普通',
  uncommon: '精良',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
  mythic: '神话',
};

export const ITEM_STATUS_LABEL: Record<string, string> = {
  in_use: '使用中',
  stored: '已存放',
  consumed: '已消耗',
  lost: '遗失',
  destroyed: '已损毁',
};

export interface CareerStage {
  name?: string;
  description?: string;
  requirement?: string;
  ability?: string;
  [k: string]: unknown;
}

export interface CareerItem {
  id: number;
  name: string;
  career_type: 'main' | 'sub' | string;
  category?: string | null;
  description?: string | null;
  stages?: CareerStage[] | null;
  abilities?: { name?: string; [k: string]: unknown }[] | string[] | null;
}

// ===== 写作风格 =====
export interface WritingStyleItem {
  id: number;
  name: string;
  description?: string | null;
  author_name?: string | null;
  custom_prompt?: string | null;
  reference_text?: string | null;
  is_preset?: boolean;
  is_default?: boolean;
  created_at?: string | null;
}

// ===== 章节剧情分析（8 维评分） =====
export interface ChapterAnalysis {
  id: number;
  chapter_number: number;
  plot_stage?: string | null;
  pacing?: string | null;
  dialogue_ratio?: number | null;
  description_ratio?: number | null;
  quality_scores?: Record<string, unknown> | null;
  suggestions?: string[] | null;
  consistency_issues?: unknown[] | null;
  analysis_report?: string | null;
  hooks?: Record<string, unknown> | null;
  conflicts?: unknown[] | null;
}

export const ANALYSIS_SCORE_LABEL: Record<string, string> = {
  overall: '总分',
  pacing: '节奏',
  ai_flavor: 'AI 味',
  coherence_logic: '逻辑连贯',
  writing_quality: '文笔质量',
  character_dialogue: '人物对话',
  world_consistency: '世界观一致',
  commercial_appeal: '商业吸引力',
  score_justification: 'score_justification',
};

// ===== 章节重写历史 =====
export interface RegenTask {
  id: number;
  chapter_id: number;
  modification_instructions?: string | null;
  version_number?: number | null;
  version_note?: string | null;
  original_word_count?: number | null;
  regenerated_word_count?: number | null;
  regenerated_content?: string | null;
  original_content?: string | null;
  diff_ratio?: number | null;
  is_applied?: number | boolean | null;
  status?: string | null;
  error?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}

// ===== 1→N 卷→章：卷下子章节 =====
export interface OutlineSubChapter {
  id: number;
  chapter_number: number;
  sub_index?: number | null;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
}

// ===== 项目设定（各开关端点的 GET/PUT 载荷） =====
export interface OutlineOptions {
  auto_fill_entities: boolean;
  auto_plan_foreshadows: boolean;
}

export interface AutoRewriteOptions {
  auto_rewrite_low_score: boolean;
  auto_rewrite_threshold: number;
}

export interface BestofOptions {
  golden3_bestof2: boolean;
  climax_bestof2: boolean;
}

export interface FinalRoundCacheOptions {
  final_round_keep_tools: boolean;
  final_round_json_align: boolean;
}

export interface ChapterTargetOptions {
  chapter_target_words: number;
}

export interface OutlineBatchOptions {
  outline_batch_size: number;
}

export interface EnglishExcludeOptions {
  english_scan_exclude: string;
}

export interface PromptModules {
  modules: Record<string, boolean>;
  modules_info?: Record<string, { label?: string; group?: string; desc?: string; [k: string]: unknown }> | null;
}

export type ThinkingModes = Record<string, { enabled: boolean; reasoning_effort?: string; temperature?: number }>;

export interface SourceCanonOptions {
  source_canon: string;
  is_fanfic: boolean;
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

// ===== AI 聊天助手（aichat） =====

/** 聊天会话（列表项带 busy=后台有一轮在跑） */
export interface ChatSession {
  id: number;
  user_id: number;
  project_id: number;
  title: string;
  enabled_skills: string[];
  /** 会话级模型覆盖（空=按 chat→generation→默认 档走） */
  model_override: string;
  created_at?: string | null;
  updated_at?: string | null;
  busy?: boolean;
}

/** 工具调用事件条目：带 tool 键=调用（args 可序列化摘要），带 tool_result 键=结果（耗时+摘要） */
export interface ChatToolEvent {
  tool?: string;
  args?: unknown;
  tool_result?: string;
  ms?: number;
  brief?: string;
  [k: string]: unknown;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | string;
  content: string;
  tool_events: ChatToolEvent[];
  /** 扩展元数据：{task_id, report: true, interrupted} 标记通读审稿报告消息 */
  meta: Record<string, unknown>;
  created_at?: string | null;
}

export interface ChatBuiltinSkill {
  name: string;
  display_name: string;
  prompt?: string;
}

/** 通读审稿预览估算（AI 工具与 REST 共用，不创建任务） */
export interface ReadReviewPreview {
  book_title: string;
  range: string;
  chapter_count: number;
  total_words: number;
  /** 分批模式的中文展示名（自动/全部一次/每N章） */
  batch_mode: string;
  batch_count: number;
  batch_sizes: number[];
  est_minutes: number;
  fits: boolean;
  est_total_tokens: number;
  usable_input_tokens: number;
  context_window: number;
  /** 不 fits 时的原因说明 */
  message: string;
}

/** 审稿发现（问题清单条目）。status: pending/applied/stale/dismissed */
export interface ChatReviewFinding {
  id: number;
  session_id: number;
  project_id: number;
  task_id?: number | null;
  batch_index?: number | null;
  chapter_id?: number | null;
  chapter_number?: number | null;
  scope: 'chapter' | 'cross_chapter' | 'book' | string;
  related_chapters?: { chapter_id?: number; number?: number }[];
  finding_type: 'typo' | 'consistency' | 'setting' | 'timeline' | 'repetition' | 'other' | string;
  severity: 'high' | 'medium' | 'low' | string;
  quote: string;
  suggestion: string;
  replacement: string;
  has_draft: boolean;
  has_patch: boolean;
  patch_quote?: string;
  patch_replacement?: string;
  source_content_hash?: string;
  status: string;
  revision_id?: number | null;
  created_at?: string | null;
}

/** 修改稿查看响应：草稿全文 + 当前正文（对照展示）；发现自己无稿时回落同章属主的稿 */
export interface FindingDraftRes {
  finding_id: number;
  chapter_number?: number | null;
  draft_content: string;
  chapter_content: string;
  is_chapter_level: boolean;
}

/** 批量应用结果：分 applied/stale/failed/skipped 四组 */
export interface ApplyFindingsRes {
  applied: number[];
  stale: { id: number; chapter?: number | null; reason?: string }[];
  failed: { id: number; reason?: string }[];
  skipped_no_chapter: number[];
}

/** 章节正文版本账本（列表不含正文；详情含 old/new_content 对照） */
export interface ChatRevision {
  id: number;
  session_id?: number | null;
  project_id: number;
  chapter_id: number;
  chapter_number?: number | null;
  parent_revision_id?: number | null;
  base_content_hash?: string;
  /** finding_apply / direct_edit / mcp_direct / rollback */
  source: string;
  finding_ids: number[];
  summary: string;
  created_at?: string | null;
  old_content?: string;
  new_content?: string;
}

/** 用户技能清单（GET /api/skills，含系统技能；聊天技能选择只用 custom+启用项） */
export interface UserSkillItem {
  id: number;
  name: string;
  display_name?: string | null;
  description?: string | null;
  category?: string | null;
  skill_type: 'custom' | string;
  is_enabled: boolean;
  is_mine?: boolean;
  share_status?: string;
  as_tool?: boolean;
  [k: string]: unknown;
}

/** 技能广场条目（脱敏：preview 只有前 200 字） */
export interface SkillMarketItem {
  id: number;
  display_name: string;
  description: string;
  category: string;
  author: string;
  is_mine: boolean;
  share_status: string;
  preview: string;
  prompt_chars: number;
  shared_at?: string | null;
}

/** AI 模型配置（model_override 下拉用：name 配置名 + 各场景模型名） */
export interface AiModelConfig {
  id: number;
  name: string;
  model: string;
  is_default: boolean;
  chat_model?: string | null;
  generation_model?: string | null;
  [k: string]: unknown;
}

/** 角色关系（含 AI 分析的置信度/证据/来源） */
export interface CharacterRelation {
  id: number;
  project_id: number;
  from_character_id: number;
  to_character_id: number;
  from_name?: string | null;
  to_name?: string | null;
  relation_type: string;
  category?: string | null;
  intimacy?: number | null;
  strength?: number | null;
  status?: string | null;
  description?: string | null;
  /** 判断置信度 0-1（AI 推断的关系偏低） */
  confidence?: number | null;
  /** 证据列表：[{chapter_id, type:"text"|"profile", snippet?, source?}] */
  evidence?: { chapter_id?: number; type?: string; snippet?: string; source?: string }[] | null;
  last_updated_chapter?: number | null;
  source?: string | null;
}

export const FINDING_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  applied: '已应用',
  stale: '已过期',
  dismissed: '已忽略',
};

export const FINDING_TYPE_LABEL: Record<string, string> = {
  typo: '错别字',
  consistency: '前后矛盾',
  setting: '设定冲突',
  timeline: '时间线',
  repetition: '重复',
  other: '其他',
};

export const FINDING_SEVERITY_LABEL: Record<string, string> = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};

export const REVISION_SOURCE_LABEL: Record<string, string> = {
  finding_apply: '发现应用',
  direct_edit: 'AI 直改',
  mcp_direct: 'MCP 直改',
  rollback: '撤销回滚',
};

/** 任务类型 → 展示文案（详情弹窗的类型徽标；与网页端 task-types.ts 的 TASK_TYPE_META 对齐） */
export const TASK_TYPE_LABEL: Record<string, string> = {
  init: '项目初始化',
  world: '世界观生成',
  world_core: '世界观生成',
  outline: '大纲生成',
  outline_supplement: '大纲实体补全',
  organizations: '组织生成',
  characters: '角色生成',
  character_regenerate: '角色重生成',
  character_outfit_suggest: '角色装扮',
  outline_new: '大纲生成',
  outline_continue: '大纲续写',
  outline_expand: '大纲展开',
  pending_entities: '补全物品/地点/角色',
  pending_items: '补充物品',
  pending_locations: '补充地点',
  pending_characters: '补充角色',
  pending_organizations: '补充组织',
  chapter_generate: '章节生成',
  chapter_batch: '批量生成',
  auto_write_loop: '一键连写',
  chapter_analyze: '剧情分析',
  chapter_batch_analyze: '批量分析',
  chapter_batch_polish: '批量润色',
  chapter_polish: '章节润色',
  segment_polish: '段落润色',
  short_story_review: '短篇审稿',
  chapter_regenerate: '章节改写',
  chapter_batch_regenerate: '批量改写',
  chapter_easter_egg: '彩蛋章节',
  chapter_illustration: '插画提示词',
  chapter_screenplay: '生成分镜',
  chapter_tts: '生成语音',
  book_import: '拆书导入',
  ai_denoising: '去AI味',
  blueprint_new: '创建蓝图',
  blueprint_continue: '续写蓝图',
  volume_plan: '分篇规划',
  foreshadow_plan: '伏笔规划',
  chat_read_review: '通读审稿',
  auto_rebuild_relations: '重建关系',
  new_char_relations: '角色关系分析',
  source_canon: '原作圣经生成',
  career_system: '职业体系',
  cover_prompt: '封面提示词',
  cover_image: '封面出图',
  character_portrait_prompt: '立绘提示词',
  character_portrait_image: '立绘出图',
  item_portrait_prompt: '道具立绘提示词',
  item_portrait_image: '道具立绘出图',
  location_portrait_prompt: '地点立绘提示词',
  location_portrait_image: '地点立绘出图',
  entity_ai_edit: '实体AI修改',
  org_member_assign: '组织成员分配',
  inspire: '灵感方案',
  story_arc: '全书弧线',
  skill_gen_career_system_generation: '技能生成·职业体系',
  skill_gen_locations_generate: '技能生成·地点',
  skill_gen_items_generate: '技能生成·物品',
  skill_gen_world_detail_generate: '技能生成·世界观',
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

  /** 编辑项目元信息（书名/笔名/题材/视角/目标平台/字数/简介）；归档/恢复传 archived 布尔 */
  updateProject(id: number, body: ProjectUpdateBody) {
    return this.req<{ ok: boolean }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /** 编辑短篇故事卡（八字段整卡替换，存 project.settings.story_card；结局先行闸门读 ending 字段） */
  updateStoryCard(id: number, storyCard: StoryCard) {
    return this.req<{ ok: boolean }>(`/api/projects/${id}/story-card`, {
      method: 'PUT',
      body: JSON.stringify({ story_card: storyCard }),
    });
  }

  /** 书架横幅今日统计（今日有正文变化的书数/章数/字数 + 归档计数） */
  getBooksToday() {
    return this.req<BooksToday>('/api/books/today');
  }

  // ===== 投稿记录（书架筛选与投稿管理用；一条 = 一个平台一次投稿） =====
  getSubmissions(projectId: number) {
    return this.req<{ submissions: SubmissionRow[] }>(`/api/projects/${projectId}/submissions`);
  }

  putSubmissions(projectId: number, submissions: SubmissionRow[]) {
    return this.req<{ ok: boolean; count: number }>(`/api/projects/${projectId}/submissions`, {
      method: 'PUT',
      body: JSON.stringify({ submissions }),
    });
  }

  // ===== 个人偏好（用户级，对所有项目生效） =====
  getUserPreferences() {
    return this.req<UserPreferences>('/api/user/preferences');
  }

  putUserPreferences(body: UserPreferences) {
    return this.req<UserPreferences>('/api/user/preferences', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  // ===== 待补充实体（大纲里出现但尚未入库的实体；忽略后生成任务同步跳过） =====
  getPendingEntities(projectId: number) {
    return this.req<PendingEntitiesRes>(`/api/projects/${projectId}/outlines/pending-entities`);
  }

  ignorePendingEntities(projectId: number, entityType: string, names: string[]) {
    return this.req<{ entity_type: string; ignored: string[] }>(`/api/projects/${projectId}/outlines/pending-entities/ignore`, {
      method: 'POST',
      body: JSON.stringify({ entity_type: entityType, names }),
    });
  }

  unignorePendingEntities(projectId: number, entityType: string, names: string[]) {
    return this.req<{ entity_type: string; ignored: string[] }>(`/api/projects/${projectId}/outlines/pending-entities/unignore`, {
      method: 'POST',
      body: JSON.stringify({ entity_type: entityType, names }),
    });
  }

  /** 按类型提交待补充实体生成任务（异步，进度看任务页）；entityType: items/locations/characters/organizations */
  generatePendingEntities(projectId: number, entityType: string) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/outlines/generate-pending-${entityType}`, {
      method: 'POST',
      body: JSON.stringify({}),
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

  // ===== 短篇段级流水线（story_kind=short/single；章正文=各段拼接，整篇直写会清空段行） =====
  /** 段行列表（segments 为空数组 = 本章未分段，走整章流程） */
  getChapterSegments(projectId: number, chapterId: number) {
    return this.req<ChapterSegments>(`/api/projects/${projectId}/chapters/${chapterId}/segments`);
  }

  /** 手动编辑单段正文：只改本段，章合并缓存自动重算并记版本账 */
  updateChapterSegment(projectId: number, chapterId: number, segIndex: number, content: string) {
    return this.req<{ ok: boolean; seg_index: number; word_count: number }>(`/api/projects/${projectId}/chapters/${chapterId}/segments/${segIndex}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  /** 段级生成（按序约束：前序段须已完成） */
  generateSegmentAsync(projectId: number, chapterId: number, segIndex: number, userInstructions = '') {
    return this.req<{ task_id: number; chapter_id: number; segment_index: number }>(`/api/projects/${projectId}/chapters/${chapterId}/segments/${segIndex}/generate-async`, {
      method: 'POST',
      body: JSON.stringify(userInstructions ? { user_instructions: userInstructions } : {}),
    });
  }

  /** 段级重写 v2：任意已完成段可重写，中段重写带后段开头咬合锚点；chain=连锁重写后续段 */
  rewriteSegmentAsync(projectId: number, chapterId: number, segIndex: number, opts: { chain?: boolean; user_instructions?: string } = {}) {
    return this.req<{ task_id: number; chapter_id: number; segment_index: number }>(`/api/projects/${projectId}/chapters/${chapterId}/segments/${segIndex}/rewrite-async`, {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  /** 段级润色：只润色指定段（skill: ai_denoising/humanize_pro），完成后章合并缓存自动重算 */
  polishSegmentAsync(projectId: number, chapterId: number, segIndex: number, skill: 'ai_denoising' | 'humanize_pro', userInstructions = '') {
    return this.req<{ task_id: number; seg_index: number }>(`/api/projects/${projectId}/chapters/${chapterId}/segments/${segIndex}/polish-async`, {
      method: 'POST',
      body: JSON.stringify({ skill, user_instructions: userInstructions }),
    });
  }

  // ===== 短篇审稿（三行留人/信息差账本/结尾回甘） =====
  /** 单章整篇审稿（异步任务，结果存 chapter.short_review，重新拉章节可见） */
  shortReviewAsync(projectId: number, chapterId: number) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/chapters/${chapterId}/short-review-async`, { method: 'POST' });
  }

  /** 多章短篇全书跨章通审（异步任务，结果存 project.settings.short_review_book） */
  shortReviewBookAsync(projectId: number) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/short-review-book-async`, { method: 'POST' });
  }

  /** 读取多章短篇全书审稿结果（null=还没审过） */
  getShortReviewBook(projectId: number) {
    return this.req<{ short_review_book: ShortReview | null }>(`/api/projects/${projectId}/short-review-book`);
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

  /** 提交单章正文生成（异步任务，返回 task_id）。includeNextOpening=衔接锚点：下一章已有正文时注入其开头 500 字防中间章重写后矛盾（默认关） */
  generateChapter(projectId: number, chapterId: number, includeNextOpening = false) {
    return this.req<{ task_id: number; chapter_id?: number }>(`/api/projects/${projectId}/chapters/${chapterId}/generate-async`, {
      method: 'POST',
      body: JSON.stringify(includeNextOpening ? { include_next_opening: true } : {}),
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

  // ===== 故事蓝图 =====
  getBlueprints(projectId: number) {
    return this.req<BlueprintQueryResult>(`/api/projects/${projectId}/blueprints?level=all`);
  }

  /** AI 生成/重做全书蓝图（异步任务，会覆盖现有蓝图） */
  generateBlueprintAsync(projectId: number, userPrompt = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/blueprints/generate-async`, {
      method: 'POST',
      body: JSON.stringify({ user_prompt: userPrompt }),
    });
  }

  /** AI 续写全书蓝图（在现有蓝图之后延伸新故事弧线，不覆盖前段） */
  continueBlueprintAsync(projectId: number, userPrompt = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/blueprints/continue-async`, {
      method: 'POST',
      body: JSON.stringify({ user_prompt: userPrompt }),
    });
  }

  /** AI 规划某一篇的详细路线（异步任务） */
  planVolumeAsync(projectId: number, volumeIndex: number, userPrompt = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/blueprints/plan-volume-async`, {
      method: 'POST',
      body: JSON.stringify({ volume_index: volumeIndex, user_prompt: userPrompt }),
    });
  }

  /** 手动编辑蓝图字段（服务端按非空字段部分更新；ending_direction 仅全书级，起止章仅分篇级） */
  updateBlueprint(
    projectId: number,
    blueprintId: number,
    body: {
      title?: string;
      theme?: string;
      main_conflict?: string;
      protagonist_growth?: string;
      plot_arc?: string;
      foreshadows_plan?: string;
      ending_direction?: string;
      start_chapter?: number;
      end_chapter?: number;
    },
  ) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/blueprints/${blueprintId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  // ===== 组织 =====
  getOrganizations(projectId: number) {
    return this.req<OrganizationItem[]>(`/api/projects/${projectId}/organizations`);
  }

  createOrganization(projectId: number, body: { name: string; org_type?: string; description?: string; power_value?: number; location?: string }) {
    return this.req<{ id: number }>(`/api/projects/${projectId}/organizations`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateOrganization(projectId: number, orgId: number, body: { name?: string; org_type?: string; description?: string; power_value?: number; location?: string }) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/organizations/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteOrganization(projectId: number, orgId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/organizations/${orgId}`, { method: 'DELETE' });
  }

  generateOrganizationsAsync(projectId: number, count: number, userInput = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/organizations/generate-async`, {
      method: 'POST',
      body: JSON.stringify({ count, user_input: userInput }),
    });
  }

  // ===== 地点 =====
  getLocations(projectId: number) {
    return this.req<LocationItem[]>(`/api/projects/${projectId}/locations`);
  }

  createLocation(projectId: number, body: { name: string; location_type?: string; description?: string; atmosphere?: string; geography?: string; importance?: string; danger_level?: string }) {
    return this.req<{ id: number }>(`/api/projects/${projectId}/locations`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateLocation(projectId: number, locationId: number, body: { name?: string; location_type?: string; description?: string; atmosphere?: string; geography?: string; importance?: string; danger_level?: string }) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/locations/${locationId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteLocation(projectId: number, locationId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/locations/${locationId}`, { method: 'DELETE' });
  }

  generateLocationsAsync(projectId: number, count: number, locationType = '', userPrompt = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/locations/generate-async`, {
      method: 'POST',
      body: JSON.stringify({ count, location_type: locationType, user_prompt: userPrompt }),
    });
  }

  // ===== 物品 =====
  getItems(projectId: number) {
    return this.req<ItemEntity[]>(`/api/projects/${projectId}/items`);
  }

  createItem(projectId: number, body: { name: string; category?: string; rarity?: string; description?: string; owner_name?: string; status?: string; is_key_item?: number }) {
    return this.req<{ id: number }>(`/api/projects/${projectId}/items`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateItem(projectId: number, itemId: number, body: { name?: string; category?: string; rarity?: string; description?: string; owner_name?: string; status?: string; is_key_item?: number }) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteItem(projectId: number, itemId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/items/${itemId}`, { method: 'DELETE' });
  }

  generateItemsAsync(projectId: number, count: number, category = '', userPrompt = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/items/generate-async`, {
      method: 'POST',
      body: JSON.stringify({ count, category, user_prompt: userPrompt }),
    });
  }

  // ===== 职业体系 =====
  getCareers(projectId: number) {
    return this.req<CareerItem[]>(`/api/projects/${projectId}/careers`);
  }

  createCareer(projectId: number, body: { name: string; career_type?: string; category?: string; description?: string; stages?: CareerStage[]; abilities?: unknown[] }) {
    return this.req<{ id: number }>(`/api/projects/${projectId}/careers`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateCareer(projectId: number, careerId: number, body: { name?: string; career_type?: string; category?: string; description?: string; stages?: CareerStage[]; abilities?: unknown[] }) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/careers/${careerId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteCareer(projectId: number, careerId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/careers/${careerId}`, { method: 'DELETE' });
  }

  /** AI 生成职业体系（异步任务）。append=true 在已有体系后追加 */
  generateCareerSystemAsync(projectId: number, body: { append?: boolean; count?: number; career_type?: string; user_prompt?: string }) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/career-system/generate-async`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** AI 自动给角色分配主职业（同步接口，直写角色的 main_career） */
  autoAssignCareers(projectId: number, userPrompt = '') {
    return this.req<{ count: number }>(`/api/projects/${projectId}/character-careers/auto-assign`, {
      method: 'POST',
      body: JSON.stringify({ user_prompt: userPrompt }),
    });
  }

  // ===== 写作风格（用户级接口，前缀 /api/writing-styles） =====
  getWritingStyles() {
    return this.req<WritingStyleItem[]>(`/api/writing-styles`);
  }

  /** 把风格绑定到项目（影响后续生成的文风） */
  applyWritingStyle(styleId: number, projectId: number) {
    return this.req<{ ok: boolean; style_name: string }>(`/api/writing-styles/${styleId}/apply/${projectId}`, { method: 'POST' });
  }

  /** 设为用户跨项目默认风格 */
  setDefaultWritingStyle(styleId: number) {
    return this.req<{ ok: boolean }>(`/api/writing-styles/${styleId}/set-default`, { method: 'POST' });
  }

  createWritingStyle(body: { name: string; description?: string; author_name?: string; custom_prompt?: string; reference_text?: string }) {
    return this.req<{ id: number }>(`/api/writing-styles`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateWritingStyle(styleId: number, body: { name?: string; description?: string; author_name?: string; custom_prompt?: string; reference_text?: string }) {
    return this.req<{ ok: boolean }>(`/api/writing-styles/${styleId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  deleteWritingStyle(styleId: number) {
    return this.req<{ ok: boolean }>(`/api/writing-styles/${styleId}`, { method: 'DELETE' });
  }

  // ===== 章节剧情分析 =====
  /** 按章号取剧情分析。没有分析过时服务端返回 404（调用方据此显示「生成分析」入口） */
  getChapterAnalysis(projectId: number, chapterNumber: number) {
    return this.req<ChapterAnalysis>(`/api/projects/${projectId}/analyses/${chapterNumber}`);
  }

  /** 提交单章剧情分析（异步任务；幂等，已有任务在跑会返回原任务） */
  analyzeChapterAsync(projectId: number, chapterId: number) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/chapters/${chapterId}/analyze`, { method: 'POST' });
  }

  // ===== 章节润色 =====
  /** 整章 AI 润色（异步任务，完成后服务端直接写回章节，原文备份到 raw_output 可回滚） */
  polishChaptersAsync(projectId: number, chapterIds: number[], skill: 'ai_denoising' | 'humanize_pro', userInstructions = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/chapters/batch-polish`, {
      method: 'POST',
      body: JSON.stringify({ chapter_ids: chapterIds, skill, user_instructions: userInstructions }),
    });
  }

  // ===== 章节重写 =====
  /** 提交整章重写（异步任务，只产草稿不覆盖正文；完成后在重写面板对比应用） */
  regenerateChapterAsync(projectId: number, chapterId: number, instructions: string, includeAnalysis = true, includeNextOpening = false) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/chapters/${chapterId}/regenerate/async`, {
      method: 'POST',
      body: JSON.stringify({ instructions, include_analysis: includeAnalysis, include_next_opening: includeNextOpening }),
    });
  }

  /** 重写历史列表 */
  getRegenTasks(projectId: number, chapterId: number, limit = 20) {
    return this.req<RegenTask[]>(`/api/projects/${projectId}/chapters/${chapterId}/regeneration/tasks?limit=${limit}`);
  }

  /** 最新未应用的重写草稿（null=没有待应用草稿） */
  getRegenPending(projectId: number, chapterId: number) {
    return this.req<RegenTask | null>(`/api/projects/${projectId}/chapters/${chapterId}/regeneration/pending`);
  }

  /** 应用重写草稿（覆盖章节正文） */
  applyRegenTask(projectId: number, chapterId: number, taskId: number) {
    return this.req<{ ok: boolean; word_count: number }>(`/api/projects/${projectId}/chapters/${chapterId}/regeneration/${taskId}/apply`, { method: 'POST' });
  }

  // ===== 大纲 1→N 卷→章 =====
  /** 卷下已展开的子章节列表（子章有独立 chapter id，可直接进阅读器） */
  getOutlineChapters(projectId: number, outlineId: number) {
    return this.req<{ has_chapters: boolean; chapter_count: number; chapters: OutlineSubChapter[] }>(`/api/projects/${projectId}/outlines/${outlineId}/chapters`);
  }

  /** AI 把一卷大纲展开成 N 章（异步任务） */
  expandOutlineAsync(projectId: number, outlineId: number, targetChapterCount: number, mode = 'append', strategy = 'balanced') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/outlines/${outlineId}/expand-async`, {
      method: 'POST',
      body: JSON.stringify({ target_chapter_count: targetChapterCount, mode, strategy }),
    });
  }

  /** 批量展开全部未展开的卷（异步任务，仅 1→N 模式可用） */
  batchExpandOutlinesAsync(projectId: number, targetChapterCount: number) {
    return this.req<{ task_id: number; pending_count: number }>(`/api/projects/${projectId}/outlines/batch-expand-async`, {
      method: 'POST',
      body: JSON.stringify({ target_chapter_count: targetChapterCount }),
    });
  }

  // ===== 项目设定（一组独立 GET/PUT 端点，全部挂在项目下） =====
  getOutlineOptions(projectId: number) {
    return this.req<OutlineOptions>(`/api/projects/${projectId}/outline-options`);
  }
  updateOutlineOptions(projectId: number, body: OutlineOptions) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/outline-options`, { method: 'PUT', body: JSON.stringify(body) });
  }
  getAutoRewrite(projectId: number) {
    return this.req<AutoRewriteOptions>(`/api/projects/${projectId}/auto-rewrite`);
  }
  updateAutoRewrite(projectId: number, body: AutoRewriteOptions) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/auto-rewrite`, { method: 'PUT', body: JSON.stringify(body) });
  }
  getBestof(projectId: number) {
    return this.req<BestofOptions>(`/api/projects/${projectId}/bestof-generate`);
  }
  updateBestof(projectId: number, body: BestofOptions) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/bestof-generate`, { method: 'PUT', body: JSON.stringify(body) });
  }
  getFinalRoundCache(projectId: number) {
    return this.req<FinalRoundCacheOptions>(`/api/projects/${projectId}/final-round-cache`);
  }
  updateFinalRoundCache(projectId: number, body: FinalRoundCacheOptions) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/final-round-cache`, { method: 'PUT', body: JSON.stringify(body) });
  }
  getChapterTarget(projectId: number) {
    return this.req<ChapterTargetOptions>(`/api/projects/${projectId}/chapter-target`);
  }
  updateChapterTarget(projectId: number, body: ChapterTargetOptions) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/chapter-target`, { method: 'PUT', body: JSON.stringify(body) });
  }
  getOutlineBatchSize(projectId: number) {
    return this.req<OutlineBatchOptions>(`/api/projects/${projectId}/outline-batch-size`);
  }
  updateOutlineBatchSize(projectId: number, body: OutlineBatchOptions) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/outline-batch-size`, { method: 'PUT', body: JSON.stringify(body) });
  }
  getEnglishExclude(projectId: number) {
    return this.req<EnglishExcludeOptions>(`/api/projects/${projectId}/english-exclude`);
  }
  updateEnglishExclude(projectId: number, body: EnglishExcludeOptions) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/english-exclude`, { method: 'PUT', body: JSON.stringify(body) });
  }
  getPromptModules(projectId: number) {
    return this.req<PromptModules>(`/api/projects/${projectId}/prompt-modules`);
  }
  updatePromptModules(projectId: number, modules: Record<string, boolean>) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/prompt-modules`, { method: 'PUT', body: JSON.stringify({ modules }) });
  }
  getThinkingModes(projectId: number) {
    return this.req<{ modes: ThinkingModes }>(`/api/projects/${projectId}/thinking-modes`);
  }
  updateThinkingModes(projectId: number, modes: ThinkingModes) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/thinking-modes`, { method: 'PUT', body: JSON.stringify({ modes }) });
  }
  getSourceCanon(projectId: number) {
    return this.req<SourceCanonOptions>(`/api/projects/${projectId}/source-canon`);
  }
  updateSourceCanon(projectId: number, body: { source_canon: string }) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/source-canon`, { method: 'PUT', body: JSON.stringify(body) });
  }
  /** AI 生成原作设定圣经（同人项目用，异步任务） */
  generateSourceCanonAsync(projectId: number, sourceTitles: string[], userBrief = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/source-canon/generate`, {
      method: 'POST',
      body: JSON.stringify({ source_titles: sourceTitles, user_brief: userBrief }),
    });
  }

  // ===== 封面 =====
  /** AI 生成封面提示词（异步任务，新词追加进 projects.cover_prompts 列表尾部，读最新一条要取列表末位） */
  coverPromptAsync(projectId: number) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/cover/generate-prompt`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** 用提示词生成封面图片（异步任务，结果通过 cover/image 查看）。quality 空串=走接口默认；
   *  promptId=出图所用提示词版本 id（画廊条目关联「出自版本N」） */
  coverImageAsync(projectId: number, prompt: string, size = '1024x1536', quality = '', promptId = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/cover/generate-image`, {
      method: 'POST',
      body: JSON.stringify({ prompt, size, quality, prompt_id: promptId }),
    });
  }

  /** 修改单条封面提示词（content=正文 / rating=评分 0-5，至少一项） */
  updateCoverPromptItem(projectId: number, itemId: string, body: { content?: string; rating?: number }) {
    return this.req<{ cover_prompts: CoverPromptItem[] }>(`/api/projects/${projectId}/cover/prompts/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /** 删除单条封面提示词（腾出名额可再生成新的） */
  deleteCoverPromptItem(projectId: number, itemId: string) {
    return this.req<{ cover_prompts: CoverPromptItem[] }>(`/api/projects/${projectId}/cover/prompts/${itemId}`, { method: 'DELETE' });
  }

  /** 删除一条保留封面（图片文件一并删；若是当前封面则同步清空 cover_url） */
  deleteCoverGalleryItem(projectId: number, entryId: string) {
    return this.req<{ ok: boolean; cover_gallery: CoverGalleryEntry[] }>(`/api/projects/${projectId}/cover/gallery/${entryId}`, { method: 'DELETE' });
  }

  /** 把保留画廊里的某张设为当前封面（回写 cover_url，书架/投稿/导出随之切换） */
  activateCoverGalleryItem(projectId: number, entryId: string) {
    return this.req<{ ok: boolean; cover_gallery: CoverGalleryEntry[] }>(`/api/projects/${projectId}/cover/gallery/${entryId}/activate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** 保留画廊图片地址（id8 为条目 id 的 8 位 hex 后缀；鉴权同封面主图） */
  coverGalleryImageUrl(projectId: number, entryId: string) {
    const id8 = entryId.replace(/^cg_/, '');
    return `${this.baseUrl}/api/projects/${projectId}/cover/gallery/${id8}/image`;
  }

  // ===== 立绘（角色/物品/地点三实体同构：提示词版本 ≤5 条 + 画廊自动入档 + 上传/外链） =====
  /** REST 路径段：character→characters / item→items / location→locations */
  private portraitSeg(kind: PortraitKind) {
    return kind === 'character' ? 'characters' : kind === 'item' ? 'items' : 'locations';
  }

  portraitPromptAsync(
    projectId: number,
    kind: PortraitKind,
    entityId: number,
    body: { style: string; view: string; extra_requirements?: string; outfit?: string; replace_prompt_id?: string },
  ) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/generate-prompt`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** 只存立绘提示词（不调 AI 不出图）：落库工作字段 + 自动归档为版本（同内容去重，满额只更新工作字段） */
  savePortraitPrompt(projectId: number, kind: PortraitKind, entityId: number, prompt: string) {
    return this.req<{ ok: boolean; reference_prompt: string; appended: boolean; portrait_prompts: PortraitPromptItem[] }>(
      `/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/prompt`,
      {
        method: 'PUT',
        body: JSON.stringify({ prompt }),
      },
    );
  }

  /** 改单条立绘提示词版本：content=正文 / rating=评分 / view=视角标注（变更联动画廊条目移组，响应带新画廊） */
  updatePortraitPromptItem(projectId: number, kind: PortraitKind, entityId: number, itemId: string, body: { content?: string; rating?: number; view?: string }) {
    return this.req<{ ok: boolean; portrait_prompts: PortraitPromptItem[]; portrait_gallery?: PortraitGalleryEntry[] }>(
      `/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/prompts/${itemId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
  }

  /** 删除一条立绘提示词版本（画廊里出自它的图片保留，仅关联标注失效） */
  deletePortraitPromptItem(projectId: number, kind: PortraitKind, entityId: number, itemId: string) {
    return this.req<{ ok: boolean; portrait_prompts: PortraitPromptItem[] }>(
      `/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/prompts/${itemId}`,
      { method: 'DELETE' },
    );
  }

  /** 用提示词生成立绘图（异步任务；view 供画廊按视角归档、prompt_id 关联提示词版本） */
  portraitImageAsync(projectId: number, kind: PortraitKind, entityId: number, prompt: string, opts: { size?: string; view?: string; prompt_id?: string } = {}) {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/generate-image`, {
      method: 'POST',
      body: JSON.stringify({ prompt, size: opts.size ?? 'portrait', view: opts.view ?? 'single', prompt_id: opts.prompt_id ?? '' }),
    });
  }

  /** 上传立绘图片（multipart ≤15MB）：转存 PNG 主图 + 自动入画廊（按视角归档、可关联提示词版本） */
  uploadPortrait(
    projectId: number,
    kind: PortraitKind,
    entityId: number,
    file: { uri: string; name: string; type: string },
    fields: { prompt?: string; view?: string; prompt_id?: string } = {},
  ) {
    return new Promise<{ ok: boolean; reference_image: string; notice: string; portrait_gallery: PortraitGalleryEntry[] }>((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      if (fields.prompt) fd.append('prompt', fields.prompt);
      fd.append('view', fields.view ?? 'single');
      if (fields.prompt_id) fd.append('prompt_id', fields.prompt_id);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      // Content-Type 由 XHR 自动带 multipart boundary，手动设置反而会坏（同封面上传）
      xhr.timeout = 60_000;
      xhr.onload = () => {
        let j: { ok?: boolean; reference_image?: string; notice?: string; portrait_gallery?: PortraitGalleryEntry[]; detail?: string } | null = null;
        try {
          j = JSON.parse(xhr.responseText);
        } catch {
          j = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && j?.ok) {
          resolve({ ok: true, reference_image: j.reference_image ?? '', notice: j.notice ?? '', portrait_gallery: j.portrait_gallery ?? [] });
        } else {
          reject(new ApiError(xhr.status, j?.detail || `上传失败（${xhr.status}）`));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, '网络错误，上传失败'));
      xhr.ontimeout = () => reject(new ApiError(0, '上传超时，请重试'));
      xhr.send(fd);
    });
  }

  /** 把外部图床地址设为立绘（不落盘本地）：自动入画廊（外链不计额、同 URL 去重） */
  setPortraitUrl(projectId: number, kind: PortraitKind, entityId: number, body: { url: string; prompt?: string; view?: string; prompt_id?: string }) {
    return this.req<{ ok: boolean; reference_image: string; notice: string; portrait_gallery: PortraitGalleryEntry[] }>(
      `/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/url`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  /** 把画廊条目设为当前立绘（回写 reference_image/reference_prompt，视频编译参考图随之切换） */
  activatePortraitGalleryItem(projectId: number, kind: PortraitKind, entityId: number, entryId: string) {
    return this.req<{ ok: boolean; reference_image: string; reference_prompt: string; portrait_gallery: PortraitGalleryEntry[] }>(
      `/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/gallery/${entryId}/activate`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
  }

  /** 删除一条立绘画廊条目（图片文件一并删；若是当前主图则同步清空 reference_image） */
  deletePortraitGalleryItem(projectId: number, kind: PortraitKind, entityId: number, entryId: string) {
    return this.req<{ ok: boolean; portrait_gallery: PortraitGalleryEntry[] }>(
      `/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/gallery/${entryId}`,
      { method: 'DELETE' },
    );
  }

  deletePortraitImage(projectId: number, kind: PortraitKind, entityId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/${this.portraitSeg(kind)}/${entityId}/portrait/image`, { method: 'DELETE' });
  }

  /** 立绘主图地址（全局鉴权端点，三实体前缀不同） */
  portraitUrl(kind: PortraitKind, entityId: number) {
    const seg = kind === 'character' ? 'portraits' : kind === 'item' ? 'item-portraits' : 'location-portraits';
    return `${this.baseUrl}/api/${seg}/${entityId}/image`;
  }

  /** 立绘画廊图片地址（id8 为条目 id 的 8 位 hex 后缀；鉴权同主图） */
  portraitGalleryImageUrl(kind: PortraitKind, entityId: number, entryId: string) {
    const id8 = entryId.replace(/^pg_/, '');
    const seg = kind === 'character' ? 'portraits' : kind === 'item' ? 'item-portraits' : 'location-portraits';
    return `${this.baseUrl}/api/${seg}/${entityId}/gallery/${id8}/image`;
  }

  // ===== 角色装扮 =====
  /** AI 配装扮（异步任务）：完成即自动落库追加合并（同名跳过），result 带回 added/saved */
  suggestOutfits(projectId: number, characterId: number, count = 3, userInstructions = '') {
    return this.req<{ task_id: number }>(`/api/projects/${projectId}/characters/${characterId}/outfits/suggest`, {
      method: 'POST',
      body: JSON.stringify({ count, user_instructions: userInstructions }),
    });
  }

  // ===== 能力模块（CapabilityModule 注册表：伏笔提醒/资源账本/叙事技巧/TTS/分镜等） =====
  getCapabilityModules(projectId: number) {
    return this.req<{ modules: CapabilityModule[] }>(`/api/projects/${projectId}/capability-modules`);
  }

  /** 启停单个能力模块（存 project.settings.capability_modules，改动立即生效） */
  updateCapabilityModule(projectId: number, name: string, enabled: boolean) {
    return this.req<{ ok: boolean; name: string; enabled: boolean }>(`/api/projects/${projectId}/capability-modules`, {
      method: 'PUT',
      body: JSON.stringify({ name, enabled }),
    });
  }

  // ===== AI 聊天助手：会话 / 消息 =====
  listChatSessions(projectId: number) {
    return this.req<ChatSession[]>(`/api/projects/${projectId}/chat/sessions`);
  }

  createChatSession(projectId: number, title = '') {
    return this.req<ChatSession>(`/api/projects/${projectId}/chat/sessions`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  /** 会话设置：title/enabled_skills/model_override 均可部分更新 */
  updateChatSession(projectId: number, sessionId: number, body: { title?: string; enabled_skills?: string[]; model_override?: string }) {
    return this.req<ChatSession>(`/api/projects/${projectId}/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  deleteChatSession(projectId: number, sessionId: number) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/chat/sessions/${sessionId}`, { method: 'DELETE' });
  }

  /** 消息列表（after_id 增量拉取；服务端上限 200 条/次） */
  getChatMessages(projectId: number, sessionId: number, afterId = 0) {
    return this.req<ChatMessage[]>(`/api/projects/${projectId}/chat/sessions/${sessionId}/messages?after_id=${afterId}`);
  }

  /** 删除指定消息及其后全部消息（截断重发：被删内容不再进入后续上下文） */
  deleteChatMessageFrom(projectId: number, sessionId: number, messageId: number) {
    return this.req<{ ok: boolean; removed: number }>(`/api/projects/${projectId}/chat/sessions/${sessionId}/messages/${messageId}`, { method: 'DELETE' });
  }

  getChatBuiltinSkills(projectId: number) {
    return this.req<ChatBuiltinSkill[]>(`/api/projects/${projectId}/chat/builtin-skills`);
  }

  /** 发送消息（SSE 流式）。会话忙抛 ApiError(409)，由调用方转 liveAttachSSE 续接 */
  sendChatMessageSSE(
    projectId: number,
    sessionId: number,
    content: string,
    onEvent?: PostSSEOptions['onEvent'],
    signal?: AbortSignal,
  ) {
    return postSSE(this.baseUrl, this.token, `/api/projects/${projectId}/chat/sessions/${sessionId}/messages`, { content }, { onEvent, signal });
  }

  /** 重连正在跑的一轮（刷新/断线后续接工具活动直播）；空闲立即 done {idle:true} */
  liveAttachSSE(projectId: number, sessionId: number, onEvent?: PostSSEOptions['onEvent'], signal?: AbortSignal) {
    return postSSE(this.baseUrl, this.token, `/api/projects/${projectId}/chat/sessions/${sessionId}/live`, {}, { onEvent, signal });
  }

  // ===== 通读审稿（预览-确认制；任务进度走任务体系） =====
  previewReadReview(projectId: number, body: { start_chapter?: number; end_chapter?: number; batch_mode?: string }) {
    return this.req<ReadReviewPreview>(`/api/projects/${projectId}/chat/read-review/preview`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** 启动通读审稿任务（resume_task_id=从被取消/失败任务断点续跑） */
  startReadReview(
    projectId: number,
    body: { session_id: number; start_chapter?: number; end_chapter?: number; focus?: string; batch_mode?: string; resume_task_id?: number },
  ) {
    return this.req<{ task_id: number; preview: ReadReviewPreview }>(`/api/projects/${projectId}/chat/read-review`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ===== 审稿发现清单 =====
  listChatFindings(projectId: number, sessionId: number, status = '') {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.req<ChatReviewFinding[]>(`/api/projects/${projectId}/chat/sessions/${sessionId}/findings${q}`);
  }

  /** 改发现状态（pending/stale/dismissed；applied 不能改，撤销走版本账本） */
  setChatFindingStatus(projectId: number, findingId: number, status: string) {
    return this.req<ChatReviewFinding>(`/api/projects/${projectId}/chat/findings/${findingId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  /** 查看修改稿：草稿全文 + 当前正文（发现自己无稿时返回同章属主的稿） */
  getChatFindingDraft(projectId: number, findingId: number) {
    return this.req<FindingDraftRes>(`/api/projects/${projectId}/chat/findings/${findingId}/draft`);
  }

  /** 保存人工编辑后的修改稿（≥50 字；以当前正文刷新 hash，随后应用不被误判过期） */
  saveChatFindingDraft(projectId: number, findingId: number, draftContent: string) {
    return this.req<{ ok: boolean; chars: number }>(`/api/projects/${projectId}/chat/findings/${findingId}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ draft_content: draftContent }),
    });
  }

  /** 清空本会话全部待处理发现（整批丢弃） */
  clearPendingChatFindings(projectId: number, sessionId: number) {
    return this.req<{ ok: boolean; removed: number }>(`/api/projects/${projectId}/chat/findings/pending?session_id=${sessionId}`, { method: 'DELETE' });
  }

  /** 批量应用发现（按章分组，含 stale 过期保护与同章修改稿兜底） */
  applyChatFindings(projectId: number, sessionId: number, ids: number[]) {
    return this.req<ApplyFindingsRes>(`/api/projects/${projectId}/chat/findings/apply`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, ids }),
    });
  }

  /** 为单条发现生成局部修改补丁（SSE，最小 diff 精确替换） */
  findingPatchSSE(projectId: number, findingId: number, onEvent?: PostSSEOptions['onEvent']) {
    return postSSE(this.baseUrl, this.token, `/api/projects/${projectId}/chat/findings/${findingId}/patch`, {}, { onEvent });
  }

  /** 为单条发现生成整章修改稿（SSE；force=覆盖已有稿重新生成） */
  findingDraftSSE(projectId: number, findingId: number, force = false, onEvent?: PostSSEOptions['onEvent']) {
    return postSSE(this.baseUrl, this.token, `/api/projects/${projectId}/chat/findings/${findingId}/draft`, { force }, { onEvent });
  }

  // ===== 版本账本 =====
  listChatRevisions(projectId: number, opts?: { sessionId?: number; chapterNumber?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (opts?.sessionId) q.set('session_id', String(opts.sessionId));
    if (opts?.chapterNumber) q.set('chapter_number', String(opts.chapterNumber));
    q.set('limit', String(opts?.limit ?? 100));
    return this.req<ChatRevision[]>(`/api/projects/${projectId}/chat/revisions?${q.toString()}`);
  }

  /** 修订详情（含 old_content/new_content 对照） */
  getChatRevision(projectId: number, revisionId: number) {
    return this.req<ChatRevision>(`/api/projects/${projectId}/chat/revisions/${revisionId}`);
  }

  /** 撤销修订：把正文恢复为该修订的 old_content（写反向记录，撤错可再撤销回来） */
  revertChatRevision(projectId: number, revisionId: number, sessionId?: number) {
    return this.req<{ ok?: boolean; revision_id?: number; [k: string]: unknown }>(`/api/projects/${projectId}/chat/revisions/${revisionId}/revert`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId ?? 0 }),
    });
  }

  // ===== 技能（用户技能清单 + 共享广场；管理员审核走网页端） =====
  getUserSkills() {
    return this.req<UserSkillItem[]>('/api/skills');
  }

  listSkillMarket(search = '') {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.req<SkillMarketItem[]>(`/api/skills/market${q}`);
  }

  /** 申请共享（action=request）/ 撤回（action=withdraw，回落 private） */
  skillShareAction(skillId: number, action: 'request' | 'withdraw') {
    return this.req<{ ok: boolean; share_status: string }>(`/api/skills/market/${skillId}/share-request`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  /** 一键导入广场技能副本到名下（与原作者后续更新解耦） */
  importSkillMarket(skillId: number) {
    return this.req<{ ok: boolean; id: number; name: string }>(`/api/skills/market/${skillId}/import`, { method: 'POST' });
  }

  // ===== 项目级附加规则 / 自动关系 =====
  getExtraWritingRules(projectId: number) {
    return this.req<{ extra_writing_rules: string }>(`/api/projects/${projectId}/extra-writing-rules`);
  }

  updateExtraWritingRules(projectId: number, extraWritingRules: string) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/extra-writing-rules`, {
      method: 'PUT',
      body: JSON.stringify({ extra_writing_rules: extraWritingRules }),
    });
  }

  getAutoRelation(projectId: number) {
    return this.req<{ auto_relation_on_create: boolean }>(`/api/projects/${projectId}/auto-relation`);
  }

  updateAutoRelation(projectId: number, on: boolean) {
    return this.req<{ ok: boolean }>(`/api/projects/${projectId}/auto-relation`, {
      method: 'PUT',
      body: JSON.stringify({ auto_relation_on_create: on }),
    });
  }

  /** 把内置预设恢复为代码内置定义（预设被改乱时的回滚口） */
  restoreWritingStylePreset(styleId: number) {
    return this.req<{ ok: boolean; name: string }>(`/api/writing-styles/${styleId}/restore-preset`, { method: 'POST' });
  }

  /** AI 模型配置列表（聊天会话 model_override 下拉用） */
  getAiModels() {
    return this.req<AiModelConfig[]>('/api/ai-models');
  }

  // ===== 用户级模型通道（记忆向量 / 润色 / 图像，每用户一份） =====
  getEmbeddingConfig() {
    return this.req<EmbeddingConfig>('/api/ai-models/embedding-config');
  }

  /** 保存 Embedding 通道。api_key 传「•••••」=保留已存值；mode: local_first/api_first/api_only */
  updateEmbeddingConfig(body: { model: string; base_url: string; api_key: string; mode: string }) {
    return this.req<{ ok: boolean }>('/api/ai-models/embedding-config', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /** 用户级自助重建记忆向量索引（用自己的通道，异步后台执行） */
  rebuildEmbeddingIndex() {
    return this.req<{ ok: boolean; message?: string }>('/api/ai-models/embedding-config/rebuild', { method: 'POST' });
  }

  getEmbeddingRebuildStatus() {
    return this.req<EmbeddingRebuildStatus>('/api/ai-models/embedding-config/rebuild-status');
  }

  /** 场景通道配置，channel: rewrite（润色）/ image（图像） */
  getSceneChannelConfig(channel: 'rewrite' | 'image') {
    return this.req<SceneChannelConfig>(`/api/ai-models/${channel}-config`);
  }

  updateSceneChannelConfig(channel: 'rewrite' | 'image', body: { base_url: string; api_key: string; model: string; enabled?: boolean }) {
    return this.req<{ ok: boolean }>(`/api/ai-models/${channel}-config`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /** 场景通道远端模型列表（缓存优先；跟随主接口未覆盖 URL 的卡请用 /ai-models 默认档） */
  getSceneRemoteModels(channel: 'rewrite' | 'image' | 'embedding') {
    return this.req<{ models: string[]; cached?: boolean }>(`/api/ai-models/scene-remote-models?channel=${channel}`);
  }

  /** 手动刷新场景通道模型缓存（现拉远端并落缓存） */
  refreshSceneModels(channel: 'rewrite' | 'image' | 'embedding') {
    return this.req<{ models: string[] }>(`/api/ai-models/scene-refresh`, {
      method: 'POST',
      body: JSON.stringify({ channel }),
    });
  }

  /** 测试 Embedding 连通性。use_saved=true 时空字段从已保存的用户级通道取值 */
  testEmbedding(body: { base_url?: string; api_key?: string; embedding_model?: string; use_saved?: boolean }) {
    return this.req<Record<string, unknown>>('/api/ai-models/test-embedding', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ===== 角色关系 =====
  listRelations(projectId: number) {
    return this.req<CharacterRelation[]>(`/api/projects/${projectId}/relations`);
  }

  // ===== 封面上传/外链 =====
  /** 上传本地封面（multipart ≤15MB）。走 XMLHttpRequest：RN 的 XHR 原生支持
   *  FormData 的 {uri,name,type} 文件部件，不受 expo/fetch 全局覆盖的 FormData 实现差异影响。
   *  上传自动入画廊；promptId 可选=把这张图关联到提示词版本（画廊显示「出自版本N」）。 */
  uploadCover(projectId: number, file: { uri: string; name: string; type: string }, promptId = '') {
    return new Promise<{ ok: boolean; cover_url: string; size: string; notice: string; cover_gallery: CoverGalleryEntry[] }>((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      if (promptId) fd.append('prompt_id', promptId);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/api/projects/${projectId}/cover/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      // Content-Type 由 XHR 自动带 multipart boundary，手动设置反而会坏
      xhr.timeout = 60_000;
      xhr.onload = () => {
        let j: { ok?: boolean; cover_url?: string; size?: string; notice?: string; cover_gallery?: CoverGalleryEntry[]; detail?: string } | null = null;
        try {
          j = JSON.parse(xhr.responseText);
        } catch {
          j = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && j?.cover_url) {
          resolve({ ok: true, cover_url: j.cover_url, size: j.size ?? '', notice: j.notice ?? '', cover_gallery: j.cover_gallery ?? [] });
        } else {
          reject(new ApiError(xhr.status, j?.detail || `上传失败（${xhr.status}）`));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, '网络错误，上传失败'));
      xhr.ontimeout = () => reject(new ApiError(0, '上传超时，请重试'));
      xhr.send(fd);
    });
  }

  /** 直接把外部图床地址设为封面（http(s) 开头，不落盘本地）；自动入画廊（外链不计额），
   *  promptId 可选=关联提示词版本 */
  setCoverUrl(projectId: number, url: string, promptId = '') {
    return this.req<{ ok: boolean; cover_url: string; notice?: string; cover_gallery?: CoverGalleryEntry[] }>(`/api/projects/${projectId}/cover/url`, {
      method: 'POST',
      body: JSON.stringify({ url, prompt_id: promptId }),
    });
  }

  coverUrl(projectId: number) {
    return `${this.baseUrl}/api/projects/${projectId}/cover/image`;
  }

  /** 封面缩略图（320px JPEG，书架列表用；缺失时服务端懒生成） */
  coverThumbUrl(projectId: number) {
    return `${this.baseUrl}/api/projects/${projectId}/cover/thumb`;
  }
}
