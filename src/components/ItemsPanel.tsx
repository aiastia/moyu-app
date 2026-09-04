import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, SelectField, SheetModal, Skeleton, Toggle, useConfirm, useToast } from '@/components/ui';
import { PortraitSheet } from '@/components/PortraitSheet';
import type { ItemEntity } from '@/lib/api';
import { ApiError, ITEM_RARITY_LABEL, ITEM_STATUS_LABEL } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const CATEGORY_OPTIONS = ['装备', '消耗', '关键道具', '材料', '货币', '其他'].map((c) => ({ value: c, label: c }));
const RARITY_OPTIONS = Object.entries(ITEM_RARITY_LABEL).map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = Object.entries(ITEM_STATUS_LABEL).map(([value, label]) => ({ value, label }));

const RARITY_COLOR: Record<string, { fg: string; bg: string }> = {
  common: { fg: '#A6ACBA', bg: 'rgba(166,172,186,0.13)' },
  uncommon: { fg: '#5FBF8F', bg: 'rgba(95,191,143,0.13)' },
  rare: { fg: '#6AA6E8', bg: 'rgba(106,166,232,0.13)' },
  epic: { fg: '#A78BFA', bg: 'rgba(167,139,250,0.13)' },
  legendary: { fg: '#E5B558', bg: 'rgba(229,181,88,0.13)' },
  mythic: { fg: '#D65A45', bg: 'rgba(214,90,69,0.14)' },
};

type ItemForm = {
  name: string;
  category: string;
  rarity: string;
  description: string;
  owner_name: string;
  status: string;
  is_key_item: boolean;
};

const EMPTY_FORM: ItemForm = { name: '', category: '装备', rarity: 'common', description: '', owner_name: '', status: 'stored', is_key_item: false };

