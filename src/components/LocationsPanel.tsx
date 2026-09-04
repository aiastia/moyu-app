import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import { PortraitSheet } from '@/components/PortraitSheet';
import type { LocationItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const TYPE_OPTIONS = ['城市', '区域', '建筑', '秘境', '自然景观', '国家', '大陆', '其他'].map((t) => ({ value: t, label: t }));
const IMPORTANCE_OPTIONS = [
  { value: 'minor', label: '次要' },
  { value: 'normal', label: '普通' },
  { value: 'major', label: '重要' },
  { value: 'key', label: '关键' },
];
const DANGER_OPTIONS = [
  { value: 'safe', label: '安全' },
  { value: 'low', label: '低危' },
  { value: 'medium', label: '中危' },
  { value: 'high', label: '高危' },
];

const DANGER_COLOR: Record<string, { fg: string; bg: string }> = {
  safe: { fg: '#5FBF8F', bg: 'rgba(95,191,143,0.13)' },
  low: { fg: '#A6ACBA', bg: 'rgba(166,172,186,0.13)' },
  medium: { fg: '#E5B558', bg: 'rgba(229,181,88,0.13)' },
  high: { fg: '#D65A45', bg: 'rgba(214,90,69,0.14)' },
};

type LocForm = {
  name: string;
  location_type: string;
  description: string;
  atmosphere: string;
  geography: string;
  importance: string;
  danger_level: string;
};

const EMPTY_FORM: LocForm = { name: '', location_type: '城市', description: '', atmosphere: '', geography: '', importance: 'normal', danger_level: 'safe' };

/** 地点/场景面板：列表 + 手动新建/编辑/删除 + AI 批量生成 */
export function LocationsPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<LocationItem[] | null>(null);
  const [editing, setEditing] = useState<LocationItem | 'new' | null>(null);
  const [form, setForm] = useState<LocForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState(4);
  const [aiType, setAiType] = useState('');
  const [aiReq, setAiReq] = useState('');
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [portraitLoc, setPortraitLoc] = useState<LocationItem | null>(null);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const list = await api.getLocations(projectId);
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
    setForm(EMPTY_FORM);
  };

  const openEdit = (l: LocationItem) => {
    setEditing(l);
    setForm({
      name: l.name,
      location_type: l.location_type || '其他',
      description: l.description ?? '',
      atmosphere: l.atmosphere ?? '',
      geography: l.geography ?? '',
      importance: l.importance || 'normal',
      danger_level: l.danger_level || 'safe',
    });
  };

  const save = async () => {
    if (!api || !editing || saving) return;
    if (!form.name.trim()) {
      toast('请填写地点名称');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        location_type: form.location_type,
        description: form.description,
        atmosphere: form.atmosphere,
        geography: form.geography,
        importance: form.importance,
        danger_level: form.danger_level,
      };
      if (editing === 'new') {
        await api.createLocation(projectId, body);
      } else {
        await api.updateLocation(projectId, editing.id, body);
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

  const remove = (l: LocationItem) => {
    if (!api) return;
    confirm({
      title: '删除地点',
      message: `确定删除「${l.name}」？此操作不可恢复。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api.deleteLocation(projectId, l.id).then(load).catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const submitAi = () => {
    if (!api || aiSubmitting) return;
    setAiSubmitting(true);
    api
      .generateLocationsAsync(projectId, aiCount, aiType, aiReq.trim())
      .then(() => {
        setAiOpen(false);
        toast('已提交地点生成任务，可在「任务」页看进度');
        router.navigate('/tasks');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setAiSubmitting(false));
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
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>新建地点</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAiCount(4);
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
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>AI 生成地点</Text>
        </Pressable>
      </View>

      {items === null ? (
        <Skeleton count={4} height={80} />
      ) : items.length === 0 ? (
        <EmptyState icon="location-outline" title="还没有地点" sub="城市、秘境、山门、坊市都记在这里，写正文时场景有据可依" />
      ) : (
        items.map((l) => {
          const dc = DANGER_COLOR[l.danger_level ?? 'safe'] ?? DANGER_COLOR.safe;
          return (
            <Pressable
              key={l.id}
              onPress={() => openEdit(l)}
              style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 7 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  {l.name}
                </Text>
                {l.location_type ? <Chip label={l.location_type} fg={C.green} bg={C.greenSoft} /> : null}
                {l.danger_level && l.danger_level !== 'safe' ? <Chip label={DANGER_OPTIONS.find((d) => d.value === l.danger_level)?.label ?? l.danger_level} fg={dc.fg} bg={dc.bg} /> : null}
                <Pressable
                  onPress={() => setPortraitLoc(l)}
                  hitSlop={6}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    backgroundColor: l.reference_image ? C.goldSoft : C.card2,
                    borderWidth: 1,
                    borderColor: l.reference_image ? 'rgba(229,181,88,0.35)' : C.borderSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="image-outline" size={15} color={l.reference_image ? C.gold : C.text3} />
                </Pressable>
                <Ionicons name="chevron-forward" size={14} color={C.text3} />
              </View>
              {l.atmosphere ? (
                <Text style={{ color: C.gold, fontSize: 11.5 }} numberOfLines={1}>
                  氛围 · {l.atmosphere}
                </Text>
              ) : null}
              {l.description ? (
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                  {l.description}
                </Text>
              ) : null}
            </Pressable>
          );
        })
      )}

      <SheetModal visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建地点' : `编辑 · ${cur?.name ?? ''}`}>
        <FieldLabel>名称 *</FieldLabel>
        <Input value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="如：青枫镇" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SelectField label="类型" value={form.location_type} options={TYPE_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, location_type: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField label="重要度" value={form.importance} options={IMPORTANCE_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, importance: v }))} />
          </View>
        </View>
        <SelectField label="危险等级" value={form.danger_level} options={DANGER_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, danger_level: v }))} />
        <View style={{ gap: 7 }}>
          <FieldLabel>氛围</FieldLabel>
          <Input value={form.atmosphere} onChangeText={(v) => setForm((f) => ({ ...f, atmosphere: v }))} placeholder="如：阴雨连绵、市井喧嚣" />
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>地理</FieldLabel>
          <Input value={form.geography} onChangeText={(v) => setForm((f) => ({ ...f, geography: v }))} placeholder="山川地势、交通区位…" multiline height={70} />
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>描述</FieldLabel>
          <Input value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="这地方发生过什么、有什么讲究…" multiline height={100} />
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
      </SheetModal>

      <SheetModal visible={aiOpen} onClose={() => setAiOpen(false)} title="AI 生成地点">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          AI 基于世界观与已有地点生成一批新场景（含氛围与危险等级）。
        </Text>
        <View style={{ gap: 9 }}>
          <FieldLabel>生成数量</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[2, 4, 6].map((n) => {
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
        <SelectField label="地点类型（可选）" value={aiType} options={[{ value: '', label: '混合' }, ...TYPE_OPTIONS]} onChange={setAiType} />
        <View style={{ gap: 7 }}>
          <FieldLabel>补充要求（可选）</FieldLabel>
          <Input value={aiReq} onChangeText={setAiReq} placeholder="如：东海一带的港口城市群、主角宗门后山的禁地" multiline height={80} />
        </View>
        <Pressable onPress={submitAi} disabled={aiSubmitting} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: aiSubmitting ? 0.7 : 1 }}>
          {aiSubmitting ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{aiSubmitting ? '提交中…' : `生成 ${aiCount} 个地点`}</Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>异步执行不占手机，完成后回本页下拉刷新</Text>
      </SheetModal>

      {/* key=实体 id：换实体/重开整组件重挂载，状态初始化即实体当前值 */}
      <PortraitSheet
        key={portraitLoc ? `loc-portrait-${portraitLoc.id}` : 'loc-portrait-none'}
        projectId={projectId}
        kind="location"
        entity={portraitLoc}
        visible={portraitLoc !== null}
        onClose={() => setPortraitLoc(null)}
        onUpdated={load}
      />
    </View>
  );
}
