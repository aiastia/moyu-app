import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChapterBadge, Chip, EmptyState, ProgressBar, ScreenHeader, SegmentedTabs, Skeleton, useToast } from '@/components/ui';
import { ForeshadowsPanel } from '@/components/ForeshadowsPanel';
import { WorldsPanel } from '@/components/WorldsPanel';
import type { ChapterRow, CharacterItem, OutlineItem, ProjectDetail } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, loadLastRead, useAuth } from '@/lib/auth';
import { fmtPercent, fmtRelative, fmtWords, STORY_KIND_LABEL } from '@/lib/format';
import { C, R, SP } from '@/lib/theme';

type TabKey = 'chapters' | 'outlines' | 'characters' | 'world' | 'foreshadow' | 'about';

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
  const [characters, setCharacters] = useState<CharacterItem[] | null>(null);
  const [lastRead, setLastRead] = useState<ChapterRow | null>(null);
  const [tab, setTab] = useState<TabKey>('chapters');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastReadId, setLastReadId] = useState<number | null>(null);
  const [toast, toastNode] = useToast();

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
    if (tab === 'characters' && characters === null) {
      api.getCharacters(projectId).then((c) => setCharacters(c ?? [])).catch(guard);
    }
  }, [tab, api, projectId, outlines, characters, guard]);

  const pct = useMemo(() => fmtPercent(project?.current_word_count, project?.target_word_count), [project]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const goReader = (c: ChapterRow) =>
    router.push({
      pathname: '/reader',
      params: {
        projectId: String(projectId),
        chapterId: String(c.id),
        canGenerate: c.can_generate ? '1' : '0',
        reason: c.generate_disabled_reason ?? '',
      },
    });

  /** 提交单章生成任务 */
  const submitChapterGenerate = (c: ChapterRow) => {
    if (!api) return;
    if (!c.can_generate) {
      Alert.alert('暂时不能生成', c.generate_disabled_reason || '服务端暂未开放此章节的生成');
      return;
    }
    const confirmThen = () => {
      api
        .generateChapter(projectId, c.id)
        .then(() => toast(`已提交第${c.chapter_number}章生成任务，可在「任务」页看进度`))
        .catch((e) => Alert.alert('提交失败', friendlyError(e)));
    };
    if (c.word_count > 0) {
      Alert.alert(
        '重新生成正文',
        `第${c.chapter_number}章已有 ${c.word_count} 字正文，重新生成会覆盖当前内容（原文在服务端保留可回滚）。确定提交吗？`,
        [
          { text: '取消', style: 'cancel' },
          { text: '重新生成', style: 'destructive', onPress: confirmThen },
        ],
      );
    } else {
      Alert.alert('生成正文', `提交第${c.chapter_number}章《${c.title || '未命名'}》的 AI 生成任务？`, [
        { text: '取消', style: 'cancel' },
        { text: '提交生成', onPress: confirmThen },
      ]);
    }
  };

  /** 续写/生成大纲 */
  const submitOutlineGenerate = (kind: 'continue' | 'new') => {
    if (!api) return;
    Alert.alert(
      kind === 'new' ? '生成大纲' : '续写大纲',
      kind === 'new' ? '为本书生成多少章大纲？' : '在现有大纲之后续写多少章？',
      [
        { text: '3 章', onPress: () => doOutline(kind, 3) },
        { text: '5 章', onPress: () => doOutline(kind, 5) },
        { text: '取消', style: 'cancel' },
      ],
    );
  };
  const doOutline = (kind: 'continue' | 'new', count: number) => {
    if (!api) return;
    const call = kind === 'new' ? api.generateOutlines(projectId, count) : api.continueOutlines(projectId, count);
    call
      .then(() => toast(`已提交大纲${kind === 'new' ? '生成' : '续写'}任务（${count} 章）`))
      .catch((e) => Alert.alert('提交失败', friendlyError(e)));
  };

  if (Number.isNaN(projectId)) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      <ScrollView
        contentContainerStyle={{ padding: SP.l, gap: 14, paddingBottom: 36 }}
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
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {project.genre ? <Chip label={project.genre} fg={C.gold} bg={C.goldSoft} bold /> : null}
                <Chip label={STORY_KIND_LABEL[project.story_kind] ?? '作品'} fg={C.blue} bg={C.blueSoft} />
                {project.is_fanfic ? <Chip label="同人" fg={C.purple} bg={C.purpleSoft} /> : null}
              </View>
              {project.synopsis ? (
                <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 20 }} numberOfLines={3}>
                  {project.synopsis}
                </Text>
              ) : null}
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
              chapters === null ? (
                <Skeleton count={6} height={64} />
              ) : chapters.length === 0 ? (
                <EmptyState icon="list-outline" title="还没有章节" sub="章节和大纲会在网页端生成" />
              ) : (
                <View style={{ gap: 8 }}>
                  {chapters.map((c) => (
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
                  ))}
                </View>
              )
            ) : null}

            {tab === 'outlines' ? (
              outlines === null ? (
                <Skeleton count={5} height={84} />
              ) : outlines.length === 0 ? (
                <View style={{ alignItems: 'center', gap: 16 }}>
                  <EmptyState icon="map-outline" title="还没有大纲" sub="先给这本书生成前几章的大纲，再逐章生成正文" />
                  <Pressable
                    onPress={() => submitOutlineGenerate('new')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 46, paddingHorizontal: 24, borderRadius: 14, backgroundColor: C.gold }}
                  >
                    <Ionicons name="sparkles" size={16} color="#1A1206" />
                    <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>生成大纲</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => submitOutlineGenerate('continue')}
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
                    <View key={o.id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>第{o.chapter_number}章</Text>
                        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                          {o.title || '未命名'}
                        </Text>
                        {o.emotion ? <Chip label={o.emotion} /> : null}
                      </View>
                      {o.summary ? (
                        <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={3}>
                          {o.summary}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )
            ) : null}

            {tab === 'characters' ? (
              characters === null ? (
                <Skeleton count={4} height={76} />
              ) : characters.length === 0 ? (
                <EmptyState icon="people-outline" title="暂无角色" />
              ) : (
                <View style={{ gap: 8 }}>
                  {characters.map((c) => (
                    <View key={c.id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 7 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800' }}>{c.name}</Text>
                        {c.role ? <Chip label={c.role} fg={C.purple} bg={C.purpleSoft} /> : null}
                        {c.gender ? <Chip label={c.gender} /> : null}
                      </View>
                      {c.identity ? (
                        <Text style={{ color: C.text2, fontSize: 12 }} numberOfLines={1}>
                          {c.identity}
                        </Text>
                      ) : null}
                      {c.personality ? (
                        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }} numberOfLines={2}>
                          {c.personality}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )
            ) : null}

            {tab === 'world' ? <WorldsPanel projectId={projectId} /> : null}

            {tab === 'foreshadow' ? <ForeshadowsPanel projectId={projectId} /> : null}

            {tab === 'about' && project ? (
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
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
