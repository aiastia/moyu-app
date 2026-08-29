import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChapterBadge, Chip, EmptyState, FieldLabel, Input, MultiSelectField, ProgressBar, ScreenHeader, SegmentedTabs, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import { ForeshadowsPanel } from '@/components/ForeshadowsPanel';
import { CharactersPanel } from '@/components/CharactersPanel';
import { EntitiesHub } from '@/components/EntitiesHub';
import { BlueprintPanel } from '@/components/BlueprintPanel';
import { AutoWriteSheet } from '@/components/AutoWriteSheet';
import { CoverSheet } from '@/components/CoverSheet';
import { CoverArt } from '@/components/CoverArt';
import { ShortReviewView } from '@/components/ShortReviewView';
import { PendingEntitiesCard } from '@/components/PendingEntitiesCard';
import type { ChapterRow, OutlineItem, ProjectDetail, ShortReview, StoryCard, WritingStyleItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, loadLastRead, useAuth } from '@/lib/auth';
import { fmtDate, fmtPercent, fmtRelative, fmtWords, STORY_KIND_LABEL } from '@/lib/format';
import { C, R, SP } from '@/lib/theme';

/** 大纲场景（服务端 scenes 数组的单条），编辑表单里的可变形态 */
type OutlineSceneEdit = { scene_title: string; scene_desc: string; emotion: string };

/** 服务端 scenes/characters 原始数据 → 展示/编辑形态（脏数据兜底为空） */
function toSceneEdits(raw: unknown): OutlineSceneEdit[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      scene_title: typeof o.scene_title === 'string' ? o.scene_title : '',
      scene_desc: typeof o.scene_desc === 'string' ? o.scene_desc : '',
      emotion: typeof o.emotion === 'string' ? o.emotion : '',
    };
  });
}

function toNameList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : ((x as Record<string, unknown>)?.name as string) ?? '')).filter(Boolean);
}

