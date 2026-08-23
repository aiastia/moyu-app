import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { ForeshadowItem } from '@/lib/api';
import { ApiError, FORESHADOW_STATUS_LABEL } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const TYPE_SELECT_OPTIONS = [
  { value: '悬念', label: '悬念', hint: '吊读者胃口，晚点揭晓' },
  { value: '情感', label: '情感', hint: '感情线的暗流铺垫' },
  { value: '认知', label: '认知', hint: '人物认知/真相的反转空间' },
  { value: '线索', label: '线索', hint: '可追查的具体线索物' },
];

const PLAN_SOURCE_OPTIONS = [
  { value: 'outline', label: '基于大纲', hint: '逐章分析大纲里的埋点与回收时机' },
  { value: 'blueprint', label: '基于蓝图', hint: '按全书蓝图的伏笔计划来规划' },
];

const FILTERS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '计划中' },
  { key: 'planted', label: '已埋入' },
  { key: 'resolved', label: '已回收' },
  { key: 'partial', label: '部分回收' },
  { key: 'abandoned', label: '已放弃' },
];

function statusStyle(status: string): { fg: string; bg: string } {
  switch (status) {
    case 'planted':
      return { fg: C.blue, bg: C.blueSoft };
    case 'resolved':
      return { fg: C.green, bg: C.greenSoft };
    case 'partial':
      return { fg: C.purple, bg: C.purpleSoft };
    case 'abandoned':
      return { fg: C.text3, bg: C.card2 };
    default:
      return { fg: C.gold, bg: C.goldSoft };
  }
}