/** 物品/道具面板：列表 + 手动新建/编辑/删除 + AI 批量生成 */
export function ItemsPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<ItemEntity[] | null>(null);
  const [editing, setEditing] = useState<ItemEntity | 'new' | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState(4);
  const [aiCategory, setAiCategory] = useState('');
  const [aiReq, setAiReq] = useState('');
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [portraitItem, setPortraitItem] = useState<ItemEntity | null>(null);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const list = await api.getItems(projectId);
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

  const openEdit = (it: ItemEntity) => {
    setEditing(it);
    setForm({
      name: it.name,
      category: it.category || '其他',
      rarity: it.rarity || 'common',
      description: it.description ?? '',
      owner_name: it.owner_name ?? '',
      status: it.status || 'stored',
      is_key_item: !!it.is_key_item,
    });
  };

  const save = async () => {
    if (!api || !editing || saving) return;
    if (!form.name.trim()) {
      toast('请填写物品名称');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        rarity: form.rarity,
        description: form.description,
        owner_name: form.owner_name,
        status: form.status,
        is_key_item: form.is_key_item ? 1 : 0,
      };
      if (editing === 'new') {
        await api.createItem(projectId, body);
      } else {
        await api.updateItem(projectId, editing.id, body);
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

  const remove = (it: ItemEntity) => {
    if (!api) return;
    confirm({
      title: '删除物品',
      message: `确定删除「${it.name}」？此操作不可恢复。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api.deleteItem(projectId, it.id).then(load).catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const submitAi = () => {
    if (!api || aiSubmitting) return;
    setAiSubmitting(true);
    api
      .generateItemsAsync(projectId, aiCount, aiCategory, aiReq.trim())
      .then(() => {
        setAiOpen(false);
        toast('已提交物品生成任务，可在「任务」页看进度');
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
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>新建物品</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAiCount(4);
            setAiCategory('');
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
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>AI 生成物品</Text>
        </Pressable>
      </View>

      {items === null ? (
        <Skeleton count={4} height={76} />
      ) : items.length === 0 ? (
        <EmptyState icon="cube-outline" title="还没有物品" sub="法宝、丹药、信物、关键道具记在这里，伏笔与剧情有据可查" />
      ) : (
        items.map((it) => {
          const rc = RARITY_COLOR[it.rarity ?? 'common'] ?? RARITY_COLOR.common;
          return (
            <Pressable
              key={it.id}
              onPress={() => openEdit(it)}
              style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: it.is_key_item ? 'rgba(229,181,88,0.3)' : C.borderSoft, borderRadius: R.m, padding: 13, gap: 7 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  {it.name}
                </Text>
                {it.is_key_item ? <Chip label="关键道具" fg={C.gold} bg={C.goldSoft} bold /> : null}
                {it.category ? <Chip label={it.category} fg={C.green} bg={C.greenSoft} /> : null}
                {it.rarity ? <Chip label={ITEM_RARITY_LABEL[it.rarity] ?? it.rarity} fg={rc.fg} bg={rc.bg} /> : null}
                <Pressable
                  onPress={() => setPortraitItem(it)}
                  hitSlop={6}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    backgroundColor: it.reference_image ? C.goldSoft : C.card2,
                    borderWidth: 1,
                    borderColor: it.reference_image ? 'rgba(229,181,88,0.35)' : C.borderSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="image-outline" size={15} color={it.reference_image ? C.gold : C.text3} />
                </Pressable>
                <Ionicons name="chevron-forward" size={14} color={C.text3} />
              </View>
              {it.description ? (
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                  {it.description}
                </Text>
              ) : null}
              {it.owner_name || it.status ? (
                <Text style={{ color: C.text3, fontSize: 11 }}>
                  {it.owner_name ? `持有 · ${it.owner_name}` : ''}
                  {it.owner_name && it.status ? ' · ' : ''}
                  {it.status ? ITEM_STATUS_LABEL[it.status] ?? it.status : ''}
                </Text>
              ) : null}
            </Pressable>
          );
        })
      )}

      <SheetModal visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建物品' : `编辑 · ${cur?.name ?? ''}`}>
        <FieldLabel>名称 *</FieldLabel>
        <Input value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="如：赤霄剑" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SelectField label="分类" value={form.category} options={CATEGORY_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField label="稀有度" value={form.rarity} options={RARITY_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, rarity: v }))} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.2 }}>
            <SelectField label="状态" value={form.status} options={STATUS_OPTIONS} onChange={(v) => setForm((f) => ({ ...f, status: v }))} />
          </View>
          <View style={{ flex: 1.4, justifyContent: 'flex-end' }}>
            <Toggle label="关键剧情道具" value={form.is_key_item} onChange={(v) => setForm((f) => ({ ...f, is_key_item: v }))} />
          </View>
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>持有者</FieldLabel>
          <Input value={form.owner_name} onChangeText={(v) => setForm((f) => ({ ...f, owner_name: v }))} placeholder="当前在谁手里" />
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>描述</FieldLabel>
          <Input value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="来历、能力、限制…" multiline height={100} />
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

      <SheetModal visible={aiOpen} onClose={() => setAiOpen(false)} title="AI 生成物品">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          AI 基于世界观、角色与剧情生成一批道具（含稀有度与来历）。
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
        <SelectField label="分类（可选）" value={aiCategory} options={[{ value: '', label: '混合' }, ...CATEGORY_OPTIONS]} onChange={setAiCategory} />
        <View style={{ gap: 7 }}>
          <FieldLabel>补充要求（可选）</FieldLabel>
          <Input value={aiReq} onChangeText={setAiReq} placeholder="如：主角的金手指需要一个本体法器" multiline height={80} />
        </View>
        <Pressable onPress={submitAi} disabled={aiSubmitting} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: aiSubmitting ? 0.7 : 1 }}>
          {aiSubmitting ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{aiSubmitting ? '提交中…' : `生成 ${aiCount} 个物品`}</Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>异步执行不占手机，完成后回本页下拉刷新</Text>
      </SheetModal>

      {/* key=实体 id：换实体/重开整组件重挂载，状态初始化即实体当前值 */}
      <PortraitSheet
        key={portraitItem ? `item-portrait-${portraitItem.id}` : 'item-portrait-none'}
        projectId={projectId}
        kind="item"
        entity={portraitItem}
        visible={portraitItem !== null}
        onClose={() => setPortraitItem(null)}
        onUpdated={load}
      />
    </View>
  );
}
