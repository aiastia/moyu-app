import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, FieldLabel, Input, SelectField, SheetModal, useConfirm, useToast } from '@/components/ui';
import { ShortReviewView } from '@/components/ShortReviewView';
import type { ChapterFull, ChapterSegmentRow, RegenTask } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { fmtRelative } from '@/lib/format';
import { C, R, SP } from '@/lib/theme';
import { bumpChapterVersion } from '@/lib/version';

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿', hint: '创作中，还会继续修改' },
  { value: 'completed', label: '已完成', hint: '定稿章节（生成完默认置为已完成）' },
];

const POLISH_SKILL_OPTIONS = [
  { value: 'ai_denoising', label: '去 AI 味（轻度）', hint: '局部去味，改动小、保结构' },
  { value: 'humanize_pro', label: '人化重写（深度）', hint: '深度重写，文风更自然但改动大' },
];

/** 段状态 → 中文 */
const SEG_STATUS_LABEL: Record<string, string> = {
  pending: '待生成',
  running: '生成中',
  done: '已完成',
  failed: '失败',
};

/** 重写任务状态 → 中文 */
const REGEN_STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  running: '重写中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

/** AI 工具弹窗的子页（segs=段列表，seg:N=第 N 段详情） */
type ToolPage = 'menu' | 'polish' | 'regen' | 'history' | `history:${number}` | 'restore' | 'segs' | `seg:${number}` | 'shortreview';

const BODY_LINE_HEIGHT = 24;
const BODY_MIN_HEIGHT = 240;

/** AI 工具菜单行（图标 + 标题 + 说明 + 箭头） */
function MenuRow({ icon, color, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: R.m, backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={C.text3} />
    </Pressable>
  );
}

