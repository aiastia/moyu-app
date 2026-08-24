import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, ProgressBar, SelectField, SheetModal, Skeleton, StepperRow, useConfirm, useToast } from '@/components/ui';
import type { OrganizationItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const ORG_TYPE_OPTIONS = ['宗门', '家族', '国家', '商会', '帮派', '其他'].map((t) => ({ value: t, label: t }));

type OrgForm = { name: string; org_type: string; description: string; location: string; power: number };

const EMPTY_FORM: OrgForm = { name: '', org_type: '宗门', description: '', location: '', power: 50 };

/** 组织/势力面板：列表 + 手动新建/编辑/删除 + AI 批量生成 */
export function OrganizationsPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<OrganizationItem[] | null>(null);
  const [editing, setEditing] = useState<OrganizationItem | 'new' | null>(null);
  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState(3);
  const [aiReq, setAiReq] = useState('');
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const list = await api.getOrganizations(projectId);
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

  const openEdit = (o: OrganizationItem) => {
    setEditing(o);
    setForm({
      name: o.name,
      org_type: o.org_type || '其他',
      description: o.description ?? '',
      location: typeof (o as unknown as Record<string, unknown>).location === 'string' ? ((o as unknown as Record<string, unknown>).location as string) : '',
      power: typeof (o as unknown as Record<string, unknown>).power_value === 'number' ? ((o as unknown as Record<string, unknown>).power_value as number) : 50,
    });
  };

  const save = async () => {
    if (!api || !editing || saving) return;
    if (!form.name.trim()) {
      toast('请填写组织名称');
      return;
    }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), org_type: form.org_type, description: form.description, location: form.location, power_value: form.power };
      if (editing === 'new') {
        await api.createOrganization(projectId, body);
      } else {
        await api.updateOrganization(projectId, editing.id, body);
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

  const remove = (o: OrganizationItem) => {
    if (!api) return;
    confirm({
      title: '删除组织',
      message: `确定删除「${o.name}」？成员关系会一并清理，不可恢复。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api.deleteOrganization(projectId, o.id).then(load).catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const submitAi = () => {
    if (!api || aiSubmitting) return;
    setAiSubmitting(true);
    api
      .generateOrganizationsAsync(projectId, aiCount, aiReq.trim())
      .then(() => {
        setAiOpen(false);
        toast('已提交组织生成任务，可在「任务」页看进度');
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
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>新建组织</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAiCount(3);
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
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>AI 生成组织</Text>
        </Pressable>
      </View>

      {items === null ? (
        <Skeleton count={4} height={80} />
      ) : items.length === 0 ? (
        <EmptyState icon="business-outline" title="还没有组织" sub="宗门、家族、商会、王朝都记在这里，大纲与正文会引用" />
      ) : (
        items.map((o) => {
          const power = typeof (o as unknown as Record<string, unknown>).power_value === 'number' ? ((o as unknown as Record<string, unknown>).power_value as number) : null;
          const location = typeof (o as unknown as Record<string, unknown>).location === 'string' ? ((o as unknown as Record<string, unknown>).location as string) : '';
          return (
            <Pressable
              key={o.id}
              onPress={() => openEdit(o)}
              style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 7 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  {o.name}
                </Text>
                {o.org_type ? <Chip label={o.org_type} fg={C.blue} bg={C.blueSoft} /> : null}
                <Ionicons name="chevron-forward" size={14} color={C.text3} />
              </View>
              {location ? (
                <Text style={{ color: C.gold, fontSize: 11.5 }} numberOfLines={1}>
                  所在地 · {location}
                </Text>
              ) : null}
              {o.description ? (
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                  {o.description}
                </Text>
              ) : null}
              {power != null ? (
                <View style={{ gap: 4 }}>
                  <ProgressBar pct={power} height={3} />
                  <Text style={{ color: C.text3, fontSize: 10.5 }}>势力值 {power}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })
      )}

      <SheetModal visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建组织' : `编辑 · ${cur?.name ?? ''}`}>
        <FieldLabel>名称 *</FieldLabel>
        <Input value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="如：沧澜宗" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SelectField label="类型" value={form.org_type} options={ORG_TYPE_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, org_type: v }))} />
          </View>
          <View style={{ flex: 1.3, gap: 7, justifyContent: 'flex-end' }}>
            <FieldLabel>所在地</FieldLabel>
            <Input value={form.location} onChangeText={(v) => setForm((f) => ({ ...f, location: v }))} placeholder="如：东洲临海郡" />
          </View>
        </View>
        <StepperRow label="势力值" hint="0–100，影响 AI 对势力强弱的判断" value={form.power} step={5} min={0} max={100} onChange={(v) => setForm((f) => ({ ...f, power: v }))} />
        <View style={{ gap: 7 }}>
          <FieldLabel>简介</FieldLabel>
          <Input value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="组织底蕴、行事风格、与主角的关系…" multiline height={110} />
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

      <SheetModal visible={aiOpen} onClose={() => setAiOpen(false)} title="AI 生成组织">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          AI 基于世界观与已有势力生成一批不重样的组织（含势力值与简介）。
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
        <View style={{ gap: 7 }}>
          <FieldLabel>补充要求（可选）</FieldLabel>
          <Input value={aiReq} onChangeText={setAiReq} placeholder="如：需要一个隐秘的暗杀组织、一个掌控漕运的商会" multiline height={80} />
        </View>
        <Pressable onPress={submitAi} disabled={aiSubmitting} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: aiSubmitting ? 0.7 : 1 }}>
          {aiSubmitting ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{aiSubmitting ? '提交中…' : `生成 ${aiCount} 个组织`}</Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>异步执行不占手机，完成后回本页下拉刷新</Text>
      </SheetModal>
    </View>
  );
}
