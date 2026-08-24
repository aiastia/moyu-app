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
import type { ChapterFull, RegenTask } from '@/lib/api';
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

/** 重写任务状态 → 中文 */
const REGEN_STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  running: '重写中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

/** AI 工具弹窗的子页 */
type ToolPage = 'menu' | 'polish' | 'regen' | 'history' | `history:${number}` | 'restore';

const BODY_LINE_HEIGHT = 24;
const BODY_MIN_HEIGHT = 240;

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
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbH(e.endCoordinates.height));
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
    toolPage === 'menu' ? 'AI 工具' : toolPage === 'polish' ? '整章润色' : toolPage === 'regen' ? 'AI 重写本章' : toolPage === 'restore' ? '恢复润色前原文' : '重写历史';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {toastNode}
      {confirmNode}
      {/* 顶栏（固定不随正文滚动） */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: SP.l, paddingBottom: 8, gap: 8 }}>
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
      </View>

      {chapter === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.gold} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* 正文整页滚动区：EditText 撑到内容全高，不再内部滚动（滚动交给 ScrollView，
              惯性/边缘效果与阅读页一致）；右侧覆盖式细滑杆不再挤占正文宽度 */}
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: kbH > 0 ? kbH + 48 : 60 }}
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

          {/* 覆盖式快速跳转滑杆：平时只是右缘一条细轨，拖动时 thumb 跟随滚动位置 */}
          <View
            style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 26, justifyContent: 'center' }}
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

          {/* 底栏（固定）：字数/脏标记/评分 + 跳转百分比（仅拖动时显示） */}
          <View style={{ paddingBottom: insets.bottom + 6, paddingHorizontal: SP.l, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.borderSoft, backgroundColor: C.bg, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: C.text3, fontSize: 11.5, flex: 1 }}>
              {stats.len} 字{stats.dirty ? ' · 有未保存修改' : ''}
              {jumpPct != null ? ` · 跳至 ${jumpPct}%` : ''}
            </Text>
            {chapter.raw_output ? <Chip label="已润色" fg={C.green} bg={C.greenSoft} /> : null}
            {chapter.quality_score ? <Text style={{ color: C.gold, fontSize: 11.5 }}>评分 {chapter.quality_score}</Text> : null}
          </View>
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
            {[
              { page: 'polish' as ToolPage, icon: 'color-filter-outline' as const, color: C.blue, title: '整章润色', sub: '去 AI 味 / 人化重写，完成后自动覆盖并备份原文' },
              { page: 'regen' as ToolPage, icon: 'swap-horizontal-outline' as const, color: C.gold, title: 'AI 重写本章', sub: '按你的要求重写一版草稿，不覆盖正文，对比后手动应用' },
              { page: 'history' as ToolPage, icon: 'time-outline' as const, color: C.purple, title: '重写历史', sub: '历次重写草稿对比与应用（回滚也在这里）' },
            ].map((item) => (
              <Pressable
                key={item.page}
                onPress={() => openTool(item.page)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: R.m, backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft })}
              >
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={item.icon} size={17} color={item.color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{item.title}</Text>
                  <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={C.text3} />
              </Pressable>
            ))}
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
        ) : null}
      </SheetModal>
    </View>
  );
}