export default function EditorScreen() {
  const { projectId: pid, chapterId: cid } = useLocalSearchParams<{ projectId: string; chapterId: string }>();
  const projectId = Number(pid);
  const chapterId = Number(cid);
  const { api, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [chapter, setChapter] = useState<ChapterFull | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('draft');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 正文用非受控输入（defaultValue + ref）：受控时每个按键都会带着几千字的 value 重渲染
   *  整页；字数/脏标记走 300ms 防抖，仅供底栏和保存按钮参考。 */
  const contentRef = useRef('');
  const titleRef = useRef('');
  const [stats, setStats] = useState({ len: 0, dirty: false });
  const statsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** statusOverride：切状态时事件闭包里的新值（此时 state 里的 status 还没更新） */
  const isDirtyNow = (statusOverride?: string) =>
    !!chapter &&
    (titleRef.current !== (chapter.title ?? '') ||
      contentRef.current !== (chapter.content ?? '') ||
      (statusOverride ?? status) !== (chapter.status ?? 'draft'));

  const scheduleStats = (statusOverride?: string) => {
    if (statsTimer.current) clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => {
      setStats({ len: contentRef.current.length, dirty: isDirtyNow(statusOverride) });
    }, 300);
  };

  const touchStats = () => scheduleStats();

  // ===== 整页滚动结构：ScrollView 承担滚动（惯性/回弹与阅读页一致），
  //       TextInput 撑到内容全高不内部滚动，滚动/跳转都作用于整页 =====
  const scrollRef = useRef<ScrollView>(null);
  /** 正文测得的内容高度（撑高 TextInput 用） */
  const [bodyH, setBodyH] = useState(0);
  /** 滚动可视高度与内容总高（滑杆映射用） */
  const viewHRef = useRef(0);
  const [scrollInfo, setScrollInfo] = useState({ view: 0, content: 0 });
  /** 滑杆 thumb 的原生驱动动画值（跟随滚动位置）。useState 惰性初始化保持实例稳定，
   *  避免 useRef 存 Animated.Value 被 lint 判成「渲染期读 ref」 */
  const [scrollY] = useState(() => new Animated.Value(0));
  const [railH, setRailH] = useState(0);
  const [jumpPct, setJumpPct] = useState<number | null>(null);
  /** 键盘高度（展开底部占位，让文末能滚到键盘上方） */
  const [kbH, setKbH] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbH(e.endCoordinates.height);
      // 点在文末附近时键盘弹出会把那一段压到可视区外（光标所在的行看不见），
      // 滚到底把光标区域带回键盘上方的视野
      const len = Math.max(1, contentRef.current.length);
      if (caretRef.current > len * 0.75) {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      }
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const maxScroll = Math.max(1, scrollInfo.content - scrollInfo.view);

  /** 键盘弹出时在文末追加输入：把新行滚进视野（安卓原生带不动外层 ScrollView 的兜底） */
  const ensureCaretVisible = () => {
    if (!kbH || !viewHRef.current) return;
    const len = Math.max(1, contentRef.current.length);
    // 只处理「在文末附近输入」的场景；中间编辑交给系统行为
    if ((caretRef.current ?? 0) < len * 0.92) return;
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  /** 光标位置（估算文末输入用），由 onSelectionChange 维护 */
  const caretRef = useRef(0);

  const jumpAt = (y: number) => {
    const h = railH || 1;
    const ratio = Math.max(0, Math.min(1, y / h));
    scrollRef.current?.scrollTo({ y: ratio * maxScroll, animated: false });
    setJumpPct(Math.round(ratio * 100));
  };

  const endJump = () => setJumpPct(null);

  /** 右侧覆盖式跳转滑杆：拖动映射到整页滚动 offset（不再移动光标）。
   *  useState 惰性初始化只建一次；回调里读的 ref 都在手势时机才解引用 */
  // eslint-disable-next-line react-hooks/refs -- PanResponder 回调到手势时机才读 ref，非渲染期
  const [sliderPan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => jumpAt(e.nativeEvent.locationY),
      onPanResponderMove: (e) => jumpAt(e.nativeEvent.locationY),
      onPanResponderRelease: endJump,
      onPanResponderTerminate: endJump,
    }),
  );

  const load = useCallback(async () => {
    if (!api || Number.isNaN(projectId) || Number.isNaN(chapterId)) return;
    try {
      const ch = await api.getChapter(projectId, chapterId);
      setChapter(ch);
      setTitle(ch.title ?? '');
      setStatus(ch.status || 'draft');
      titleRef.current = ch.title ?? '';
      contentRef.current = ch.content ?? '';
      /* eslint-disable-next-line react-hooks/immutability -- 异步回调里复位光标 */
      caretRef.current = 0;
      setStats({ len: (ch.content ?? '').length, dirty: false });
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }
      setError(friendlyError(e));
    }
  }, [api, projectId, chapterId, logout]);

  /** 项目篇幅（短篇审稿入口只对 short/single 显示；失败按长篇处理不影响编辑） */
  const [storyKind, setStoryKind] = useState('long');
  useEffect(() => {
    if (!api || Number.isNaN(projectId)) return;
    api.getProject(projectId).then((p) => setStoryKind(p.story_kind || 'long')).catch(() => undefined);
  }, [api, projectId]);

  // ===== 段级行（短篇分段章）：segments 非空 = 分段章，整篇润色/重写走段级端点 =====
  const [segs, setSegs] = useState<ChapterSegmentRow[] | null>(null);
  const segmented = !!segs && segs.length > 0;

  const refreshSegs = useCallback(() => {
    if (!api || Number.isNaN(projectId) || Number.isNaN(chapterId)) return;
    api
      .getChapterSegments(projectId, chapterId)
      .then((r) => setSegs(r.segments ?? []))
      .catch(() => setSegs([]));
  }, [api, projectId, chapterId]);

  useEffect(() => {
    refreshSegs();
  }, [refreshSegs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首载拉数据，与各面板同款
    load();
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (statsTimer.current) clearTimeout(statsTimer.current);
    };
  }, [load]);

  const save = async () => {
    if (!api || saving) return;
    const content = contentRef.current;
    const trimmedTitle = titleRef.current.trim();
    // 以按下瞬间的实时内容判断，不被 300ms 防抖卡住
    if (!chapter || (trimmedTitle === (chapter.title ?? '') && content === (chapter.content ?? '') && status === (chapter.status ?? 'draft'))) return;
    setSaving(true);
    try {
      await api.updateChapter(projectId, chapterId, { title: trimmedTitle, content, status });
      bumpChapterVersion(projectId, chapterId);
      setChapter((c) => (c ? { ...c, title: trimmedTitle, content, status, word_count: content.length } : c));
      setStats({ len: content.length, dirty: false });
      setSaved(true);
      savedTimer.current = setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  // ===== AI 工具：润色 / 重写 / 重写历史 =====
  const [toolPage, setToolPage] = useState<ToolPage | null>(null);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [polishSkill, setPolishSkill] = useState('ai_denoising');
  const [polishNote, setPolishNote] = useState('');
  const [polishBusy, setPolishBusy] = useState(false);
  const [regenNote, setRegenNote] = useState('');
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenList, setRegenList] = useState<RegenTask[] | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);

  // ===== 段级工具状态（seg:N 详情页） =====
  const [segDraft, setSegDraft] = useState('');
  const [segSaving, setSegSaving] = useState(false);
  const [segSkill, setSegSkill] = useState('ai_denoising');
  const [segNote, setSegNote] = useState('');
  const [segChain, setSegChain] = useState(false);
  const [segBusy, setSegBusy] = useState(false);
  /** 短篇审稿结果页的提交/刷新态 */
  const [reviewBusy, setReviewBusy] = useState(false);

  const currentSeg = useMemo(() => {
    if (toolPage && toolPage.startsWith('seg:')) {
      const idx = Number(toolPage.slice('seg:'.length));
      return segs?.find((s) => s.seg_index === idx) ?? null;
    }
    return null;
  }, [toolPage, segs]);

  /** 进入段详情时把段正文灌进编辑草稿 */
  const openSeg = (idx: number) => {
    const s = segs?.find((x) => x.seg_index === idx);
    setSegDraft(s?.content ?? '');
    setSegNote('');
    setSegChain(false);
    setToolPage(`seg:${idx}`);
  };

  const saveSeg = () => {
    if (!api || !currentSeg || segSaving) return;
    setSegSaving(true);
    api
      .updateChapterSegment(projectId, chapterId, currentSeg.seg_index, segDraft)
      .then(() => {
        toast(`第 ${currentSeg.seg_index} 段已保存`);
        refreshSegs();
        bumpChapterVersion(projectId, chapterId);
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setSegSaving(false));
  };

  /** 段级 AI 任务（生成/重写/润色）：统一确认提交 */
  const submitSegTask = (kind: 'generate' | 'rewrite' | 'polish') => {
    if (!api || !currentSeg || segBusy) return;
    if (kind === 'polish' && !(currentSeg.content || '').trim()) {
      toast('该段还没有内容，先保存或生成');
      return;
    }
    const labels = { generate: '生成', rewrite: '重写', polish: '润色' };
    const extra = kind === 'rewrite' && segChain ? '，并连锁重写后续段' : '';
    confirm({
      title: `${labels[kind]}第 ${currentSeg.seg_index} 段`,
      message: `AI 对这一段执行${labels[kind]}${extra}（异步任务，任务页看进度）。章合并缓存会自动重算。`,
      confirmText: '提交',
      onConfirm: () => {
        setSegBusy(true);
        const call =
          kind === 'generate'
            ? api.generateSegmentAsync(projectId, chapterId, currentSeg.seg_index, segNote.trim())
            : kind === 'rewrite'
              ? api.rewriteSegmentAsync(projectId, chapterId, currentSeg.seg_index, { chain: segChain, user_instructions: segNote.trim() })
              : api.polishSegmentAsync(projectId, chapterId, currentSeg.seg_index, segSkill as 'ai_denoising' | 'humanize_pro', segNote.trim());
        call
          .then(() => toast(`已提交${labels[kind]}任务，完成后回本页下拉查看新正文`))
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setSegBusy(false));
      },
    });
  };

  /** 提交短篇单章审稿（结果存 chapter.short_review，完成后刷新可看） */
  const submitShortReview = () => {
    if (!api || reviewBusy) return;
    confirm({
      title: '短篇审稿',
      message: 'AI 按三标准（前三行留人/信息差账本/结尾回甘）审本章，结果回存到章节（异步任务）。',
      confirmText: '开始审稿',
      onConfirm: () => {
        setReviewBusy(true);
        api
          .shortReviewAsync(projectId, chapterId)
          .then(() => toast('已提交审稿任务，完成后回本页刷新查看结果'))
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setReviewBusy(false));
      },
    });
  };

  const openTool = (page: ToolPage) => {
    setToolPage(page);
    if (page === 'history') {
      setRegenList(null);
      api
        ?.getRegenTasks(projectId, chapterId)
        .then((list) => setRegenList(list ?? []))
        .catch((e) => {
          setRegenList([]);
          toast(friendlyError(e));
        });
    }
  };

  const submitPolish = () => {
    if (!api || !chapter || polishBusy) return;
    confirm({
      title: '整章润色',
      message: `AI 会按「${POLISH_SKILL_OPTIONS.find((o) => o.value === polishSkill)?.label}」重写本章并直接覆盖正文（约几分钟，任务页看进度）。润色前原文会备份，可随时在本弹窗恢复。`,
      confirmText: '提交润色',
      onConfirm: () => {
        setPolishBusy(true);
        api
          .polishChaptersAsync(projectId, [chapterId], polishSkill as 'ai_denoising' | 'humanize_pro', polishNote.trim())
          .then(() => {
            setToolPage(null);
            toast('已提交润色任务，完成后回本页重新进入即可看到新正文');
          })
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setPolishBusy(false));
      },
    });
  };

  const submitRegen = () => {
    if (!api || regenBusy) return;
    if (!regenNote.trim()) {
      toast('写一句重写要求，比如「加强打斗描写」');
      return;
    }
    setRegenBusy(true);
    api
      .regenerateChapterAsync(projectId, chapterId, regenNote.trim())
      .then(() => {
        setToolPage(null);
        setRegenNote('');
        toast('已提交重写任务：只产草稿不覆盖正文，完成后在「重写历史」里对比应用');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setRegenBusy(false));
  };

  const applyRegen = (t: RegenTask) => {
    if (!api || applyBusy) return;
    confirm({
      title: `应用重写稿 v${t.version_number ?? '?'}`,
      message: `用重写稿（${t.regenerated_word_count ?? '?'} 字，与原文差异 ${t.diff_ratio != null ? `${Math.round((t.diff_ratio as number) * 100)}%` : '—'}）覆盖当前正文？当前正文不会丢——再从历史里应用原版本即可找回。`,
      confirmText: '应用',
      onConfirm: () => {
        setApplyBusy(true);
        api
          .applyRegenTask(projectId, chapterId, t.id)
          .then(() => {
            bumpChapterVersion(projectId, chapterId);
            setToolPage(null);
            toast('已应用重写稿');
            load();
          })
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setApplyBusy(false));
      },
    });
  };

  /** 撤销润色：把服务端备份的 raw_output 写回正文 */
  const restorePolish = () => {
    if (!api || !chapter?.raw_output || restoreBusy) return;
    confirm({
      title: '恢复润色前原文',
      message: `把正文回退为润色前的原文（约 ${chapter.raw_word_count ?? chapter.raw_output.length} 字）？当前润色版会被覆盖。`,
      confirmText: '恢复',
      destructive: true,
      onConfirm: () => {
        setRestoreBusy(true);
        api
          .updateChapter(projectId, chapterId, { content: chapter.raw_output! })
          .then(() => {
            bumpChapterVersion(projectId, chapterId);
            setToolPage(null);
            toast('已恢复润色前原文');
            load();
          })
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setRestoreBusy(false));
      },
    });
  };

  const currentRegen = useMemo(() => {
    if (toolPage && toolPage.startsWith('history:')) {
      const id = Number(toolPage.slice('history:'.length));
      return regenList?.find((t) => t.id === id) ?? null;
    }
    return null;
  }, [toolPage, regenList]);

  const thumbTranslate = scrollY.interpolate({
    inputRange: [0, maxScroll],
    outputRange: [0, Math.max(1, railH - 22)],
    extrapolate: 'clamp',
  });

  const toolTitle =
    toolPage === 'menu'
      ? 'AI 工具'
      : toolPage === 'polish'
        ? '整章润色'
        : toolPage === 'regen'
          ? 'AI 重写本章'
          : toolPage === 'restore'
            ? '恢复润色前原文'
            : toolPage === 'history'
              ? '重写历史'
              : toolPage === 'segs'
                ? '分段写作'
                : toolPage === 'shortreview'
                  ? '短篇审稿'
                  : toolPage && toolPage.startsWith('seg:')
                    ? `第 ${Number(toolPage.slice('seg:'.length))} 段`
                    : '';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {toastNode}
      {confirmNode}
      {/* 顶栏（固定不随正文滚动）；点空白收起键盘（v1.8.0 行为，重构时曾丢失） */}
      <Pressable style={{ paddingTop: insets.top + 8, paddingHorizontal: SP.l, paddingBottom: 8, gap: 8 }} onPress={() => Keyboard.dismiss()}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </Pressable>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: C.text3, fontSize: 11 }}>编辑章节</Text>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
              第{chapter?.chapter_number ?? '—'}章 {title || '未命名'}
            </Text>
          </View>
          {kbH > 0 ? (
            <Pressable
              onPress={() => Keyboard.dismiss()}
              hitSlop={6}
              style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="keypad-outline" size={17} color={C.text2} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => openTool('menu')}
            disabled={!chapter}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: C.blueSoft,
              borderWidth: 1,
              borderColor: 'rgba(106,166,232,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: chapter ? 1 : 0.5,
            }}
          >
            <Ionicons name="flash-outline" size={17} color={C.blue} />
          </Pressable>
          <Pressable
            onPress={save}
            disabled={saving}
            style={{
              height: 38,
              paddingHorizontal: 20,
              borderRadius: 12,
              backgroundColor: stats.dirty ? C.gold : C.card2,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={stats.dirty ? '#1A1206' : C.text3} />
            ) : (
              <Ionicons name="save-outline" size={15} color={stats.dirty ? '#1A1206' : C.text3} />
            )}
            <Text style={{ color: stats.dirty ? '#1A1206' : C.text3, fontSize: 14, fontWeight: '800' }}>
              {saving ? '保存中' : saved ? '已保存' : '保存'}
            </Text>
          </Pressable>
        </View>
        {error ? <Text style={{ color: C.seal, fontSize: 12.5, lineHeight: 18 }}>{error}</Text> : null}
      </Pressable>

      {chapter === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.gold} />
        </View>
      ) : (
        <View style={{ flex: 1, paddingBottom: kbH }}>
          {/* 正文整页滚动区：EditText 撑到内容全高，不再内部滚动（滚动交给 ScrollView，
              惯性/边缘效果与阅读页一致）；右侧覆盖式细滑杆不再挤占正文宽度。
              新版安卓 edge-to-edge 下 adjustResize 不再压缩窗口（键盘直接盖住内容），
              键盘高度垫在本容器底部把滚动区整体抬到键盘上方，正文任何位置都不会压在键盘底下 */}
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={(e) => {
              // Android Fabric 下 Animated.event(useNativeDriver) 会让 RN 的
              // _handleScroll 崩（Object is not a function），改为手动 setValue：
              // 同样驱动 thumb 的 Animated 变换，且不触发 React 重渲染
              scrollY.setValue(e.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={16}
            onLayout={(e) => {
              // 先取局部值：Fabric 会在事件回调返回后回收 nativeEvent，
              // setState 更新器延迟执行时再读 e.nativeEvent 会拿到 null
              const vh = e.nativeEvent?.layout?.height ?? 0;
              if (!vh) return;
              viewHRef.current = vh;
              setScrollInfo((s) => (s.view === vh ? s : { ...s, view: vh }));
            }}
            onContentSizeChange={(w, h) => {
              setScrollInfo((s) => (s.content === h ? s : { ...s, content: h }));
            }}
          >
            <TextInput
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                titleRef.current = v;
                touchStats();
              }}
              placeholder="章节标题"
              placeholderTextColor="#5A6170"
              style={{ color: C.text, fontSize: 18, fontWeight: '800', paddingVertical: 6 }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderSoft, marginBottom: 12 }}>
              <Text style={{ color: C.text3, fontSize: 11.5 }}>状态</Text>
              <View style={{ flex: 1 }}>
                <SelectField
                  value={status || 'draft'}
                  options={STATUS_OPTIONS}
                  onChange={(v) => {
                    setStatus(v);
                    // 只切状态不改正文时脏标记也要亮起：闭包里拿新值 v 走同一防抖
                    scheduleStats(v);
                  }}
                />
              </View>
            </View>
            <TextInput
              defaultValue={chapter.content ?? ''}
              onChangeText={(v) => {
                contentRef.current = v;
                touchStats();
              }}
              onSelectionChange={(e) => {
                // 光标位置（估算文末输入用）；事件回调里写 ref 合法
                /* eslint-disable-next-line react-hooks/immutability */
                caretRef.current = e.nativeEvent.selection.start;
              }}
              onContentSizeChange={(e) => {
                const h = e.nativeEvent.contentSize.height;
                setBodyH((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
                ensureCaretVisible();
              }}
              multiline
              textAlignVertical="top"
              placeholder="正文内容…"
              placeholderTextColor="#5A6170"
              style={{ color: C.text, fontSize: 16, lineHeight: BODY_LINE_HEIGHT, minHeight: BODY_MIN_HEIGHT, height: Math.max(BODY_MIN_HEIGHT, bodyH + 8), paddingRight: 22, paddingBottom: 8 }}
            />
          </ScrollView>

          {/* 覆盖式快速跳转滑杆：平时只是右缘一条细轨，拖动时 thumb 跟随滚动位置。
              absolute 定位相对的是 padding box，bottom:0 会伸进键盘垫高区，显式跟 kbH 抬起 */}
          <View
            style={{ position: 'absolute', top: 0, bottom: kbH, right: 0, width: 26, justifyContent: 'center' }}
            onLayout={(e) => setRailH(e.nativeEvent.layout.height)}
            {...sliderPan.panHandlers}
          >
            <View style={{ width: 3, flex: 1, borderRadius: 1.5, backgroundColor: 'rgba(35,42,60,0.9)', alignSelf: 'center', marginVertical: 14 }}>
              <Animated.View
                style={{
                  position: 'absolute',
                  left: -5.5,
                  width: 14,
                  height: 22,
                  top: 0,
                  borderRadius: 5,
                  backgroundColor: C.goldSoft,
                  borderWidth: 1,
                  borderColor: 'rgba(229,181,88,0.55)',
                  transform: [{ translateY: thumbTranslate }],
                }}
              />
            </View>
          </View>

          {/* 底栏（固定）：字数/脏标记/评分 + 跳转百分比（仅拖动时显示）；
              键盘弹出时随容器抬到键盘上方，点空白收起键盘 */}
          <Pressable
            onPress={() => Keyboard.dismiss()}
            style={{ paddingBottom: kbH > 0 ? 8 : insets.bottom + 6, paddingHorizontal: SP.l, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.borderSoft, backgroundColor: C.bg, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Text style={{ color: C.text3, fontSize: 11.5, flex: 1 }}>
              {stats.len} 字{stats.dirty ? ' · 有未保存修改' : ''}
              {jumpPct != null ? ` · 跳至 ${jumpPct}%` : ''}
            </Text>
            {chapter.raw_output ? <Chip label="已润色" fg={C.green} bg={C.greenSoft} /> : null}
            {chapter.quality_score ? <Text style={{ color: C.gold, fontSize: 11.5 }}>评分 {chapter.quality_score}</Text> : null}
          </Pressable>
        </View>
      )}

      {/* AI 工具弹窗 */}
      <SheetModal
        visible={toolPage !== null}
        onClose={() => setToolPage(null)}
        title={toolTitle}
      >
        {toolPage === 'menu' ? (
          <View style={{ gap: 9 }}>
            {segmented ? (
              <Pressable
                onPress={() => setToolPage('segs')}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: R.m, backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)' })}
              >
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="grid-outline" size={17} color={C.blue} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>分段写作（本章 {segs?.length ?? 0} 段）</Text>
                  <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }}>按段编辑 / 生成 / 润色 / 重写，短篇分段章的正文工具都在这里</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={C.text3} />
              </Pressable>
            ) : (
              <>
                <MenuRow
                  icon="color-filter-outline"
                  color={C.blue}
                  title="整章润色"
                  sub="去 AI 味 / 人化重写，完成后自动覆盖并备份原文"
                  onPress={() => openTool('polish')}
                />
                <MenuRow
                  icon="swap-horizontal-outline"
                  color={C.gold}
                  title="AI 重写本章"
                  sub="按你的要求重写一版草稿，不覆盖正文，对比后手动应用"
                  onPress={() => openTool('regen')}
                />
              </>
            )}
            <MenuRow
              icon="time-outline"
              color={C.purple}
              title="重写历史"
              sub="历次重写草稿对比与应用（回滚也在这里）"
              onPress={() => openTool('history')}
            />
            {storyKind === 'short' || storyKind === 'single' ? (
              <MenuRow
                icon="reader-outline"
                color={C.green}
                title="短篇审稿"
                sub={chapter?.short_review ? '已有审稿结果，点开查看（可重新审）' : '前三行留人 / 信息差账本 / 结尾回甘三标准'}
                onPress={() => setToolPage('shortreview')}
              />
            ) : null}
            {segmented ? (
              <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
                本章是分段章：整篇润色/整篇重写会清空分段结构，请走「分段写作」的段级工具
              </Text>
            ) : null}
            {chapter?.raw_output ? (
              <Pressable
                onPress={restorePolish}
                disabled={restoreBusy}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: R.m, backgroundColor: pressed ? '#31202A' : C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', opacity: restoreBusy ? 0.6 : 1 })}
              >
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
                  {restoreBusy ? <ActivityIndicator size="small" color={C.seal} /> : <Ionicons name="arrow-undo-outline" size={17} color={C.seal} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: C.seal, fontSize: 14, fontWeight: '700' }}>恢复润色前原文</Text>
                  <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }}>当前正文是润色版，可回退到润色前的原文</Text>
                </View>
              </Pressable>
            ) : null}
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>润色与重写都是异步任务，提交后在「任务」页看进度</Text>
          </View>
        ) : toolPage === 'segs' ? (
          segs === null ? (
            <ActivityIndicator color={C.gold} />
          ) : (
            <View style={{ gap: 9 }}>
              {segs.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => openSeg(s.seg_index)}
                  style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 5 })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>第 {s.seg_index} 段</Text>
                    {s.function ? <Chip label={s.function} fg={C.blue} bg={C.blueSoft} /> : null}
                    <Chip
                      label={SEG_STATUS_LABEL[s.status] ?? s.status}
                      fg={s.status === 'done' ? C.green : s.status === 'pending' ? C.text3 : C.gold}
                      bg={s.status === 'done' ? C.greenSoft : C.card2}
                    />
                    <View style={{ flex: 1 }} />
                    <Ionicons name="chevron-forward" size={14} color={C.text3} />
                  </View>
                  {s.instruction ? (
                    <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }} numberOfLines={2}>
                      {s.instruction}
                    </Text>
                  ) : null}
                  <Text style={{ color: C.text3, fontSize: 11 }}>
                    {s.word_count} 字{s.words ? ` / 预算 ${s.words}` : ''}
                  </Text>
                </Pressable>
              ))}
              <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>章正文 = 各段拼接；改段后自动重算</Text>
            </View>
          )
        ) : toolPage?.startsWith('seg:') && currentSeg ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {currentSeg.function ? <Chip label={currentSeg.function} fg={C.blue} bg={C.blueSoft} /> : null}
              <Chip
                label={SEG_STATUS_LABEL[currentSeg.status] ?? currentSeg.status}
                fg={currentSeg.status === 'done' ? C.green : currentSeg.status === 'pending' ? C.text3 : C.gold}
                bg={currentSeg.status === 'done' ? C.greenSoft : C.card2}
              />
              <Text style={{ color: C.text3, fontSize: 11.5, flex: 1, textAlign: 'right' }}>
                {currentSeg.word_count} 字{currentSeg.words ? ` / 预算 ${currentSeg.words}` : ''}
              </Text>
            </View>
            {currentSeg.instruction ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11, gap: 4 }}>
                <Text style={{ color: C.text2, fontSize: 11.5, fontWeight: '700' }}>本段写作指令</Text>
                <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 19 }}>{currentSeg.instruction}</Text>
              </View>
            ) : null}
            <View style={{ gap: 7 }}>
              <FieldLabel>段正文（保存后章合并缓存自动重算）</FieldLabel>
              <Input value={segDraft} onChangeText={setSegDraft} placeholder="这一段的正文…" multiline height={160} />
              <Pressable
                onPress={saveSeg}
                disabled={segSaving}
                style={{ height: 42, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: segSaving ? 0.7 : 1 }}
              >
                {segSaving ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="save-outline" size={15} color="#1A1206" />}
                <Text style={{ color: '#1A1206', fontSize: 14, fontWeight: '800' }}>保存本段</Text>
              </Pressable>
            </View>

            <View style={{ gap: 9 }}>
              <FieldLabel>AI 操作（异步任务，任务页看进度）</FieldLabel>
              <SelectField label="润色方式" value={segSkill} options={POLISH_SKILL_OPTIONS} onChange={setSegSkill} />
              <View style={{ gap: 7 }}>
                <FieldLabel>要求（可选，生成/重写/润色共用）</FieldLabel>
                <Input value={segNote} onChangeText={setSegNote} placeholder="如：对话更口语化、节奏再快点" multiline height={70} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => submitSegTask('generate')}
                  disabled={segBusy || currentSeg.status === 'done'}
                  style={({ pressed }) => ({ flex: 1, height: 42, borderRadius: R.m, backgroundColor: currentSeg.status === 'done' ? C.card2 : pressed ? '#20304A' : C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)', alignItems: 'center', justifyContent: 'center', opacity: currentSeg.status === 'done' ? 0.5 : 1 })}
                >
                  <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>{currentSeg.status === 'done' ? '已完成' : '生成此段'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => submitSegTask('rewrite')}
                  disabled={segBusy}
                  style={({ pressed }) => ({ flex: 1, height: 42, borderRadius: R.m, backgroundColor: pressed ? '#3A2F16' : C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.4)', alignItems: 'center', justifyContent: 'center' })}
                >
                  <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>重写此段</Text>
                </Pressable>
                <Pressable
                  onPress={() => submitSegTask('polish')}
                  disabled={segBusy}
                  style={({ pressed }) => ({ flex: 1, height: 42, borderRadius: R.m, backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, alignItems: 'center', justifyContent: 'center' })}
                >
                  <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }}>润色此段</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => setSegChain((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: segChain ? 'rgba(229,181,88,0.55)' : C.border,
                    backgroundColor: segChain ? C.goldSoft : C.card2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {segChain ? <Ionicons name="checkmark" size={13} color={C.gold} /> : null}
                </View>
                <Text style={{ color: C.text2, fontSize: 12.5 }}>重写时连锁重写后续段（后续段按新前文重新生成）</Text>
              </Pressable>
            </View>
          </>
        ) : toolPage === 'polish' ? (
          <>
            <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
              AI 会重写整章并直接覆盖正文；原文自动备份，可随时在 AI 工具里恢复。
            </Text>
            <SelectField label="润色方式" value={polishSkill} options={POLISH_SKILL_OPTIONS} onChange={setPolishSkill} />
            <View style={{ gap: 7 }}>
              <FieldLabel>润色要求（可选）</FieldLabel>
              <Input value={polishNote} onChangeText={setPolishNote} placeholder="如：对话更口语化、减少环境描写" multiline height={80} />
            </View>
            <Pressable onPress={submitPolish} disabled={polishBusy} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: polishBusy ? 0.7 : 1 }}>
              <Ionicons name="sparkles" size={16} color="#1A1206" />
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>提交润色</Text>
            </Pressable>
          </>
        ) : toolPage === 'regen' ? (
          <>
            <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
              AI 会参考本章剧情分析的建议重写一版草稿，不覆盖正文；完成后在「重写历史」里对比、应用。
            </Text>
            <View style={{ gap: 7 }}>
              <FieldLabel>重写要求</FieldLabel>
              <Input value={regenNote} onChangeText={setRegenNote} placeholder="如：加强打斗的紧张感、删掉回忆段落" multiline height={100} />
            </View>
            <Pressable onPress={submitRegen} disabled={regenBusy} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: regenBusy ? 0.7 : 1 }}>
              {regenBusy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="swap-horizontal-outline" size={16} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{regenBusy ? '提交中…' : '提交重写'}</Text>
            </Pressable>
          </>
        ) : toolPage === 'history' ? (
          regenList === null ? (
            <ActivityIndicator color={C.gold} />
          ) : regenList.length === 0 ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 18 }}>
              <Ionicons name="time-outline" size={30} color={C.text3} />
              <Text style={{ color: C.text2, fontSize: 13 }}>本章还没有重写记录，先提交一次「AI 重写本章」</Text>
            </View>
          ) : (
            <View style={{ gap: 9 }}>
              {regenList.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setToolPage(`history:${t.id}`)}
                  style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 6 })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>重写稿 v{t.version_number ?? '?'}</Text>
                    <Chip
                      label={t.is_applied ? '已应用' : REGEN_STATUS_LABEL[t.status ?? ''] ?? (t.status ?? '')}
                      fg={t.is_applied ? C.green : t.status === 'completed' ? C.gold : C.text3}
                      bg={t.is_applied ? C.greenSoft : C.card2}
                    />
                    <View style={{ flex: 1 }} />
                    <Ionicons name="chevron-forward" size={14} color={C.text3} />
                  </View>
                  {t.modification_instructions ? (
                    <Text style={{ color: C.text2, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
                      {t.modification_instructions}
                    </Text>
                  ) : null}
                  <Text style={{ color: C.text3, fontSize: 11 }}>
                    {t.original_word_count ?? '?'} → {t.regenerated_word_count ?? '?'} 字
                    {t.diff_ratio != null ? ` · 差异 ${Math.round((t.diff_ratio as number) * 100)}%` : ''}
                    {t.created_at ? ` · ${fmtRelative(t.created_at)}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          )
        ) : currentRegen ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Chip label={`v${currentRegen.version_number ?? '?'}`} fg={C.gold} bg={C.goldSoft} bold />
              <Chip
                label={currentRegen.is_applied ? '已应用' : REGEN_STATUS_LABEL[currentRegen.status ?? ''] ?? (currentRegen.status ?? '')}
                fg={currentRegen.is_applied ? C.green : currentRegen.status === 'completed' ? C.gold : C.text3}
              />
              <Text style={{ color: C.text3, fontSize: 11.5, flex: 1, textAlign: 'right' }}>
                {currentRegen.original_word_count ?? '?'} → {currentRegen.regenerated_word_count ?? '?'} 字
                {currentRegen.diff_ratio != null ? ` · 差异 ${Math.round((currentRegen.diff_ratio as number) * 100)}%` : ''}
              </Text>
            </View>
            {currentRegen.modification_instructions ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11, gap: 4 }}>
                <Text style={{ color: C.text2, fontSize: 11.5, fontWeight: '700' }}>重写要求</Text>
                <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 19 }}>{currentRegen.modification_instructions}</Text>
              </View>
            ) : null}
            {currentRegen.error ? (
              <View style={{ backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', borderRadius: R.m, padding: 11 }}>
                <Text style={{ color: C.seal, fontSize: 12, lineHeight: 18 }}>{currentRegen.error}</Text>
              </View>
            ) : null}
            {currentRegen.regenerated_content ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 6 }}>
                <Text style={{ color: C.text2, fontSize: 11.5, fontWeight: '700' }}>重写稿预览（前 600 字）</Text>
                <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 20 }}>
                  {currentRegen.regenerated_content.slice(0, 600)}
                  {(currentRegen.regenerated_content.length ?? 0) > 600 ? '\n……' : ''}
                </Text>
              </View>
            ) : (
              <Text style={{ color: C.text3, fontSize: 12.5, textAlign: 'center', paddingVertical: 10 }}>这一版还没有产出正文（未完成或已失败）</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setToolPage('history')} style={{ height: 44, paddingHorizontal: 18, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>返回列表</Text>
              </Pressable>
              <Pressable
                onPress={() => applyRegen(currentRegen)}
                disabled={applyBusy || !currentRegen.regenerated_content}
                style={{ flex: 1, height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: applyBusy || !currentRegen.regenerated_content ? 0.6 : 1 }}
              >
                {applyBusy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark-done-outline" size={16} color="#1A1206" />}
                <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>应用此版本</Text>
              </Pressable>
            </View>
          </>
        ) : toolPage === 'shortreview' ? (
          <>
            {chapter?.short_review ? <ShortReviewView review={chapter.short_review} /> : (
              <Text style={{ color: C.text3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', paddingVertical: 8 }}>
                本章还没有审稿结果。
              </Text>
            )}
            <Pressable
              onPress={submitShortReview}
              disabled={reviewBusy}
              style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: reviewBusy ? 0.7 : 1 }}
            >
              {reviewBusy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{chapter?.short_review ? '重新审稿' : '开始审稿'}</Text>
            </Pressable>
            <Text
              onPress={() => load()}
              style={{ color: C.blue, fontSize: 12, textAlign: 'center' }}
            >
              任务完成后点这里刷新结果
            </Text>
          </>
        ) : null}
      </SheetModal>
    </View>
  );
}