/** 伏笔面板：筛选 + 新建/编辑 + 埋入/回收/放弃 + AI 规划 */
export function ForeshadowsPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<ForeshadowItem[] | null>(null);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<ForeshadowItem | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('5');
  const [plantCh, setPlantCh] = useState('');
  const [resolveCh, setResolveCh] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [planOpen, setPlanOpen] = useState(false);
  const [planSource, setPlanSource] = useState<'outline' | 'blueprint'>('outline');
  const [planFrom, setPlanFrom] = useState('');
  const [planTo, setPlanTo] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);

  const load = useCallback(
    async (status = filter) => {
      if (!api) return;
      try {
        const list = await api.getForeshadows(projectId, status || undefined);
        setItems(list ?? []);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await logout();
          return;
        }
        setItems([]);
        toast(friendlyError(e));
      }
    },
    [api, projectId, filter, logout, toast],
  );

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, filter]);

  const openNew = () => {
    setEditing('new');
    setTitle('');
    setContent('');
    setType('悬念');
    setPriority('5');
    setPlantCh('');
    setResolveCh('');
  };

  const openEdit = (f: ForeshadowItem) => {
    setEditing(f);
    setTitle(f.title);
    setContent(f.content ?? '');
    setType(f.foreshadow_type || '');
    setPriority(String(f.priority ?? 5));
    setPlantCh(f.plant_chapter_number ? String(f.plant_chapter_number) : '');
    setResolveCh(f.target_resolve_chapter_number ? String(f.target_resolve_chapter_number) : '');
  };

  const body = () => ({
    title: title.trim(),
    content,
    foreshadow_type: type,
    priority: Math.max(1, Math.min(10, Number(priority) || 5)),
    plant_chapter_number: plantCh ? Number(plantCh) : null,
    target_resolve_chapter_number: resolveCh ? Number(resolveCh) : null,
  });

  const save = async () => {
    if (!api || !editing || saving) return;
    if (!title.trim()) {
      toast('请填写伏笔标题');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.createForeshadow(projectId, body());
      } else {
        await api.updateForeshadow(projectId, editing.id, body());
      }
      setEditing(null);
      toast('已保存');
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      toast(okMsg);
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  const doPlant = (f: ForeshadowItem) => {
    const ch = Number(plantCh) || f.plant_chapter_number;
    if (!ch) {
      toast('请先填写「计划埋入章号」');
      return;
    }
    act(() => api!.markForeshadowPlanted(projectId, f.id, ch), `已标记第${ch}章埋入`);
  };

  const doResolve = (f: ForeshadowItem, partial: boolean) => {
    const ch = Number(resolveCh) || f.target_resolve_chapter_number;
    if (!ch) {
      toast('请先填写「计划回收章号」');
      return;
    }
    act(() => api!.markForeshadowResolved(projectId, f.id, ch, '', partial), partial ? `已标记第${ch}章部分回收` : `已标记第${ch}章回收`);
  };

  const doAbandon = (f: ForeshadowItem) => {
    confirm({
      title: '放弃伏笔',
      message: `确定放弃「${f.title}」？`,
      confirmText: '放弃',
      destructive: true,
      onConfirm: () => act(() => api!.abandonForeshadow(projectId, f.id), '已放弃'),
    });
  };

  const doDelete = (f: ForeshadowItem) => {
    confirm({
      title: '删除伏笔',
      message: `确定删除「${f.title}」？不可恢复。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => act(() => api!.deleteForeshadow(projectId, f.id), '已删除').then(() => setEditing(null)),
    });
  };

  const planByAI = () => {
    setPlanSource('outline');
    setPlanFrom('');
    setPlanTo('');
    setPlanOpen(true);
  };
  const submitPlan = () => {
    if (!api || planSubmitting) return;
    const from = Number(planFrom) || 0;
    const to = Number(planTo) || 0;
    const range = from > 0 && to > 0 ? ([Math.min(from, to), Math.max(from, to)] as [number, number]) : null;
    setPlanSubmitting(true);
    api
      ?.planForeshadowsAsync(projectId, planSource, range)
      .then(() => {
        setPlanOpen(false);
        toast('已提交伏笔规划任务，可在「任务」页看进度');
        router.navigate('/tasks');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setPlanSubmitting(false));
  };

  const cur = editing && editing !== 'new' ? editing : null;

  return (
    <View style={{ gap: 10 }}>
      {toastNode}
      {confirmNode}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={openNew}
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
          <Ionicons name="add" size={15} color={C.gold} />
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>新建伏笔</Text>
        </Pressable>
        <Pressable
          onPress={planByAI}
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
          <Ionicons name="sparkles" size={15} color={C.blue} />
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>AI 规划伏笔</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                paddingHorizontal: 13,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? C.goldSoft : C.card,
                borderWidth: 1,
                borderColor: on ? 'rgba(229,181,88,0.4)' : C.borderSoft,
              }}
            >
              <Text style={{ color: on ? C.gold : C.text2, fontSize: 12, fontWeight: on ? '700' : '500' }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {items === null ? (
        <Skeleton count={4} height={88} />
      ) : items.length === 0 ? (
        <EmptyState icon="git-branch-outline" title={filter ? '该状态下没有伏笔' : '还没有伏笔'} sub={filter ? undefined : '手动新建，或让 AI 基于大纲/蓝图规划一批'} />
      ) : (
        items.map((f) => {
          const s = statusStyle(f.status);
          return (
            <Pressable
              key={f.id}
              onPress={() => openEdit(f)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? C.card2 : C.card,
                borderWidth: 1,
                borderColor: C.borderSoft,
                borderRadius: R.m,
                padding: 13,
                gap: 7,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {f.title}
                </Text>
                {f.foreshadow_type ? <Chip label={f.foreshadow_type} /> : null}
                <Chip label={FORESHADOW_STATUS_LABEL[f.status] ?? f.status} fg={s.fg} bg={s.bg} bold />
              </View>
              {f.content ? (
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                  {f.content}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: C.text3, fontSize: 11 }}>
                  {f.actual_plant_chapter ? `第${f.actual_plant_chapter}章埋入` : f.plant_chapter_number ? `计划第${f.plant_chapter_number}章埋` : '未定埋点'}
                  {' · '}
                  {f.actual_resolve_chapter ? `第${f.actual_resolve_chapter}章回收` : f.target_resolve_chapter_number ? `计划第${f.target_resolve_chapter_number}章收` : '未定收点'}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ color: C.gold, fontSize: 11, fontWeight: '700' }}>P{f.priority}</Text>
              </View>
            </Pressable>
          );
        })
      )}

      <SheetModal visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建伏笔' : '伏笔详情'}>
        <FieldLabel>标题</FieldLabel>
        <Input value={title} onChangeText={setTitle} placeholder="伏笔标题" />
        <SelectField label="类型" value={type || '悬念'} options={TYPE_SELECT_OPTIONS} onChange={setType} />
        <View style={{ gap: 7 }}>
          <FieldLabel>内容（埋什么、怎么收）</FieldLabel>
          <Input value={content} onChangeText={setContent} placeholder="伏笔内容…" multiline height={140} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 7 }}>
            <FieldLabel>计划埋入章</FieldLabel>
            <Input value={plantCh} onChangeText={(v) => setPlantCh(v.replace(/[^0-9]/g, ''))} placeholder="如 3" keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1, gap: 7 }}>
            <FieldLabel>计划回收章</FieldLabel>
            <Input value={resolveCh} onChangeText={(v) => setResolveCh(v.replace(/[^0-9]/g, ''))} placeholder="如 12" keyboardType="number-pad" />
          </View>
          <View style={{ width: 76, gap: 7 }}>
            <FieldLabel>优先级</FieldLabel>
            <Input value={priority} onChangeText={(v) => setPriority(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
          </View>
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          style={{ height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
        >
          <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{saving ? '保存中…' : '保存'}</Text>
        </Pressable>

        {cur ? (
          <View style={{ borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 14, gap: 10 }}>
            <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>状态操作</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => doPlant(cur)}
                style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>标记已埋入</Text>
              </Pressable>
              <Pressable
                onPress={() => doResolve(cur, false)}
                style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: C.greenSoft, borderWidth: 1, borderColor: 'rgba(95,191,143,0.4)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: C.green, fontSize: 13, fontWeight: '700' }}>标记已回收</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => doResolve(cur, true)}
                style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: C.purpleSoft, borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: C.purple, fontSize: 13, fontWeight: '700' }}>部分回收</Text>
              </Pressable>
              <Pressable
                onPress={() => doAbandon(cur)}
                style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }}>放弃</Text>
              </Pressable>
              <Pressable
                onPress={() => doDelete(cur)}
                style={{ width: 72, height: 40, borderRadius: 12, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: C.seal, fontSize: 13, fontWeight: '700' }}>删除</Text>
              </Pressable>
            </View>
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>
              埋入/回收会使用上面填写的计划章号；保存后状态操作的按钮即时生效
            </Text>
          </View>
        ) : null}
      </SheetModal>

      {/* AI 规划伏笔：自绘弹窗（原生 Alert 样式与 App 风格不符） */}
      <SheetModal visible={planOpen} onClose={() => setPlanOpen(false)} title="AI 规划伏笔">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          AI 分析大纲或蓝图，自动产出一批带埋入/回收章号的伏笔计划，完成后可直接在列表里编辑。
        </Text>
        <SelectField
          label="规划依据"
          value={planSource}
          options={PLAN_SOURCE_OPTIONS}
          onChange={(v) => setPlanSource(v as 'outline' | 'blueprint')}
        />
        <View style={{ gap: 7 }}>
          <FieldLabel>限定章号范围（可选）</FieldLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Input style={{ flex: 1 }} value={planFrom} onChangeText={(v) => setPlanFrom(v.replace(/[^0-9]/g, ''))} placeholder="起始章" keyboardType="number-pad" />
            <Ionicons name="remove" size={14} color={C.text3} />
            <Input style={{ flex: 1 }} value={planTo} onChangeText={(v) => setPlanTo(v.replace(/[^0-9]/g, ''))} placeholder="结束章" keyboardType="number-pad" />
          </View>
          <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>留空则分析全部大纲；基于蓝图时范围仅作参考</Text>
        </View>
        <Pressable
          onPress={submitPlan}
          disabled={planSubmitting}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: planSubmitting ? 0.75 : 1 }}
        >
          <Ionicons name="sparkles" size={16} color="#0B1524" />
          <Text style={{ color: '#0B1524', fontSize: 15, fontWeight: '800' }}>{planSubmitting ? '提交中…' : '开始规划'}</Text>
        </Pressable>
      </SheetModal>
    </View>
  );
}