/** 长篇全量 Tab；短篇家族按网页端口径裁剪（见 tabsForKind）：single 只留 章节/概况，short 隐蓝图 */
const TABS = [
  { key: 'chapters', label: '章节' },
  { key: 'outlines', label: '大纲' },
  { key: 'blueprint', label: '蓝图' },
  { key: 'characters', label: '角色' },
  { key: 'world', label: '世界' },
  { key: 'foreshadow', label: '伏笔' },
  { key: 'about', label: '概况' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** 按篇幅模式出 Tab（对齐网页端 useNavigation 三模式裁剪）：
 *  single=单章成篇不需要大纲/蓝图/角色/世界/伏笔（结构在故事卡+分段里）；
 *  short=多章短篇保留大纲/角色/世界/伏笔，蓝图是长篇设施不出现。 */
function tabsForKind(kind: string): { key: TabKey; label: string }[] {
  if (kind === 'single') return TABS.filter((t) => t.key === 'chapters' || t.key === 'about').map((t) => ({ ...t }));
  if (kind === 'short') return TABS.filter((t) => t.key !== 'blueprint').map((t) => ({ ...t }));
  return TABS.map((t) => ({ ...t }));
}

/** 叙事视角/目标平台下拉：固定选项 + 当前值不在清单内时追加（兼容历史自定义值） */
function withCurrent(options: { value: string; label: string }[], current?: string | null) {
  if (current && !options.some((o) => o.value === current)) {
    return [...options, { value: current, label: `${current}（当前）` }];
  }
  return options;
}
const POV_OPTIONS = [
  { value: '第三人称', label: '第三人称' },
  { value: '第一人称', label: '第一人称' },
  { value: '全知视角', label: '全知视角' },
];
const PLATFORM_OPTIONS = [
  { value: '通用', label: '通用' },
  { value: '番茄', label: '番茄' },
  { value: '起点', label: '起点' },
  { value: '晋江', label: '晋江' },
  { value: '微信读书', label: '微信读书' },
];

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Text style={{ color: C.text3, fontSize: 12.5, width: 64, paddingTop: 2 }}>{label}</Text>
      <Text style={{ color: C.text2, fontSize: 13, lineHeight: 20, flex: 1 }}>{value}</Text>
    </View>
  );
}

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const { api, logout } = useAuth();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [outlines, setOutlines] = useState<OutlineItem[] | null>(null);
  const [outlineDetail, setOutlineDetail] = useState<OutlineItem | null>(null);
  const [outlineGen, setOutlineGen] = useState<'new' | 'continue' | null>(null);
  const [outlineCount, setOutlineCount] = useState(5);
  const [lastRead, setLastRead] = useState<ChapterRow | null>(null);
  const [tab, setTab] = useState<TabKey>('chapters');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastReadId, setLastReadId] = useState<number | null>(null);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [coverVersion, setCoverVersion] = useState(0);
  /** 大纲编辑表单（null=详情弹窗处于只读态）。角色/组织是字符串数组（MultiSelectField） */
  const [outlineEdit, setOutlineEdit] = useState<{ title: string; summary: string; emotion: string; goal: string; keyPoints: string; scenes: OutlineSceneEdit[]; characters: string[]; orgs: string[] } | null>(null);
  const [outlineSaving, setOutlineSaving] = useState(false);
  /** 大纲实体多选的候选名（首次打开编辑时拉取缓存） */
  const [charNameOptions, setCharNameOptions] = useState<string[] | null>(null);
  const [orgNameOptions, setOrgNameOptions] = useState<string[] | null>(null);
  /** 1→N 模式：卷下已展开的子章节（打开卷详情时拉取） */
  const [subChapters, setSubChapters] = useState<{ has_chapters: boolean; chapter_count: number; chapters: { id: number; chapter_number: number; sub_index?: number | null; title?: string | null; status?: string | null; word_count?: number }[] } | null>(null);
  const [expandCount, setExpandCount] = useState(3);
  /** 概况 Tab：项目信息编辑表单（null=未打开） */
  const [aboutEdit, setAboutEdit] = useState<{ title: string; penName: string; genre: string; pov: string; platform: string; wordsWan: string; synopsis: string } | null>(null);
  const [aboutSaving, setAboutSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  /** 概况 Tab：写作风格绑定弹窗 */
  const [styleSheet, setStyleSheet] = useState(false);
  const [styleList, setStyleList] = useState<WritingStyleItem[] | null>(null);
  const [styleChoice, setStyleChoice] = useState('');
  const [styleApplying, setStyleApplying] = useState(false);
  /** 短篇故事卡弹窗（八字段编辑；null=关闭） */
  const [cardDraft, setCardDraft] = useState<StoryCard | null>(null);
  const [cardSaving, setCardSaving] = useState(false);
  /** 多章短篇全书审稿弹窗（undefined=加载中，null=还没审过） */
  const [bookReviewOpen, setBookReviewOpen] = useState(false);
  const [bookReview, setBookReview] = useState<ShortReview | null | undefined>(undefined);
  const [bookReviewBusy, setBookReviewBusy] = useState(false);

  const guard = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }
      setError(friendlyError(e));
    },
    [logout],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!api || Number.isNaN(projectId)) return;
      if (!silent) setError('');
      try {
        const [p, ch] = await Promise.all([api.getProject(projectId), api.getChapters(projectId)]);
        setProject(p);
        setChapters(ch ?? []);
        setError('');
      } catch (e) {
        await guard(e);
      }
    },
    [api, projectId, guard],
  );

  useEffect(() => {
    load();
    if (!Number.isNaN(projectId)) loadLastRead(projectId).then((cid) => setLastReadId(cid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (lastReadId && chapters) {
      const row = chapters.find((c) => c.id === lastReadId);
      if (row) setLastRead(row);
    }
  }, [lastReadId, chapters]);

  // 分栏懒加载
  useEffect(() => {
    if (!api || Number.isNaN(projectId)) return;
    if (tab === 'outlines' && outlines === null) {
      api.getOutlines(projectId).then((o) => setOutlines(o ?? [])).catch(guard);
    }
  }, [tab, api, projectId, outlines, guard]);

  const pct = useMemo(() => fmtPercent(project?.current_word_count, project?.target_word_count), [project]);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const goReader = useCallback(
    (c: ChapterRow) =>
      router.push({
        pathname: '/reader',
        params: {
          projectId: String(projectId),
          chapterId: String(c.id),
          canGenerate: c.can_generate ? '1' : '0',
          reason: c.generate_disabled_reason ?? '',
        },
      }),
    [projectId],
  );

  /** 提交单章生成任务 */
  const submitChapterGenerate = useCallback(
    (c: ChapterRow) => {
      if (!api) return;
      if (!c.can_generate) {
        toast(c.generate_disabled_reason || '服务端暂未开放此章节的生成');
        return;
      }
      const confirmThen = () => {
        api
          .generateChapter(projectId, c.id)
          .then(() => toast(`已提交第${c.chapter_number}章生成任务，可在「任务」页看进度`))
          .catch((e) => toast(friendlyError(e)));
      };
      if (c.word_count > 0) {
        confirm({
          title: '重新生成正文',
          message: `第${c.chapter_number}章已有 ${c.word_count} 字正文，重新生成会覆盖当前内容（原文在服务端保留可回滚）。确定提交吗？`,
          confirmText: '重新生成',
          destructive: true,
          onConfirm: confirmThen,
        });
      } else {
        confirm({
          title: '生成正文',
          message: `提交第${c.chapter_number}章《${c.title || '未命名'}》的 AI 生成任务？`,
          confirmText: '提交生成',
          onConfirm: confirmThen,
        });
      }
    },
    [api, projectId, confirm, toast],
  );

  /** 提交大纲生成/续写任务（弹窗里的确认按钮） */
  const submitOutlineGenerate = () => {
    if (!api || !outlineGen) return;
    const kind = outlineGen;
    const count = outlineCount;
    setOutlineGen(null);
    const call = kind === 'new' ? api.generateOutlines(projectId, count) : api.continueOutlines(projectId, count);
    call
      .then(() => toast(`已提交大纲${kind === 'new' ? '生成' : '续写'}任务（${count} 章）`))
      .catch((e) => toast(friendlyError(e)));
  };

  /** 大纲编辑：从详情切到表单态（同时拉取角色/组织候选名给多选） */
  const startOutlineEdit = () => {
    if (!outlineDetail || !api) return;
    if (charNameOptions === null) {
      api.getCharacters(projectId).then((cs) => setCharNameOptions((cs ?? []).map((c) => c.name).filter(Boolean))).catch(() => setCharNameOptions([]));
    }
    if (orgNameOptions === null) {
      api.getOrganizations(projectId).then((os) => setOrgNameOptions((os ?? []).map((o) => o.name).filter(Boolean))).catch(() => setOrgNameOptions([]));
    }
    const kp = outlineDetail.key_points;
    const kpText = Array.isArray(kp) ? kp.join('\n') : typeof kp === 'string' ? kp : '';
    setOutlineEdit({
      title: outlineDetail.title ?? '',
      summary: typeof outlineDetail.summary === 'string' ? outlineDetail.summary : '',
      emotion: outlineDetail.emotion ?? '',
      goal: outlineDetail.goal ?? '',
      keyPoints: kpText,
      scenes: toSceneEdits(outlineDetail.scenes),
      characters: toNameList(outlineDetail.characters),
      orgs: toNameList(outlineDetail.organizations),
    });
  };

  /** 大纲编辑：保存（PUT 全量覆盖，未编辑字段原样回传，与网页端同口径） */
  const saveOutlineEdit = () => {
    if (!api || !outlineDetail || !outlineEdit) return;
    setOutlineSaving(true);
    const title = outlineEdit.title.trim();
    const summary = outlineEdit.summary.trim();
    const emotion = outlineEdit.emotion.trim();
    const goal = outlineEdit.goal.trim();
    const keyPoints = outlineEdit.keyPoints.split('\n').map((s) => s.trim()).filter(Boolean);
    const scenes = outlineEdit.scenes
      .map((s) => ({ scene_title: s.scene_title.trim(), scene_desc: s.scene_desc.trim(), emotion: s.emotion.trim() }))
      .filter((s) => s.scene_title || s.scene_desc || s.emotion);
    const characters = outlineEdit.characters;
    const organizations = outlineEdit.orgs;
    api
      .updateOutline(projectId, outlineDetail.id, {
        chapter_number: outlineDetail.chapter_number,
        title,
        summary,
        emotion,
        goal,
        key_points: keyPoints,
        scenes,
        characters,
        organizations,
        structure: { ...(outlineDetail.structure ?? {}), title, summary, emotion, goal, key_points: keyPoints },
      })
      .then(() => {
        const updated: OutlineItem = { ...outlineDetail, title, summary, emotion, goal, key_points: keyPoints, scenes, characters, organizations };
        setOutlineDetail(updated);
        setOutlines((prev) => (prev ? prev.map((o) => (o.id === updated.id ? updated : o)) : prev));
        setOutlineEdit(null);
        toast('大纲已保存');
        // 服务端保存时会把标题同步到关联章节，刷新一下章节列表
        load(true);
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setOutlineSaving(false));
  };

  /** 概况：保存项目元信息（网页端仪表盘「项目信息卡」同款字段） */
  const saveAboutEdit = () => {
    if (!api || !project || !aboutEdit || aboutSaving) return;
    if (!aboutEdit.title.trim()) {
      toast('请填写书名');
      return;
    }
    setAboutSaving(true);
    api
      .updateProject(projectId, {
        title: aboutEdit.title.trim(),
        pen_name: aboutEdit.penName.trim(),
        genre: aboutEdit.genre.trim(),
        synopsis: aboutEdit.synopsis,
        narrative_pov: aboutEdit.pov,
        target_platform: aboutEdit.platform,
        target_word_count: Math.max(0, Math.round((Number(aboutEdit.wordsWan) || 0) * 10000)),
      })
      .then(() => {
        setProject((p) =>
          p
            ? {
                ...p,
                title: aboutEdit.title.trim(),
                pen_name: aboutEdit.penName.trim(),
                genre: aboutEdit.genre.trim(),
                synopsis: aboutEdit.synopsis,
                narrative_pov: aboutEdit.pov,
                target_platform: aboutEdit.platform,
                target_word_count: Math.max(0, Math.round((Number(aboutEdit.wordsWan) || 0) * 10000)),
              }
            : p,
        );
        setAboutEdit(null);
        toast('项目信息已保存');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setAboutSaving(false));
  };

  /** 概况：归档/恢复（归档后从书架主列表移到「已归档」） */
  const toggleArchive = () => {
    if (!api || !project || statusBusy) return;
    const archived = project.status === 'archived';
    confirm({
      title: archived ? '恢复作品' : '归档作品',
      message: archived
        ? `把「${project.title}」恢复到书架主列表？`
        : `归档「${project.title}」？正文与设定都保留，书籍移入书架「已归档」分组。`,
      confirmText: archived ? '恢复' : '归档',
      destructive: !archived,
      onConfirm: () => {
        setStatusBusy(true);
        api
          .updateProject(projectId, { status: archived ? 'active' : 'archived' })
          .then(() => {
            setProject((p) => (p ? { ...p, status: archived ? 'active' : 'archived' } : p));
            toast(archived ? '已恢复到书架' : '已归档，可在书架「已归档」分组查看');
          })
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setStatusBusy(false));
      },
    });
  };

  /** key_points 兼容两种来源：服务端是 list[str]，网页端手填的可能是换行分隔字符串 */
  const keyPointList = useMemo(() => {
    const kp = outlineDetail?.key_points;
    if (Array.isArray(kp)) return kp.map((x) => String(x ?? '').trim()).filter(Boolean);
    if (typeof kp === 'string') return kp.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return [];
  }, [outlineDetail]);
  const summaryText = typeof outlineDetail?.summary === 'string' ? outlineDetail.summary.trim() : '';
  /** 详情只读态的场景/角色/组织（与网页端大纲页对齐，App 此前只显示摘要+要点） */
  const detailScenes = useMemo(() => toSceneEdits(outlineDetail?.scenes), [outlineDetail]);
  const detailCharacters = useMemo(() => toNameList(outlineDetail?.characters), [outlineDetail]);
  const detailOrgs = useMemo(() => toNameList(outlineDetail?.organizations), [outlineDetail]);

  /** 1→N 卷→章模式：大纲行是「卷」，点开还要看卷下展开的子章节 */
  const oneToMany = project?.outline_mode === 'one_to_many';

  /** 篇幅模式（网页端 useProjectMode 同款三值）：决定 Tab 裁剪与一键连写入口 */
  const kind = project?.story_kind ?? 'long';
  const isSingle = kind === 'single';
  const tabs = useMemo(() => tabsForKind(kind), [kind]);
  /** 当前 tab 可能被模式裁剪掉（项目加载后才知道 kind，如 single 无大纲）——派生回落到章节，不走 effect */
  const activeTab = tabs.some((t) => t.key === tab) ? tab : 'chapters';

  /** 打开大纲详情；1→N 模式同时拉取卷下子章节（补上章列表里的字数等展示字段） */
  const openOutlineDetail = (o: OutlineItem) => {
    setOutlineDetail(o);
    setSubChapters(null);
    if (oneToMany && api) {
      api
        .getOutlineChapters(projectId, o.id)
        .then((r) =>
          setSubChapters({
            has_chapters: r.has_chapters,
            chapter_count: r.chapter_count,
            chapters: (r.chapters ?? []).map((sc) => ({
              id: sc.id,
              chapter_number: sc.chapter_number,
              sub_index: sc.sub_index,
              title: sc.title,
              status: sc.status,
              word_count: chapters?.find((c) => c.id === sc.id)?.word_count ?? 0,
            })),
          }),
        )
        .catch(() => setSubChapters({ has_chapters: false, chapter_count: 0, chapters: [] }));
    }
  };

  /** 把卷大纲展开成章（1→N 模式；已展开的走追加） */
  const expandThisOutline = () => {
    if (!api || !outlineDetail) return;
    const mode = outlineDetail.has_chapters || subChapters?.has_chapters ? 'append' : 'new';
    confirm({
      title: mode === 'append' ? '追加子章节' : '展开成章',
      message:
        mode === 'append'
          ? `在这一卷末尾再展开 ${expandCount} 章子章节？`
          : `AI 把这一卷大纲展开成 ${expandCount} 章子章节（异步任务，完成后回来下拉刷新）。`,
      confirmText: '提交展开',
      onConfirm: () => {
        api
          .expandOutlineAsync(projectId, outlineDetail.id, expandCount, mode)
          .then(() => toast('已提交展开任务，可在「任务」页看进度'))
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  /** 批量展开所有未展开的卷 */
  const batchExpand = () => {
    if (!api) return;
    confirm({
      title: '批量展开全部未展开的卷',
      message: '每一卷都展开成 3 章子章节（异步任务）。已展开的卷不受影响。',
      confirmText: '批量展开',
      onConfirm: () => {
        api
          .batchExpandOutlinesAsync(projectId, 3)
          .then(() => toast('已提交批量展开任务，可在「任务」页看进度'))
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  /** 子章节进阅读器：优先用章列表行（带 can_generate），找不到就构造最小行 */
  const goSubReader = (sc: { id: number; chapter_number: number; title?: string | null }) => {
    const row = chapters?.find((c) => c.id === sc.id);
    goReader(row ?? ({ id: sc.id, chapter_number: sc.chapter_number, title: sc.title ?? '', can_generate: false } as ChapterRow));
  };

  /** 概况：打开写作风格绑定弹窗（预选当前风格） */
  const openStyleSheet = () => {
    setStyleSheet(true);
    if (styleList === null) {
      api
        ?.getWritingStyles()
        .then((list) => {
          setStyleList(list ?? []);
          const curName = typeof project?.writing_style?.name === 'string' ? project.writing_style.name : null;
          const cur = (list ?? []).find((s) => s.name === curName);
          if (cur) setStyleChoice(String(cur.id));
        })
        .catch((e) => {
          setStyleList([]);
          toast(friendlyError(e));
        });
    }
  };

  /** 概况：把风格绑定到本项目 */
  const applyStyleChoice = () => {
    if (!api || !styleChoice || styleApplying) return;
    setStyleApplying(true);
    api
      .applyWritingStyle(Number(styleChoice), projectId)
      .then((r) => {
        setProject((p) => (p ? { ...p, writing_style: { ...(p.writing_style ?? {}), name: r.style_name } } : p));
        setStyleSheet(false);
        toast(`已切换为「${r.style_name}」，之后的生成走新文风`);
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setStyleApplying(false));
  };

  /** 短篇故事卡：打开编辑弹窗（八字段整卡替换） */
  const openStoryCard = () => {
    setCardDraft({ ...(project?.story_card ?? {}) });
  };

  const saveStoryCard = () => {
    if (!api || !cardDraft || cardSaving) return;
    setCardSaving(true);
    api
      .updateStoryCard(projectId, cardDraft)
      .then(() => {
        setProject((p) => (p ? { ...p, story_card: cardDraft } : p));
        setCardDraft(null);
        toast('故事卡已保存');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setCardSaving(false));
  };

  /** 多章短篇全书审稿：读结果（无则可现场发起审稿任务） */
  const openBookReview = () => {
    setBookReviewOpen(true);
    setBookReview(undefined);
    api
      ?.getShortReviewBook(projectId)
      .then((r) => setBookReview(r.short_review_book ?? null))
      .catch((e) => {
        setBookReview(null);
        toast(friendlyError(e));
      });
  };

  const submitBookReview = () => {
    if (!api || bookReviewBusy) return;
    confirm({
      title: '全书审稿',
      message: 'AI 跨章通审整本短篇（三行留人/信息差/回甘），异步任务，完成后回来点开查看。',
      confirmText: '开始审稿',
      onConfirm: () => {
        setBookReviewBusy(true);
        api
          .shortReviewBookAsync(projectId)
          .then(() => toast('已提交全书审稿任务，可在「任务」页看进度'))
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setBookReviewBusy(false));
      },
    });
  };

  /** 章节列表元素缓存：打开弹窗/Toast/切分栏等界面态变化不重渲整张章列表 */
  const chapterList = useMemo(
    () =>
      chapters?.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => goReader(c)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: c.id === lastRead?.id ? C.goldSoft : pressed ? C.card2 : C.card,
            borderWidth: 1,
            borderColor: c.id === lastRead?.id ? 'rgba(229,181,88,0.35)' : C.borderSoft,
            borderRadius: R.m,
            paddingHorizontal: 12,
            paddingVertical: 10,
          })}
        >
          <ChapterBadge number={c.sub_index && c.generation_mode === 'one_to_many' ? `${c.chapter_number}.${c.sub_index}` : c.chapter_number} written={c.word_count > 0} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.word_count > 0 ? C.text : C.text3, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
              {c.title || '未命名'}
            </Text>
            {c.summary ? (
              <Text style={{ color: C.text3, fontSize: 11 }} numberOfLines={1}>
                {c.summary}
              </Text>
            ) : null}
          </View>
            {c.word_count > 0 && c.status === 'draft' ? <Chip label="草稿" fg={C.gold} bg={C.goldSoft} /> : null}
            <Text style={{ color: C.text3, fontSize: 11 }}>
              {c.word_count > 0 ? `${c.word_count}字${c.quality_score ? ` · ${c.quality_score}分` : ''}` : '未写'}
            </Text>
          <Pressable
            onPress={() => submitChapterGenerate(c)}
            hitSlop={6}
            style={{
              width: 32,
              height: 32,
              borderRadius: 11,
              backgroundColor: c.can_generate ? C.goldSoft : C.card2,
              borderWidth: 1,
              borderColor: c.can_generate ? 'rgba(229,181,88,0.35)' : C.borderSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="sparkles" size={15} color={c.can_generate ? C.gold : C.text3} />
          </Pressable>
          <Ionicons name="chevron-forward" size={14} color={C.text3} />
        </Pressable>
      )),
    [chapters, lastRead, goReader, submitChapterGenerate],
  );

  if (Number.isNaN(projectId)) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      {confirmNode}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 14, paddingBottom: 36 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.gold} colors={[C.gold]} onRefresh={onRefresh} />}
      >
        <ScreenHeader
          title={project?.title ?? '加载中…'}
          onBack={() => router.back()}
          right={
            <Pressable
              onPress={() => router.push({ pathname: '/project/[id]/chat', params: { id: String(projectId) } })}
              hitSlop={6}
              style={{ paddingHorizontal: 13, height: 36, borderRadius: 12, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.4)', flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name="sparkles" size={15} color={C.gold} />
              <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>AI 助手</Text>
            </Pressable>
          }
        />

        {project === null && !error ? (
          <Skeleton count={3} height={100} />
        ) : error && !project ? (
          <EmptyState icon="cloud-offline-outline" title="加载失败" sub={error} />
        ) : project ? (
          <>
            {/* 概要卡 */}
            <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <CoverArt projectId={projectId} title={project.title} width={66} height={92} refreshKey={coverVersion} />
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {project.genre ? <Chip label={project.genre} fg={C.gold} bg={C.goldSoft} bold /> : null}
                    <Chip label={STORY_KIND_LABEL[project.story_kind] ?? '作品'} fg={C.blue} bg={C.blueSoft} />
                    {project.is_fanfic ? <Chip label="同人" fg={C.purple} bg={C.purpleSoft} /> : null}
                    {project.status === 'archived' ? <Chip label="已归档" fg={C.seal} bg={C.sealSoft} /> : null}
                  </View>
                  {project.synopsis ? (
                    <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={4}>
                      {project.synopsis}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={{ gap: 7 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '700' }}>
                    {fmtWords(project.current_word_count)}
                    {project.target_word_count ? <Text style={{ color: C.text3, fontWeight: '400' }}> / {fmtWords(project.target_word_count)}</Text> : null}
                  </Text>
                  <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>{pct}%</Text>
                </View>
                <ProgressBar pct={pct} />
                <Text style={{ color: C.text3, fontSize: 11 }}>
                  {chapters ? `${chapters.filter((c) => c.word_count > 0).length}/${chapters.length} 章已成文` : ''}
                  {project.updated_at ? ` · 更新于 ${fmtRelative(project.updated_at)}` : ''}
                </Text>
              </View>
            </View>

            {/* 继续阅读 */}
            {lastRead ? (
              <Pressable
                onPress={() => goReader(lastRead)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
                  borderWidth: 1,
                  borderColor: 'rgba(229,181,88,0.4)',
                  borderRadius: R.m,
                  paddingHorizontal: 15,
                  height: 48,
                })}
              >
                <Ionicons name="play" size={17} color={C.gold} />
                <Text style={{ color: C.gold, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  继续阅读 第{lastRead.chapter_number}章 {lastRead.title}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={C.gold} />
              </Pressable>
            ) : null}

            <SegmentedTabs tabs={tabs} active={activeTab} onChange={(k) => setTab(k as TabKey)} />

            {activeTab === 'chapters' ? (
              <>
                {/* 单章成篇没有一键连写（网页端同口径）：动笔路径 = 故事卡 → 章节按段生成 */}
                {!isSingle ? <AutoWriteSheet projectId={projectId} /> : null}
                {chapters === null ? (
                  <Skeleton count={6} height={64} />
                ) : chapters.length === 0 ? (
                  isSingle ? (
                    <EmptyState icon="list-outline" title="还没有正文" sub="先去「概况」填好故事卡，再点章节生成——AI 按结构段一篇写到底" />
                  ) : (
                    <EmptyState icon="list-outline" title="还没有章节" sub="点上方「一键连写」自动生成大纲和正文，或先去大纲分栏补大纲" />
                  )
                ) : (
                  <View style={{ gap: 8 }}>{chapterList}</View>
                )}
              </>
            ) : null}

            {activeTab === 'outlines' ? (
              outlines === null ? (
                <Skeleton count={5} height={84} />
              ) : outlines.length === 0 ? (
                <View style={{ alignItems: 'center', gap: 16 }}>
                  <EmptyState icon="map-outline" title="还没有大纲" sub="先给这本书生成前几章的大纲，再逐章生成正文" />
                  <Pressable
                    onPress={() => {
                      setOutlineCount(5);
                      setOutlineGen('new');
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 46, paddingHorizontal: 24, borderRadius: 14, backgroundColor: C.gold }}
                  >
                    <Ionicons name="sparkles" size={16} color="#1A1206" />
                    <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>生成大纲</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        setOutlineCount(5);
                        setOutlineGen('continue');
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        height: 42,
                        borderRadius: R.m,
                        backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
                        borderWidth: 1,
                        borderColor: 'rgba(229,181,88,0.4)',
                      })}
                    >
                      <Ionicons name="sparkles" size={15} color={C.gold} />
                      <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '700' }}>续写大纲</Text>
                    </Pressable>
                    {oneToMany && outlines.some((o) => !o.has_chapters) ? (
                      <Pressable
                        onPress={batchExpand}
                        style={({ pressed }) => ({
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 7,
                          height: 42,
                          borderRadius: R.m,
                          backgroundColor: pressed ? '#20304A' : C.blueSoft,
                          borderWidth: 1,
                          borderColor: 'rgba(106,166,232,0.4)',
                        })}
                      >
                        <Ionicons name="expand-outline" size={15} color={C.blue} />
                        <Text style={{ color: C.blue, fontSize: 13.5, fontWeight: '700' }}>批量展开成章</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {outlines.map((o) => (
                    <Pressable
                      key={o.id}
                      onPress={() => openOutlineDetail(o)}
                      style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 6 })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>{oneToMany ? `第${o.chapter_number}卷` : `第${o.chapter_number}章`}</Text>
                        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                          {o.title || '未命名'}
                        </Text>
                        {oneToMany ? (
                          o.has_chapters ? (
                            <Chip label={`已展开 ${o.chapter_count ?? '?'} 章`} fg={C.green} bg={C.greenSoft} />
                          ) : (
                            <Chip label="未展开" />
                          )
                        ) : o.emotion ? (
                          /* 情绪是一长串"xx→xx→xx"，不限宽会把标题挤没（只见情绪不见标题） */
                          <Chip label={o.emotion} maxWidth={150} />
                        ) : null}
                        <Ionicons name="chevron-forward" size={14} color={C.text3} />
                      </View>
                      {o.summary ? (
                        <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                          {o.summary}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                  <PendingEntitiesCard projectId={projectId} />
                </View>
              )
            ) : null}

            {activeTab === 'blueprint' ? <BlueprintPanel projectId={projectId} /> : null}

            {activeTab === 'characters' ? (
              <CharactersPanel projectId={projectId} />
            ) : null}

            {activeTab === 'world' ? <EntitiesHub projectId={projectId} /> : null}

            {activeTab === 'foreshadow' ? <ForeshadowsPanel projectId={projectId} /> : null}

            {activeTab === 'about' && project ? (
              <>
                <CoverSheet
                  projectId={projectId}
                  initialPrompt={project.cover_prompt}
                  onCoverChanged={() => {
                    setCoverVersion((v) => v + 1);
                    load(true);
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() =>
                      setAboutEdit({
                        title: project.title ?? '',
                        penName: project.pen_name ?? '',
                        genre: project.genre ?? '',
                        pov: project.narrative_pov || '第三人称',
                        platform: project.target_platform || '通用',
                        wordsWan: project.target_word_count ? String(Math.round(project.target_word_count / 10000)) : '',
                        synopsis: typeof project.synopsis === 'string' ? project.synopsis : '',
                      })
                    }
                    style={({ pressed }) => ({
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      height: 42,
                      borderRadius: R.m,
                      backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
                      borderWidth: 1,
                      borderColor: 'rgba(229,181,88,0.4)',
                    })}
                  >
                    <Ionicons name="create-outline" size={15} color={C.gold} />
                    <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>编辑信息</Text>
                  </Pressable>
                  <Pressable
                    onPress={toggleArchive}
                    disabled={statusBusy}
                    style={({ pressed }) => ({
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      height: 42,
                      borderRadius: R.m,
                      backgroundColor: project.status === 'archived' ? C.greenSoft : pressed ? '#31202A' : C.sealSoft,
                      borderWidth: 1,
                      borderColor: project.status === 'archived' ? 'rgba(95,191,143,0.4)' : 'rgba(214,90,69,0.4)',
                      opacity: statusBusy ? 0.6 : 1,
                    })}
                  >
                    <Ionicons name={project.status === 'archived' ? 'refresh-outline' : 'archive-outline'} size={15} color={project.status === 'archived' ? C.green : C.seal} />
                    <Text style={{ color: project.status === 'archived' ? C.green : C.seal, fontSize: 13, fontWeight: '700' }}>
                      {project.status === 'archived' ? '恢复作品' : '归档作品'}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/project-settings', params: { id: String(projectId) } })}
                    style={({ pressed }) => ({
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      height: 42,
                      borderRadius: R.m,
                      backgroundColor: pressed ? C.card2 : C.card,
                      borderWidth: 1,
                      borderColor: C.borderSoft,
                    })}
                  >
                    <Ionicons name="options-outline" size={15} color={C.text2} />
                    <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }}>项目设定</Text>
                  </Pressable>
                  <Pressable
                    onPress={openStyleSheet}
                    style={({ pressed }) => ({
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      height: 42,
                      borderRadius: R.m,
                      backgroundColor: pressed ? C.card2 : C.card,
                      borderWidth: 1,
                      borderColor: C.borderSoft,
                    })}
                  >
                    <Ionicons name="brush-outline" size={15} color={C.text2} />
                    <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                      {typeof project.writing_style?.name === 'string' && project.writing_style.name ? `风格 · ${project.writing_style.name}` : '写作风格'}
                    </Text>
                  </Pressable>
                </View>
                {/* 短篇家族专属：故事卡（结局先行闸门）与全书审稿 */}
                {project.story_kind === 'short' || project.story_kind === 'single' ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable
                      onPress={openStoryCard}
                      style={({ pressed }) => ({
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        height: 42,
                        borderRadius: R.m,
                        backgroundColor: pressed ? '#20304A' : C.blueSoft,
                        borderWidth: 1,
                        borderColor: 'rgba(106,166,232,0.4)',
                      })}
                    >
                      <Ionicons name="library-outline" size={15} color={C.blue} />
                      <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>故事卡</Text>
                    </Pressable>
                    {project.story_kind === 'short' ? (
                      <Pressable
                        onPress={openBookReview}
                        style={({ pressed }) => ({
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          height: 42,
                          borderRadius: R.m,
                          backgroundColor: pressed ? '#173325' : C.greenSoft,
                          borderWidth: 1,
                          borderColor: 'rgba(95,191,143,0.4)',
                        })}
                      >
                        <Ionicons name="reader-outline" size={15} color={C.green} />
                        <Text style={{ color: C.green, fontSize: 13, fontWeight: '700' }}>全书审稿</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 13 }}>
                {project.synopsis ? <Text style={{ color: C.text2, fontSize: 13, lineHeight: 22 }}>{project.synopsis}</Text> : null}
                <View style={{ height: 1, backgroundColor: C.borderSoft }} />
                <InfoRow label="题材" value={project.genre} />
                <InfoRow label="篇幅" value={STORY_KIND_LABEL[project.story_kind] ?? project.story_kind} />
                <InfoRow label="视角" value={project.narrative_pov ?? undefined} />
                <InfoRow label="笔名" value={project.pen_name ?? undefined} />
                <InfoRow label="写作风格" value={typeof project.writing_style?.name === 'string' ? project.writing_style.name : undefined} />
                <InfoRow label="目标平台" value={project.target_platform ?? undefined} />
                <InfoRow label="目标字数" value={project.target_word_count ? fmtWords(project.target_word_count) : undefined} />
                <InfoRow label="创建时间" value={fmtDate(project.created_at)} />
                <InfoRow label="最近更新" value={project.updated_at ? fmtRelative(project.updated_at) : undefined} />
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* 大纲详情 / 编辑 */}
      <SheetModal
        visible={outlineDetail !== null}
        onClose={() => {
          setOutlineDetail(null);
          setOutlineEdit(null);
        }}
        title={`${oneToMany ? '卷' : '第'}${outlineDetail?.chapter_number ?? '—'}${oneToMany ? '' : '章'} · ${outlineDetail?.title || '未命名'}`}
      >
        {outlineDetail ? (
          outlineEdit ? (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 7 }}>
                <FieldLabel>标题</FieldLabel>
                <Input value={outlineEdit.title} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, title: v } : f))} placeholder="本章标题" />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, gap: 7 }}>
                  <FieldLabel>情绪</FieldLabel>
                  <Input value={outlineEdit.emotion} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, emotion: v } : f))} placeholder="如：压抑" />
                </View>
                <View style={{ flex: 1, gap: 7 }}>
                  <FieldLabel>本章目标</FieldLabel>
                  <Input value={outlineEdit.goal} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, goal: v } : f))} placeholder="如：引出反派" />
                </View>
              </View>
              <View style={{ gap: 7 }}>
                <FieldLabel>本章摘要</FieldLabel>
                <Input value={outlineEdit.summary} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, summary: v } : f))} placeholder="本章讲什么" multiline height={110} />
              </View>
              <View style={{ gap: 7 }}>
                <FieldLabel>关键要点（每行一条）</FieldLabel>
                <Input value={outlineEdit.keyPoints} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, keyPoints: v } : f))} placeholder={'主角发现线索\n与反派正面冲突'} multiline height={130} />
              </View>
              <View style={{ gap: 9 }}>
                <FieldLabel>场景（{outlineEdit.scenes.length}）</FieldLabel>
                {outlineEdit.scenes.map((s, i) => (
                  <View key={i} style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.text3, fontSize: 11.5, fontWeight: '700' }}>场景 {i + 1}</Text>
                      <View style={{ flex: 1 }} />
                      <Pressable
                        onPress={() => setOutlineEdit((f) => (f ? { ...f, scenes: f.scenes.filter((_, j) => j !== i) } : f))}
                        hitSlop={6}
                        style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: C.sealSoft, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="close" size={14} color={C.seal} />
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1.4, gap: 6 }}>
                        <FieldLabel>场景标题</FieldLabel>
                        <Input value={s.scene_title} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, scenes: f.scenes.map((sc, j) => (j === i ? { ...sc, scene_title: v } : sc)) } : f))} placeholder="如：祠堂夜谈" />
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <FieldLabel>情绪</FieldLabel>
                        <Input value={s.emotion} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, scenes: f.scenes.map((sc, j) => (j === i ? { ...sc, emotion: v } : sc)) } : f))} placeholder="如：压抑" />
                      </View>
                    </View>
                    <View style={{ gap: 6 }}>
                      <FieldLabel>场景描述</FieldLabel>
                      <Input value={s.scene_desc} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, scenes: f.scenes.map((sc, j) => (j === i ? { ...sc, scene_desc: v } : sc)) } : f))} placeholder="这个场景里发生什么" multiline height={72} />
                    </View>
                  </View>
                ))}
                <Pressable
                  onPress={() => setOutlineEdit((f) => (f ? { ...f, scenes: [...f.scenes, { scene_title: '', scene_desc: '', emotion: '' }] } : f))}
                  style={{ height: 38, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(229,181,88,0.5)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                >
                  <Ionicons name="add" size={14} color={C.gold} />
                  <Text style={{ color: C.gold, fontSize: 13, fontWeight: '600' }}>添加场景</Text>
                </Pressable>
              </View>
              <MultiSelectField
                label="出场角色"
                options={charNameOptions ?? []}
                value={outlineEdit.characters}
                onChange={(v) => setOutlineEdit((f) => (f ? { ...f, characters: v } : f))}
                placeholder="从已有角色选择"
              />
              <MultiSelectField
                label="涉及组织"
                options={orgNameOptions ?? []}
                value={outlineEdit.orgs}
                onChange={(v) => setOutlineEdit((f) => (f ? { ...f, orgs: v } : f))}
                placeholder="从已有组织选择"
                fg={C.blue}
                bg={C.blueSoft}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                <Pressable
                  onPress={() => setOutlineEdit(null)}
                  disabled={outlineSaving}
                  style={{ flex: 1, height: 44, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={saveOutlineEdit}
                  disabled={outlineSaving}
                  style={{ flex: 1.6, height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}
                >
                  {outlineSaving ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={16} color="#1A1206" />}
                  <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{outlineSaving ? '保存中…' : '保存大纲'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
            {(outlineDetail.emotion || outlineDetail.goal) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {outlineDetail.emotion ? <Chip label={`情绪 · ${outlineDetail.emotion}`} fg={C.gold} bg={C.goldSoft} maxWidth="100%" multiline /> : null}
                {outlineDetail.goal ? <Chip label={`目标 · ${outlineDetail.goal}`} maxWidth="100%" multiline /> : null}
              </View>
            )}
            {summaryText ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 6 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>本章摘要</Text>
                <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 22 }}>{summaryText}</Text>
              </View>
            ) : null}
            {keyPointList.length > 0 ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 8 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>关键要点</Text>
                {keyPointList.map((kp, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ color: C.gold, fontSize: 12.5, lineHeight: 20 }}>▪</Text>
                    <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 20, flex: 1 }}>{kp}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {detailScenes.length > 0 ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 10 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>场景（{detailScenes.length}）</Text>
                {detailScenes.map((s, i) => (
                  <View key={i} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.text, fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                        {i + 1}. {s.scene_title || '未命名场景'}
                      </Text>
                      {s.emotion ? <Chip label={s.emotion} maxWidth={160} multiline /> : null}
                    </View>
                    {s.scene_desc ? (
                      <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 19 }}>{s.scene_desc}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            {detailCharacters.length > 0 || detailOrgs.length > 0 ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 8 }}>
                {detailCharacters.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>角色</Text>
                    {detailCharacters.map((n, i) => (
                      <Chip key={i} label={n} maxWidth={140} />
                    ))}
                  </View>
                ) : null}
                {detailOrgs.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>组织</Text>
                    {detailOrgs.map((n, i) => (
                      <Chip key={i} label={n} fg={C.blue} bg={C.blueSoft} maxWidth={140} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {!summaryText && keyPointList.length === 0 && detailScenes.length === 0 ? (
              <Text style={{ color: C.text3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', paddingVertical: 14 }}>
                这{oneToMany ? '卷' : '章'}大纲没有填摘要和要点
              </Text>
            ) : null}

            {/* 1→N 模式：卷下子章节 + 展开成章 */}
            {oneToMany ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 10 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>
                  子章节（{subChapters ? subChapters.chapter_count : (outlineDetail.chapter_count ?? 0)}）
                </Text>
                {subChapters === null ? (
                  <ActivityIndicator color={C.gold} />
                ) : subChapters.chapters.length === 0 ? (
                  <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>这一卷还没有展开成章，点下方按钮展开</Text>
                ) : (
                  subChapters.chapters.map((sc) => (
                    <Pressable
                      key={sc.id}
                      onPress={() => goSubReader(sc)}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.s, paddingVertical: 8, paddingHorizontal: 10 })}
                    >
                      <ChapterBadge number={sc.sub_index ? `${sc.chapter_number}.${sc.sub_index}` : sc.chapter_number} written={(sc.word_count ?? 0) > 0} />
                      <Text style={{ color: (sc.word_count ?? 0) > 0 ? C.text : C.text3, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                        {sc.title || '未命名'}
                      </Text>
                      <Text style={{ color: C.text3, fontSize: 11 }}>{(sc.word_count ?? 0) > 0 ? `${sc.word_count}字` : '未写'}</Text>
                      <Ionicons name="chevron-forward" size={13} color={C.text3} />
                    </Pressable>
                  ))
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: C.text3, fontSize: 11.5 }}>{subChapters?.has_chapters ? '追加' : '展开'}</Text>
                  {[2, 3, 5].map((n) => {
                    const on = expandCount === n;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setExpandCount(n)}
                        style={{
                          paddingHorizontal: 13,
                          height: 30,
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: on ? C.goldSoft : C.card2,
                          borderWidth: 1,
                          borderColor: on ? 'rgba(229,181,88,0.45)' : C.border,
                        }}
                      >
                        <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{n} 章</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  onPress={expandThisOutline}
                  style={{ height: 38, borderRadius: R.m, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                >
                  <Ionicons name="expand-outline" size={14} color={C.blue} />
                  <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>
                    {subChapters?.has_chapters ? `追加 ${expandCount} 章子章节` : `AI 展开成 ${expandCount} 章`}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              onPress={startOutlineEdit}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                height: 42,
                borderRadius: R.m,
                backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
                borderWidth: 1,
                borderColor: 'rgba(229,181,88,0.4)',
              })}
            >
              <Ionicons name="create-outline" size={15} color={C.gold} />
              <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '700' }}>编辑大纲</Text>
            </Pressable>
            </View>
          )
        ) : null}
      </SheetModal>

      {/* 编辑项目信息：网页端仪表盘「项目信息卡」同款字段 */}
      <SheetModal visible={aboutEdit !== null} onClose={() => setAboutEdit(null)} title="编辑项目信息">
        {aboutEdit ? (
          <>
            <View style={{ gap: 7 }}>
              <FieldLabel>书名 *</FieldLabel>
              <Input value={aboutEdit.title} onChangeText={(v) => setAboutEdit((f) => (f ? { ...f, title: v } : f))} placeholder="书名" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 7 }}>
                <FieldLabel>笔名</FieldLabel>
                <Input value={aboutEdit.penName} onChangeText={(v) => setAboutEdit((f) => (f ? { ...f, penName: v } : f))} placeholder="用于封面与导出" />
              </View>
              <View style={{ flex: 1, gap: 7 }}>
                <FieldLabel>题材</FieldLabel>
                <Input value={aboutEdit.genre} onChangeText={(v) => setAboutEdit((f) => (f ? { ...f, genre: v } : f))} placeholder="如：仙侠" />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1.2 }}>
                <SelectField label="叙事视角" value={aboutEdit.pov} options={withCurrent(POV_OPTIONS, project?.narrative_pov)} onChange={(v) => setAboutEdit((f) => (f ? { ...f, pov: v } : f))} />
              </View>
              <View style={{ flex: 1.4 }}>
                <SelectField label="目标平台" value={aboutEdit.platform} options={withCurrent(PLATFORM_OPTIONS, project?.target_platform)} onChange={(v) => setAboutEdit((f) => (f ? { ...f, platform: v } : f))} />
              </View>
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>目标字数（万）</FieldLabel>
              <Input
                value={aboutEdit.wordsWan}
                onChangeText={(v) => setAboutEdit((f) => (f ? { ...f, wordsWan: v.replace(/[^0-9]/g, '') } : f))}
                placeholder="如 50"
                keyboardType="number-pad"
              />
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>简介</FieldLabel>
              <Input value={aboutEdit.synopsis} onChangeText={(v) => setAboutEdit((f) => (f ? { ...f, synopsis: v } : f))} placeholder="一句话描述故事" multiline height={110} />
            </View>
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>目标平台影响生成调性（书名风格、节奏、爽点设计）</Text>
            <Pressable
              onPress={saveAboutEdit}
              disabled={aboutSaving}
              style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 4 }}
            >
              {aboutSaving ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={17} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{aboutSaving ? '保存中…' : '保存'}</Text>
            </Pressable>
          </>
        ) : null}
      </SheetModal>

      {/* 生成/续写大纲：自绘弹窗选章数（原生 Alert 样式与 App 风格不符） */}
      <SheetModal visible={outlineGen !== null} onClose={() => setOutlineGen(null)} title={outlineGen === 'new' ? '生成大纲' : '续写大纲'}>
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          {outlineGen === 'new' ? '为本书规划开篇的大纲，生成后再逐章写正文。' : '在现有大纲之后接着往下规划，不改动已有章节。'}
        </Text>
        <View style={{ gap: 9 }}>
          <FieldLabel>{outlineGen === 'new' ? '生成章数' : '续写章数'}</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[3, 5, 10].map((n) => {
              const on = outlineCount === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setOutlineCount(n)}
                  style={{
                    paddingHorizontal: 18,
                    height: 38,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? C.goldSoft : C.card2,
                    borderWidth: 1,
                    borderColor: on ? 'rgba(229,181,88,0.45)' : C.border,
                  }}
                >
                  <Text style={{ color: on ? C.gold : C.text2, fontSize: 13.5, fontWeight: on ? '700' : '500' }}>{n} 章</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Pressable
          onPress={submitOutlineGenerate}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
        >
          <Ionicons name="sparkles" size={16} color="#1A1206" />
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>
            {outlineGen === 'new' ? '生成' : '续写'} {outlineCount} 章大纲
          </Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>生成中不会占住手机，完成后在大纲列表下拉刷新</Text>
      </SheetModal>

      {/* 写作风格绑定：换风格只影响之后的生成，已生成正文不变 */}
      <SheetModal visible={styleSheet} onClose={() => setStyleSheet(false)} title="写作风格">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          切换后本书后续生成的大纲与正文走新文风，已生成的内容保持不变。
        </Text>
        {styleList === null ? (
          <ActivityIndicator color={C.gold} />
        ) : (
          <>
            <SelectField
              label="风格"
              value={styleChoice}
              options={styleList.map((s) => ({ value: String(s.id), label: `${s.name}${s.is_preset ? '（内置）' : ''}`, hint: s.is_default ? '当前默认' : undefined }))}
              onChange={setStyleChoice}
              placeholder="选择风格"
            />
            <Pressable
              onPress={applyStyleChoice}
              disabled={!styleChoice || styleApplying}
              style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: !styleChoice || styleApplying ? 0.6 : 1 }}
            >
              {styleApplying ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={17} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{styleApplying ? '绑定中…' : '绑定到本书'}</Text>
            </Pressable>
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>风格库在「设置 → 写作风格」里管理</Text>
          </>
        )}
      </SheetModal>

      {/* 短篇故事卡：八字段整卡编辑（结局为空时网页工作台禁止生成——结局先行） */}
      <SheetModal visible={cardDraft !== null} onClose={() => setCardDraft(null)} title="故事卡">
        {cardDraft ? (
          <>
            <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
              把卖点、反转和结局想清楚再动笔——正文生成会按这张卡对账。
            </Text>
            {(
              [
                ['premise', '卖点（一句话）', '为什么这个故事值得看'],
                ['hook', '开场钩子', '前三行抛出什么悬念/反差'],
                ['protagonist', '主角', '谁的眼睛看故事'],
                ['goal', '目标', '主角想要什么'],
                ['conflict', '冲突与阻力', '什么拦着主角'],
                ['antagonist', '对手', '人或环境都可以'],
                ['twist', '关键反转', '读者相信什么、真相是什么、哪一刻揭穿'],
                ['ending', '结局（结局先行）', '以什么收束模式结尾'],
              ] as [keyof StoryCard, string, string][]
            ).map(([key, label, hint]) => (
              <View key={String(key)} style={{ gap: 6 }}>
                <FieldLabel>{label}</FieldLabel>
                <Input
                  value={typeof cardDraft[key] === 'string' ? (cardDraft[key] as string) : ''}
                  onChangeText={(v) => setCardDraft((f) => (f ? { ...f, [key]: v } : f))}
                  placeholder={hint}
                  multiline={key === 'twist' || key === 'ending'}
                  height={key === 'twist' || key === 'ending' ? 72 : undefined}
                />
              </View>
            ))}
            <Pressable
              onPress={saveStoryCard}
              disabled={cardSaving}
              style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 4 }}
            >
              {cardSaving ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={17} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{cardSaving ? '保存中…' : '保存故事卡'}</Text>
            </Pressable>
          </>
        ) : null}
      </SheetModal>

      {/* 多章短篇全书审稿：结果查看 + 现场发起 */}
      <SheetModal visible={bookReviewOpen} onClose={() => setBookReviewOpen(false)} title="全书审稿（短篇）">
        {bookReview === undefined ? (
          <ActivityIndicator color={C.gold} />
        ) : (
          <>
            {bookReview ? (
              <ShortReviewView review={bookReview} />
            ) : (
              <Text style={{ color: C.text3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', paddingVertical: 8 }}>
                还没有全书审稿结果。
              </Text>
            )}
            <Pressable
              onPress={submitBookReview}
              disabled={bookReviewBusy}
              style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: bookReviewBusy ? 0.7 : 1 }}
            >
              {bookReviewBusy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{bookReview ? '重新审稿' : '开始全书审稿'}</Text>
            </Pressable>
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>AI 跨章通审整本（三行留人/信息差/回甘），任务页看进度</Text>
          </>
        )}
      </SheetModal>
    </SafeAreaView>
  );
}
