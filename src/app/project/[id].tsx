import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChapterBadge, Chip, EmptyState, FieldLabel, Input, ProgressBar, ScreenHeader, SegmentedTabs, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import { ForeshadowsPanel } from '@/components/ForeshadowsPanel';
import { CharactersPanel } from '@/components/CharactersPanel';
import { WorldsPanel } from '@/components/WorldsPanel';
import { AutoWriteSheet } from '@/components/AutoWriteSheet';
import { CoverSheet } from '@/components/CoverSheet';
import { CoverArt } from '@/components/CoverArt';
import type { ChapterRow, OutlineItem, ProjectDetail } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, loadLastRead, useAuth } from '@/lib/auth';
import { fmtPercent, fmtRelative, fmtWords, STORY_KIND_LABEL } from '@/lib/format';
import { C, R, SP } from '@/lib/theme';

type TabKey = 'chapters' | 'outlines' | 'characters' | 'world' | 'foreshadow' | 'about';

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

const TABS = [
  { key: 'chapters', label: '章节' },
  { key: 'outlines', label: '大纲' },
  { key: 'characters', label: '角色' },
  { key: 'world', label: '世界' },
  { key: 'foreshadow', label: '伏笔' },
  { key: 'about', label: '概况' },
] as const;

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
  /** 大纲编辑表单（null=详情弹窗处于只读态） */
  const [outlineEdit, setOutlineEdit] = useState<{ title: string; summary: string; emotion: string; goal: string; keyPoints: string; scenes: OutlineSceneEdit[]; charactersText: string; orgsText: string } | null>(null);
  const [outlineSaving, setOutlineSaving] = useState(false);

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

  /** 大纲编辑：从详情切到表单态 */
  const startOutlineEdit = () => {
    if (!outlineDetail) return;
    const kp = outlineDetail.key_points;
    const kpText = Array.isArray(kp) ? kp.join('\n') : typeof kp === 'string' ? kp : '';
    setOutlineEdit({
      title: outlineDetail.title ?? '',
      summary: typeof outlineDetail.summary === 'string' ? outlineDetail.summary : '',
      emotion: outlineDetail.emotion ?? '',
      goal: outlineDetail.goal ?? '',
      keyPoints: kpText,
      scenes: toSceneEdits(outlineDetail.scenes),
      charactersText: toNameList(outlineDetail.characters).join('，'),
      orgsText: toNameList(outlineDetail.organizations).join('，'),
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
    const splitNames = (t: string) => t.split(/[,，、\n]+/).map((s) => s.trim()).filter(Boolean);
    const characters = splitNames(outlineEdit.charactersText);
    const organizations = splitNames(outlineEdit.orgsText);
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
          <ChapterBadge number={c.chapter_number} written={c.word_count > 0} />
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
          <Text style={{ color: C.text3, fontSize: 11 }}>{c.word_count > 0 ? `${c.word_count}字` : '未写'}</Text>
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
        <ScreenHeader title={project?.title ?? '加载中…'} onBack={() => router.back()} />

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

            <SegmentedTabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={(k) => setTab(k as TabKey)} />

            {tab === 'chapters' ? (
              <>
                <AutoWriteSheet projectId={projectId} />
                {chapters === null ? (
                  <Skeleton count={6} height={64} />
                ) : chapters.length === 0 ? (
                  <EmptyState icon="list-outline" title="还没有章节" sub="点上方「一键连写」自动生成大纲和正文，或先去大纲分栏补大纲" />
                ) : (
                  <View style={{ gap: 8 }}>{chapterList}</View>
                )}
              </>
            ) : null}

            {tab === 'outlines' ? (
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
                  <Pressable
                    onPress={() => {
                      setOutlineCount(5);
                      setOutlineGen('continue');
                    }}
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
                    <Ionicons name="sparkles" size={15} color={C.gold} />
                    <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '700' }}>续写大纲</Text>
                  </Pressable>
                  {outlines.map((o) => (
                    <Pressable
                      key={o.id}
                      onPress={() => setOutlineDetail(o)}
                      style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 6 })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>第{o.chapter_number}章</Text>
                        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                          {o.title || '未命名'}
                        </Text>
                        {/* 情绪是一长串"xx→xx→xx"，不限宽会把标题挤没（只见情绪不见标题） */}
                        {o.emotion ? <Chip label={o.emotion} maxWidth={150} /> : null}
                        <Ionicons name="chevron-forward" size={14} color={C.text3} />
                      </View>
                      {o.summary ? (
                        <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                          {o.summary}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              )
            ) : null}

            {tab === 'characters' ? (
              <CharactersPanel projectId={projectId} />
            ) : null}

            {tab === 'world' ? <WorldsPanel projectId={projectId} /> : null}

            {tab === 'foreshadow' ? <ForeshadowsPanel projectId={projectId} /> : null}

            {tab === 'about' && project ? (
              <>
                <CoverSheet
                  projectId={projectId}
                  initialPrompt={project.cover_prompt}
                  onCoverChanged={() => {
                    setCoverVersion((v) => v + 1);
                    load(true);
                  }}
                />
                <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 13 }}>
                {project.synopsis ? <Text style={{ color: C.text2, fontSize: 13, lineHeight: 22 }}>{project.synopsis}</Text> : null}
                <View style={{ height: 1, backgroundColor: C.borderSoft }} />
                <InfoRow label="题材" value={project.genre} />
                <InfoRow label="篇幅" value={STORY_KIND_LABEL[project.story_kind] ?? project.story_kind} />
                <InfoRow label="视角" value={project.narrative_pov ?? undefined} />
                <InfoRow label="笔名" value={project.pen_name ?? undefined} />
                <InfoRow label="目标平台" value={project.target_platform ?? undefined} />
                <InfoRow label="目标字数" value={project.target_word_count ? fmtWords(project.target_word_count) : undefined} />
                <InfoRow label="创建时间" value={project.created_at?.slice(0, 10)} />
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
        title={`第${outlineDetail?.chapter_number ?? '—'}章 · ${outlineDetail?.title || '未命名'}`}
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
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, gap: 7 }}>
                  <FieldLabel>出场角色（逗号分隔）</FieldLabel>
                  <Input value={outlineEdit.charactersText} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, charactersText: v } : f))} placeholder="温鹤延，满仓" />
                </View>
                <View style={{ flex: 1, gap: 7 }}>
                  <FieldLabel>涉及组织（逗号分隔）</FieldLabel>
                  <Input value={outlineEdit.orgsText} onChangeText={(v) => setOutlineEdit((f) => (f ? { ...f, orgsText: v } : f))} placeholder="沧澜宗" />
                </View>
              </View>
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
                {outlineDetail.emotion ? <Chip label={`情绪 · ${outlineDetail.emotion}`} fg={C.gold} bg={C.goldSoft} maxWidth="78%" /> : null}
                {outlineDetail.goal ? <Chip label={`目标 · ${outlineDetail.goal}`} maxWidth="78%" /> : null}
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
                      {s.emotion ? <Chip label={s.emotion} maxWidth={130} /> : null}
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
                这章大纲没有填摘要和要点
              </Text>
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
    </SafeAreaView>
  );
}
