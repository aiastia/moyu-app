import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { CareerItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const CAREER_TYPE_OPTIONS = [
  { value: 'main', label: '主职业' },
  { value: 'sub', label: '副职业' },
];

type StageEdit = { name: string; requirement: string; ability: string };

type CareerForm = {
  name: string;
  career_type: string;
  category: string;
  description: string;
  stages: StageEdit[];
};

/** 服务端 stages/abilities 原始数据 → 编辑形态 */
function toStageEdits(raw: unknown): StageEdit[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      name: typeof o.name === 'string' ? o.name : '',
      requirement: typeof o.requirement === 'string' ? o.requirement : '',
      ability: typeof (o.ability ?? o.description) === 'string' ? ((o.ability ?? o.description) as string) : '',
    };
  });
}

/** abilities 兼容字符串数组与 {name,description} 对象数组，统一取名字 */
function toAbilityNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => (typeof a === 'string' ? a : typeof (a as Record<string, unknown>)?.name === 'string' ? ((a as Record<string, unknown>).name as string) : ''))
    .filter(Boolean);
}

const EMPTY_FORM: CareerForm = { name: '', career_type: 'main', category: '', description: '', stages: [] };

/** 职业体系面板：境界体系列表 + 编辑（含逐境界增删）+ AI 批量生成 + 自动分配 */
export function CareersPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<CareerItem[] | null>(null);
  const [editing, setEditing] = useState<CareerItem | 'new' | null>(null);
  const [form, setForm] = useState<CareerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<CareerItem | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState(3);
  const [aiType, setAiType] = useState('');
  const [aiReq, setAiReq] = useState('');
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const list = await api.getCareers(projectId);
      setItems(list ?? []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        return;
      }
      setItems([]);
      toast(friendlyError(e));
    }
  }, [api, projectId, logout, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉列表，与既有面板同款
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openNew = () => {
    setEditing('new');
    setForm({ ...EMPTY_FORM, stages: [{ name: '', requirement: '', ability: '' }] });
  };

  const openEdit = (c: CareerItem) => {
    setEditing(c);
    setForm({
      name: c.name,
      career_type: c.career_type || 'main',
      category: c.category ?? '',
      description: c.description ?? '',
      stages: toStageEdits(c.stages),
    });
  };

  const save = async () => {
    if (!api || !editing || saving) return;
    if (!form.name.trim()) {
      toast('请填写职业名称');
      return;
    }
    setSaving(true);
    try {
      const stages = form.stages
        .map((s) => ({ name: s.name.trim(), requirement: s.requirement.trim(), ability: s.ability.trim() }))
        .filter((s) => s.name);
      const body = { name: form.name.trim(), career_type: form.career_type, category: form.category.trim(), description: form.description, stages };
      if (editing === 'new') {
        await api.createCareer(projectId, body);
      } else {
        // PUT 部分更新语义：abilities 未编辑时原样带回，避免被清掉
        await api.updateCareer(projectId, editing.id, { ...body, abilities: editing.abilities ?? [] });
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

  const remove = (c: CareerItem) => {
    if (!api) return;
    confirm({
      title: '删除职业体系',
      message: `确定删除「${c.name}」？已分配到角色的主修职业会一并清理，不可恢复。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api.deleteCareer(projectId, c.id).then(load).catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const submitAi = () => {
    if (!api || aiSubmitting) return;
    setAiSubmitting(true);
    api
      .generateCareerSystemAsync(projectId, { count: aiCount, career_type: aiType, user_prompt: aiReq.trim() })
      .then(() => {
        setAiOpen(false);
        toast('已提交职业体系生成任务，可在「任务」页看进度');
        router.navigate('/tasks');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setAiSubmitting(false));
  };

  /** AI 给还没主修职业的角色自动分配（同步接口，直接写角色档案） */
  const autoAssign = () => {
    if (!api || assignBusy) return;
    setAssignBusy(true);
    api
      .autoAssignCareers(projectId)
      .then((r) => toast(`已为 ${r.count} 个角色分配主修职业`))
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setAssignBusy(false));
  };

  const cur = editing && editing !== 'new' ? editing : null;
  const detailStages = detail ? toStageEdits(detail.stages) : [];
  const detailAbilities = detail ? toAbilityNames(detail.abilities) : [];

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
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>新建体系</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAiCount(3);
            setAiType('');
            setAiReq('');
            setAiOpen(true);
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
          <Ionicons name="sparkles" size={15} color={C.blue} />
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>AI 生成体系</Text>
        </Pressable>
        {items != null && items.length > 0 ? (
          <Pressable
            onPress={autoAssign}
            disabled={assignBusy}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 42,
              borderRadius: R.m,
              backgroundColor: pressed ? '#2E2438' : C.purpleSoft,
              borderWidth: 1,
              borderColor: 'rgba(167,139,250,0.4)',
              opacity: assignBusy ? 0.6 : 1,
            })}
          >
            {assignBusy ? <ActivityIndicator size="small" color={C.purple} /> : <Ionicons name="people-circle-outline" size={15} color={C.purple} />}
            <Text style={{ color: C.purple, fontSize: 13, fontWeight: '700' }}>自动分配</Text>
          </Pressable>
        ) : null}
      </View>

      {items === null ? (
        <Skeleton count={3} height={88} />
      ) : items.length === 0 ? (
        <EmptyState icon="trending-up-outline" title="还没有职业体系" sub="修真境界、武者品级、职业等级都记在这里，角色成长有刻度" />
      ) : (
        items.map((c) => {
          const stages = toStageEdits(c.stages);
          return (
            <Pressable
              key={c.id}
              onPress={() => setDetail(c)}
              style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 7 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  {c.name}
                </Text>
                <Chip label={c.career_type === 'sub' ? '副职业' : '主职业'} fg={c.career_type === 'sub' ? C.blue : C.gold} bg={c.career_type === 'sub' ? C.blueSoft : C.goldSoft} />
                {c.category ? <Chip label={c.category} /> : null}
                <Ionicons name="chevron-forward" size={14} color={C.text3} />
              </View>
              {stages.length > 0 ? (
                <Text style={{ color: C.gold, fontSize: 11.5, lineHeight: 17 }}>
                  {stages.map((s) => s.name).filter(Boolean).join(' → ')}
                </Text>
              ) : null}
              {c.description ? (
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                  {c.description}
                </Text>
              ) : null}
            </Pressable>
          );
        })
      )}

      {/* 体系详情 */}
      <SheetModal visible={detail !== null} onClose={() => setDetail(null)} title={detail ? `${detail.name} · 境界体系` : ''}>
        {detail ? (
          <>
            {detailStages.length > 0 ? (
              <View style={{ gap: 8 }}>
                {detailStages.map((s, i) => (
                  <View key={i} style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>第 {i + 1} 阶</Text>
                      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>{s.name || '未命名'}</Text>
                    </View>
                    {s.requirement ? (
                      <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }}>晋级条件 · {s.requirement}</Text>
                    ) : null}
                    {s.ability ? <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }}>能力 · {s.ability}</Text> : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: C.text3, fontSize: 12.5, textAlign: 'center', paddingVertical: 10 }}>这个体系还没有境界划分</Text>
            )}
            {detailAbilities.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>核心能力</Text>
                {detailAbilities.map((a, i) => (
                  <Chip key={i} label={a} maxWidth={160} />
                ))}
              </View>
            ) : null}
            {detail.description ? (
              <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 19 }}>{detail.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <Pressable
                onPress={() => {
                  setDetail(null);
                  remove(detail);
                }}
                style={{ height: 44, paddingHorizontal: 18, borderRadius: R.m, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: C.seal, fontSize: 14, fontWeight: '700' }}>删除</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDetail(null);
                  openEdit(detail);
                }}
                style={{ flex: 1, height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}
              >
                <Ionicons name="create-outline" size={15} color="#1A1206" />
                <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>编辑体系</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </SheetModal>

      {/* 体系编辑（含逐境界编辑） */}
      <SheetModal visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建职业体系' : `编辑 · ${cur?.name ?? ''}`}>
        <FieldLabel>名称 *</FieldLabel>
        <Input value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="如：修真境界 / 律师等级" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SelectField label="类型" value={form.career_type} options={CAREER_TYPE_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, career_type: v }))} />
          </View>
          <View style={{ flex: 1.3, gap: 7, justifyContent: 'flex-end' }}>
            <FieldLabel>归类</FieldLabel>
            <Input value={form.category} onChangeText={(v) => setForm((f) => ({ ...f, category: v }))} placeholder="如：修炼 / 战斗 / 生活" />
          </View>
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>简介</FieldLabel>
          <Input value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="体系的整体设定…" multiline height={80} />
        </View>
        <View style={{ gap: 9 }}>
          <FieldLabel>境界（{form.stages.length}，从低到高）</FieldLabel>
          {form.stages.map((s, i) => (
            <View key={i} style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text3, fontSize: 11.5, fontWeight: '700' }}>第 {i + 1} 阶</Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => setForm((f) => ({ ...f, stages: f.stages.filter((_, j) => j !== i) }))}
                  hitSlop={6}
                  style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: C.sealSoft, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="close" size={14} color={C.seal} />
                </Pressable>
              </View>
              <Input value={s.name} onChangeText={(v) => setForm((f) => ({ ...f, stages: f.stages.map((sc, j) => (j === i ? { ...sc, name: v } : sc)) }))} placeholder="境界名，如：筑基期" />
              <Input value={s.requirement} onChangeText={(v) => setForm((f) => ({ ...f, stages: f.stages.map((sc, j) => (j === i ? { ...sc, requirement: v } : sc)) }))} placeholder="晋级条件（可选）" />
              <Input value={s.ability} onChangeText={(v) => setForm((f) => ({ ...f, stages: f.stages.map((sc, j) => (j === i ? { ...sc, ability: v } : sc)) }))} placeholder="该阶能力（可选）" />
            </View>
          ))}
          <Pressable
            onPress={() => setForm((f) => ({ ...f, stages: [...f.stages, { name: '', requirement: '', ability: '' }] }))}
            style={{ height: 38, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(229,181,88,0.5)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
          >
            <Ionicons name="add" size={14} color={C.gold} />
            <Text style={{ color: C.gold, fontSize: 13, fontWeight: '600' }}>添加境界</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          {cur ? (
            <Pressable
              onPress={() => {
                setEditing(null);
                remove(cur);
              }}
              style={{ height: 44, paddingHorizontal: 18, borderRadius: R.m, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: C.seal, fontSize: 14, fontWeight: '700' }}>删除</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={save} disabled={saving} style={{ flex: 1, height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{saving ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>核心能力由 AI 生成时一并写入；编辑保存不会改动已有能力</Text>
      </SheetModal>

      <SheetModal visible={aiOpen} onClose={() => setAiOpen(false)} title="AI 生成职业体系">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          AI 基于世界观生成职业/境界体系（含境界划分、晋级条件与核心能力）。
        </Text>
        <View style={{ gap: 9 }}>
          <FieldLabel>生成数量</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 5].map((n) => {
              const on = aiCount === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setAiCount(n)}
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
                  <Text style={{ color: on ? C.gold : C.text2, fontSize: 13.5, fontWeight: on ? '700' : '500' }}>{n} 个</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <SelectField label="职业类型（可选）" value={aiType} options={[{ value: '', label: '主 + 副混合' }, ...CAREER_TYPE_OPTIONS]} onChange={setAiType} />
        <View style={{ gap: 7 }}>
          <FieldLabel>补充要求（可选）</FieldLabel>
          <Input value={aiReq} onChangeText={setAiReq} placeholder="如：需要炼丹师体系、御兽师的品级划分" multiline height={80} />
        </View>
        <Pressable onPress={submitAi} disabled={aiSubmitting} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: aiSubmitting ? 0.7 : 1 }}>
          {aiSubmitting ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{aiSubmitting ? '提交中…' : `生成 ${aiCount} 个体系`}</Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>异步执行不占手机，完成后回本页下拉刷新</Text>
      </SheetModal>
    </View>
  );
}
