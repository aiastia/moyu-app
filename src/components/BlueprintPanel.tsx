import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { Blueprint, BlueprintQueryResult } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

/** 全书蓝图 structure.volumes 里的分篇骨架（AI 生成蓝图时给出，规划详情后才有多字段） */
type VolumeSkeleton = {
  volume_index?: number;
  title?: string;
  start_hint?: string | number;
  end_hint?: string | number;
  theme?: string;
  main_conflict?: string;
  protagonist_growth?: string;
  plot_arc?: string;
  [k: string]: unknown;
};

const PLOT_ARC_OPTIONS = [
  { value: '', label: '不填' },
  { value: '开端', label: '开端' },
  { value: '发展', label: '发展' },
  { value: '高潮', label: '高潮' },
  { value: '转折', label: '转折' },
  { value: '结局', label: '结局' },
];

/** 分篇骨架 + 已规划详情合并后的展示行 */
type VolumeRow = {
  index: number;
  skeleton: VolumeSkeleton | null;
  detail: Blueprint | null;
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 8 }}>
      <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>{title}</Text>
      {children}
    </View>
  );
}

function LongField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: C.gold, fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 13, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

/** 故事蓝图面板：全书蓝图卡 + 分篇列表（只读为主，附手动编辑与 AI 生成/规划） */
export function BlueprintPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [data, setData] = useState<BlueprintQueryResult | null>(null);
  const [bookEdit, setBookEdit] = useState<{ title: string; theme: string; mainConflict: string; growth: string; ending: string; foreshadows: string } | null>(null);
  const [bookSaving, setBookSaving] = useState(false);
  const [volumeDetail, setVolumeDetail] = useState<VolumeRow | null>(null);
  const [volumeEdit, setVolumeEdit] = useState<{ title: string; theme: string; mainConflict: string; plotArc: string; startChapter: string; endChapter: string } | null>(null);
  const [volumeSaving, setVolumeSaving] = useState(false);
  const [genOpen, setGenOpen] = useState<'new' | 'continue' | null>(null);
  const [genPrompt, setGenPrompt] = useState('');
  const [genSubmitting, setGenSubmitting] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const r = await api.getBlueprints(projectId);
      setData(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        return;
      }
      setData({ book: null, volumes: [] });
      toast(friendlyError(e));
    }
  }, [api, projectId, logout, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉列表，与既有面板同款
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const book = data?.book ?? null;

  /** 分篇骨架（book.structure.volumes）与已规划详情（volume 级蓝图行）按 volume_index 合并 */
  const volumeRows = useMemo<VolumeRow[]>(() => {
    const skeletons: VolumeSkeleton[] = Array.isArray((book?.structure as Record<string, unknown> | undefined)?.volumes)
      ? ((book!.structure as Record<string, unknown>).volumes as VolumeSkeleton[])
      : [];
    const details = data?.volumes ?? [];
    const idxSet = new Set<number>([
      ...skeletons.map((s) => Number(s.volume_index) || 0).filter(Boolean),
      ...details.map((d) => d.volume_index ?? 0).filter(Boolean),
    ]);
    return Array.from(idxSet)
      .sort((a, b) => a - b)
      .map((index) => ({
        index,
        skeleton: skeletons.find((s) => Number(s.volume_index) === index) ?? null,
        detail: details.find((d) => (d.volume_index ?? 0) === index) ?? null,
      }));
  }, [book, data]);

  /** 分篇列表：下一個还没规划详情的篇号（「规划下一篇」按钮用） */
  const nextUnplanned = useMemo(() => {
    const row = volumeRows.find((r) => !r.detail);
    return row ? row.index : volumeRows.length > 0 ? Math.max(...volumeRows.map((r) => r.index)) + 1 : 1;
  }, [volumeRows]);

  const milestones = useMemo(() => {
    const raw = volumeDetail?.detail?.key_milestones;
    return Array.isArray(raw) ? raw : [];
  }, [volumeDetail]);

  const stageGuide = useMemo(() => {
    const raw = volumeDetail?.detail?.plot_stage_guide;
    return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  }, [volumeDetail]);

  const saveBook = () => {
    if (!api || !book || !bookEdit || bookSaving) return;
    setBookSaving(true);
    api
      .updateBlueprint(projectId, book.id, {
        title: bookEdit.title.trim(),
        theme: bookEdit.theme.trim(),
        main_conflict: bookEdit.mainConflict.trim(),
        protagonist_growth: bookEdit.growth.trim(),
        ending_direction: bookEdit.ending.trim(),
        foreshadows_plan: bookEdit.foreshadows.trim(),
      })
      .then(() => {
        setBookEdit(null);
        toast('蓝图已保存');
        load();
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setBookSaving(false));
  };

  const saveVolume = () => {
    if (!api || !volumeDetail?.detail || !volumeEdit || volumeSaving) return;
    setVolumeSaving(true);
    api
      .updateBlueprint(projectId, volumeDetail.detail.id, {
        title: volumeEdit.title.trim(),
        theme: volumeEdit.theme.trim(),
        main_conflict: volumeEdit.mainConflict.trim(),
        plot_arc: volumeEdit.plotArc,
        start_chapter: Number(volumeEdit.startChapter) || 0,
        end_chapter: Number(volumeEdit.endChapter) || 0,
      })
      .then(() => {
        setVolumeEdit(null);
        toast('分篇已保存');
        load();
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setVolumeSaving(false));
  };

  /** 提交蓝图生成/续写（异步任务） */
  const submitGen = () => {
    if (!api || !genOpen || genSubmitting) return;
    setGenSubmitting(true);
    const call = genOpen === 'new' ? api.generateBlueprintAsync(projectId, genPrompt.trim()) : api.continueBlueprintAsync(projectId, genPrompt.trim());
    call
      .then(() => {
        setGenOpen(null);
        setGenPrompt('');
        toast('已提交蓝图任务，可在「任务」页看进度');
        router.navigate('/tasks');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setGenSubmitting(false));
  };

  const planNext = () => {
    if (!api || planBusy) return;
    setPlanBusy(true);
    api
      .planVolumeAsync(projectId, nextUnplanned)
      .then(() => {
        toast(`已提交第 ${nextUnplanned} 篇规划任务，完成后回来下拉刷新`);
        router.navigate('/tasks');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setPlanBusy(false));
  };

  const bookMilestones = useMemo(() => (Array.isArray(book?.key_milestones) ? book!.key_milestones : []), [book]);

  return (
    <View style={{ gap: 10 }}>
      {toastNode}
      {confirmNode}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={() => {
            if (!book) {
              setGenPrompt('');
              setGenOpen('new');
              return;
            }
            confirm({
              title: 'AI 重做全书蓝图',
              message: '重新生成会覆盖现有全书蓝图与分篇结构（已规划的分篇详情保留）。确定提交吗？',
              confirmText: '重新生成',
              destructive: true,
              onConfirm: () => {
                setGenPrompt('');
                setGenOpen('new');
              },
            });
          }}
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
          <Ionicons name="sparkles" size={15} color={C.gold} />
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>{book ? '重做蓝图' : '生成蓝图'}</Text>
        </Pressable>
        {book ? (
          <Pressable
            onPress={() => {
              setGenPrompt('');
              setGenOpen('continue');
            }}
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
            <Ionicons name="git-branch-outline" size={15} color={C.blue} />
            <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>续写蓝图</Text>
          </Pressable>
        ) : null}
      </View>

      {data === null ? (
        <Skeleton count={3} height={110} />
      ) : !book ? (
        <EmptyState icon="map-outline" title="还没有蓝图" sub="蓝图是全书主线地图与分篇结构，先让 AI 规划一份，续写大纲会自动对齐走向" />
      ) : (
        <>
          {/* 全书蓝图卡 */}
          <Pressable
            onPress={() =>
              setBookEdit({
                title: book.title ?? '',
                theme: book.theme ?? '',
                mainConflict: book.main_conflict ?? '',
                growth: book.protagonist_growth ?? '',
                ending: typeof (book.structure as Record<string, unknown>)?.ending_direction === 'string' ? ((book.structure as Record<string, unknown>).ending_direction as string) : '',
                foreshadows: book.foreshadows_plan ?? '',
              })
            }
            style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: 'rgba(229,181,88,0.25)', borderRadius: R.m, padding: 13, gap: 10 })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="map-outline" size={15} color={C.gold} />
              <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                {book.title || '全书蓝图'}
              </Text>
              <Ionicons name="create-outline" size={14} color={C.text3} />
            </View>
            <LongField label="主题" value={book.theme} />
            <LongField label="核心冲突" value={book.main_conflict} />
            <LongField label="主角成长" value={book.protagonist_growth} />
            {typeof (book.structure as Record<string, unknown>)?.ending_direction === 'string' ? (
              <LongField label="结局走向" value={(book.structure as Record<string, unknown>).ending_direction as string} />
            ) : null}
            {bookMilestones.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>关键里程碑（{bookMilestones.length}）</Text>
                {bookMilestones.slice(0, 4).map((m, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ color: C.gold, fontSize: 12, lineHeight: 18 }}>{typeof m.position === 'string' ? m.position : '·'}</Text>
                    <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 18, flex: 1 }} numberOfLines={2}>
                      {m.title}
                    </Text>
                  </View>
                ))}
                {bookMilestones.length > 4 ? <Text style={{ color: C.text3, fontSize: 11 }}>还有 {bookMilestones.length - 4} 条，点开编辑可看全量</Text> : null}
              </View>
            ) : null}
          </Pressable>

          {/* 分篇列表 */}
          {volumeRows.length > 0 ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700', flex: 1 }}>分篇结构（{volumeRows.length} 篇）</Text>
                <Pressable onPress={planNext} disabled={planBusy} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 10, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)', opacity: planBusy ? 0.6 : 1 }}>
                  {planBusy ? <ActivityIndicator size="small" color={C.blue} /> : <Ionicons name="sparkles" size={12} color={C.blue} />}
                  <Text style={{ color: C.blue, fontSize: 11.5, fontWeight: '700' }}>规划第 {nextUnplanned} 篇</Text>
                </Pressable>
              </View>
              {volumeRows.map((r) => {
                const title = r.detail?.title || r.skeleton?.title || `第 ${r.index} 篇`;
                const range =
                  r.detail?.start_chapter && r.detail?.end_chapter
                    ? `第${r.detail.start_chapter}–${r.detail.end_chapter}章`
                    : r.skeleton?.start_hint || r.skeleton?.end_hint
                      ? `${r.skeleton?.start_hint ?? '?'} ~ ${r.skeleton?.end_hint ?? '?'}`
                      : '';
                return (
                  <Pressable
                    key={r.index}
                    onPress={() => setVolumeDetail(r)}
                    style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 6 })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>第 {r.index} 篇</Text>
                      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                        {title}
                      </Text>
                      {r.detail?.plot_arc ? <Chip label={r.detail.plot_arc} maxWidth={110} /> : null}
                      <Ionicons name="chevron-forward" size={14} color={C.text3} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {range ? <Chip label={range} /> : null}
                      {r.detail ? <Chip label="已规划详情" fg={C.green} bg={C.greenSoft} /> : <Chip label="未规划" fg={C.text3} />}
                    </View>
                    {r.detail?.main_conflict ? (
                      <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                        {r.detail.main_conflict}
                      </Text>
                    ) : r.skeleton?.theme ? (
                      <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                        {r.skeleton.theme}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      )}

      {/* 全书蓝图编辑 */}
      <SheetModal visible={bookEdit !== null} onClose={() => setBookEdit(null)} title="编辑全书蓝图">
        {bookEdit ? (
          <>
            <View style={{ gap: 7 }}>
              <FieldLabel>书名/主线名</FieldLabel>
              <Input value={bookEdit.title} onChangeText={(v) => setBookEdit((f) => (f ? { ...f, title: v } : f))} placeholder="如：聊斋志异·第一卷" />
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>主题</FieldLabel>
              <Input value={bookEdit.theme} onChangeText={(v) => setBookEdit((f) => (f ? { ...f, theme: v } : f))} placeholder="全书想表达什么" multiline height={70} />
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>核心冲突</FieldLabel>
              <Input value={bookEdit.mainConflict} onChangeText={(v) => setBookEdit((f) => (f ? { ...f, mainConflict: v } : f))} placeholder="贯穿全书的主要矛盾" multiline height={80} />
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>主角成长</FieldLabel>
              <Input value={bookEdit.growth} onChangeText={(v) => setBookEdit((f) => (f ? { ...f, growth: v } : f))} placeholder="开篇→结局的人物弧光" multiline height={80} />
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>结局走向</FieldLabel>
              <Input value={bookEdit.ending} onChangeText={(v) => setBookEdit((f) => (f ? { ...f, ending: v } : f))} placeholder="结局怎么收" multiline height={70} />
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>伏笔布局</FieldLabel>
              <Input value={bookEdit.foreshadows} onChangeText={(v) => setBookEdit((f) => (f ? { ...f, foreshadows: v } : f))} placeholder="伏笔埋设与回收的总体安排" multiline height={80} />
            </View>
            <Pressable onPress={saveBook} disabled={bookSaving} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
              {bookSaving ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={17} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{bookSaving ? '保存中…' : '保存'}</Text>
            </Pressable>
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>里程碑与分篇结构由 AI 生成/规划时更新，这里只改主干字段</Text>
          </>
        ) : null}
      </SheetModal>

      {/* 分篇详情 */}
      <SheetModal
        visible={volumeDetail !== null}
        onClose={() => {
          setVolumeDetail(null);
          setVolumeEdit(null);
        }}
        title={volumeDetail ? `第 ${volumeDetail.index} 篇 · ${volumeDetail.detail?.title || volumeDetail.skeleton?.title || '未命名'}` : ''}
      >
        {volumeDetail ? (
          volumeEdit ? (
            <>
              <View style={{ gap: 7 }}>
                <FieldLabel>篇名</FieldLabel>
                <Input value={volumeEdit.title} onChangeText={(v) => setVolumeEdit((f) => (f ? { ...f, title: v } : f))} placeholder="如：初入江湖" />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, gap: 7 }}>
                  <FieldLabel>起章号</FieldLabel>
                  <Input value={volumeEdit.startChapter} onChangeText={(v) => setVolumeEdit((f) => (f ? { ...f, startChapter: v.replace(/[^0-9]/g, '') } : f))} keyboardType="number-pad" placeholder="如 1" />
                </View>
                <View style={{ flex: 1, gap: 7 }}>
                  <FieldLabel>止章号</FieldLabel>
                  <Input value={volumeEdit.endChapter} onChangeText={(v) => setVolumeEdit((f) => (f ? { ...f, endChapter: v.replace(/[^0-9]/g, '') } : f))} keyboardType="number-pad" placeholder="如 20" />
                </View>
              </View>
              <View style={{ gap: 7 }}>
                <FieldLabel>主题</FieldLabel>
                <Input value={volumeEdit.theme} onChangeText={(v) => setVolumeEdit((f) => (f ? { ...f, theme: v } : f))} placeholder="本篇主题" multiline height={70} />
              </View>
              <SelectField label="情节弧线" value={volumeEdit.plotArc} options={PLOT_ARC_OPTIONS} onChange={(v) => setVolumeEdit((f) => (f ? { ...f, plotArc: v } : f))} />
              <View style={{ gap: 7 }}>
                <FieldLabel>核心冲突</FieldLabel>
                <Input value={volumeEdit.mainConflict} onChangeText={(v) => setVolumeEdit((f) => (f ? { ...f, mainConflict: v } : f))} placeholder="本篇主要矛盾" multiline height={80} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                <Pressable onPress={() => setVolumeEdit(null)} disabled={volumeSaving} style={{ flex: 1, height: 44, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>取消</Text>
                </Pressable>
                <Pressable onPress={saveVolume} disabled={volumeSaving} style={{ flex: 1.6, height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
                  {volumeSaving ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={16} color="#1A1206" />}
                  <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{volumeSaving ? '保存中…' : '保存'}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {(() => {
                const d = volumeDetail.detail;
                const s = volumeDetail.skeleton;
                const arc = d?.plot_arc || s?.plot_arc;
                const range =
                  d?.start_chapter && d?.end_chapter ? `第${d.start_chapter}–${d.end_chapter}章` : s?.start_hint || s?.end_hint ? `${s?.start_hint ?? '?'} ~ ${s?.end_hint ?? '?'}` : '';
                return (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {range ? <Chip label={range} /> : null}
                    {arc ? <Chip label={`弧线 · ${arc}`} fg={C.gold} bg={C.goldSoft} maxWidth="78%" multiline /> : null}
                  </View>
                );
              })()}
              {(() => {
                const d = volumeDetail.detail;
                const s = volumeDetail.skeleton;
                const theme = d?.theme || s?.theme;
                const conflict = d?.main_conflict || s?.main_conflict;
                const growth = d?.protagonist_growth || s?.protagonist_growth;
                if (!theme && !conflict && !growth) return null;
                return (
                  <SectionCard title="本篇概要">
                    <LongField label="主题" value={theme} />
                    <LongField label="核心冲突" value={conflict} />
                    <LongField label="主角成长" value={growth} />
                  </SectionCard>
                );
              })()}
              {milestones.length > 0 ? (
                <SectionCard title={`关键里程碑（${milestones.length}）`}>
                  {milestones.map((m, i) => (
                    <View key={i} style={{ gap: 2 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>{typeof m.chapter_hint === 'string' ? m.chapter_hint : '·'}</Text>
                        <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{m.title}</Text>
                      </View>
                      {typeof m.description === 'string' && m.description ? (
                        <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18, marginLeft: 18 }}>{m.description}</Text>
                      ) : null}
                    </View>
                  ))}
                </SectionCard>
              ) : null}
              {stageGuide.length > 0 ? (
                <SectionCard title="情节阶段建议">
                  {stageGuide.map((g, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                      <Chip label={typeof g.chapter_range === 'string' ? g.chapter_range : '—'} fg={C.gold} bg={C.goldSoft} />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{typeof g.stage === 'string' ? g.stage : ''}</Text>
                        {typeof g.note === 'string' && g.note ? <Text style={{ color: C.text2, fontSize: 11.5, lineHeight: 17 }}>{g.note}</Text> : null}
                      </View>
                    </View>
                  ))}
                </SectionCard>
              ) : null}
              {!volumeDetail.detail ? (
                <Text style={{ color: C.text3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', paddingVertical: 8 }}>
                  这一篇还没有规划详情，点下方让 AI 规划
                </Text>
              ) : null}
              {volumeDetail.detail ? (
                <Pressable
                  onPress={() => {
                    const d = volumeDetail.detail!;
                    setVolumeEdit({
                      title: d.title ?? '',
                      theme: d.theme ?? '',
                      mainConflict: d.main_conflict ?? '',
                      plotArc: d.plot_arc ?? '',
                      startChapter: d.start_chapter ? String(d.start_chapter) : '',
                      endChapter: d.end_chapter ? String(d.end_chapter) : '',
                    });
                  }}
                  style={({ pressed }) => ({
                    height: 42,
                    borderRadius: R.m,
                    backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
                    borderWidth: 1,
                    borderColor: 'rgba(229,181,88,0.4)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 7,
                  })}
                >
                  <Ionicons name="create-outline" size={15} color={C.gold} />
                  <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '700' }}>编辑分篇</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  if (!api || planBusy) return;
                  setPlanBusy(true);
                  api
                    .planVolumeAsync(projectId, volumeDetail.index)
                    .then(() => {
                      setVolumeDetail(null);
                      toast(`已提交第 ${volumeDetail.index} 篇规划任务`);
                      router.navigate('/tasks');
                    })
                    .catch((e) => toast(friendlyError(e)))
                    .finally(() => setPlanBusy(false));
                }}
                disabled={planBusy}
                style={{ height: 42, borderRadius: R.m, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: planBusy ? 0.6 : 1 }}
              >
                {planBusy ? <ActivityIndicator size="small" color={C.blue} /> : <Ionicons name="sparkles" size={15} color={C.blue} />}
                <Text style={{ color: C.blue, fontSize: 13.5, fontWeight: '700' }}>{volumeDetail.detail ? 'AI 重新规划本篇' : 'AI 规划本篇详情'}</Text>
              </Pressable>
              {volumeDetail.detail ? (
                <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>重新规划会覆盖本篇的里程碑与阶段建议</Text>
              ) : null}
            </>
          )
        ) : null}
      </SheetModal>

      {/* 生成/续写蓝图 */}
      <SheetModal visible={genOpen !== null} onClose={() => (genSubmitting ? undefined : setGenOpen(null))} title={genOpen === 'new' ? (book ? 'AI 重做全书蓝图' : 'AI 生成全书蓝图') : 'AI 续写全书蓝图'}>
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          {genOpen === 'new'
            ? 'AI 基于简介与已有设定规划主线骨架：主题、核心冲突、主角成长、关键里程碑与分篇结构。'
            : '在现有蓝图之后延伸新的故事弧线和分篇，不改动已有段落（适合扩写总字数）。'}
        </Text>
        <View style={{ gap: 7 }}>
          <FieldLabel>补充要求（可选）</FieldLabel>
          <Input value={genPrompt} onChangeText={setGenPrompt} placeholder="如：扩展到 50 万字，加入商战线与第二反派" multiline height={80} />
        </View>
        <Pressable onPress={submitGen} disabled={genSubmitting} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: genSubmitting ? 0.7 : 1 }}>
          {genSubmitting ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{genSubmitting ? '提交中…' : '提交任务'}</Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>异步执行不占手机，完成后回本页下拉刷新</Text>
      </SheetModal>
    </View>
  );
}
