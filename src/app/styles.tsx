import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState, FieldLabel, Input, ScreenHeader, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { WritingStyleItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

type StyleForm = { name: string; description: string; author_name: string; custom_prompt: string; reference_text: string };

const EMPTY_FORM: StyleForm = { name: '', description: '', author_name: '', custom_prompt: '', reference_text: '' };

/** 写作风格管理：预设/自定义风格的查看、新建、编辑、删除与默认风格设置。
 *  「绑定到某本书」在书籍概况页操作（那里才有项目上下文）。 */
export default function WritingStylesScreen() {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<WritingStyleItem[] | null>(null);
  const [editing, setEditing] = useState<WritingStyleItem | 'new' | null>(null);
  const [form, setForm] = useState<StyleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [defaultBusy, setDefaultBusy] = useState<number | null>(null);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const list = await api.getWritingStyles();
      setItems(list ?? []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        return;
      }
      setItems([]);
      toast(friendlyError(e));
    }
  }, [api, logout, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉列表
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
  };

  const openEdit = (s: WritingStyleItem) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description ?? '',
      author_name: s.author_name ?? '',
      custom_prompt: s.custom_prompt ?? '',
      reference_text: s.reference_text ?? '',
    });
  };

  const save = async () => {
    if (!api || !editing || saving) return;
    if (!form.name.trim()) {
      toast('请填写风格名称');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description,
        author_name: form.author_name.trim(),
        custom_prompt: form.custom_prompt,
        reference_text: form.reference_text,
      };
      if (editing === 'new') {
        await api.createWritingStyle(body);
      } else {
        await api.updateWritingStyle(editing.id, body);
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

  const remove = (s: WritingStyleItem) => {
    if (!api) return;
    confirm({
      title: '删除风格',
      message: `确定删除「${s.name}」？使用该风格的项目会回落到默认风格。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api.deleteWritingStyle(s.id).then(load).catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const setDefault = (s: WritingStyleItem) => {
    if (!api || defaultBusy) return;
    setDefaultBusy(s.id);
    api
      .setDefaultWritingStyle(s.id)
      .then(() => {
        toast(`「${s.name}」已设为默认风格，新书将自动继承`);
        load();
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setDefaultBusy(null));
  };

  const cur = editing && editing !== 'new' ? editing : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      {confirmNode}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 12, paddingBottom: 40 }}>
        <ScreenHeader title="写作风格" subtitle="生成正文的文风配置，新书自动继承默认" onBack={() => router.back()} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="brush-outline" size={16} color={C.gold} />
          <Text style={{ color: C.text2, fontSize: 12.5, flex: 1, lineHeight: 18 }}>
            把风格「绑定到某本书」在该书概况页操作
          </Text>
        </View>

        <Pressable
          onPress={openNew}
          style={({ pressed }) => ({
            height: 44,
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
          <Ionicons name="add" size={16} color={C.gold} />
          <Text style={{ color: C.gold, fontSize: 14, fontWeight: '700' }}>新建风格</Text>
        </Pressable>

        {items === null ? (
          <Skeleton count={4} height={90} />
        ) : items.length === 0 ? (
          <EmptyState icon="brush-outline" title="还没有写作风格" sub="建一个风格，或直接用内置预设" />
        ) : (
          items.map((s) => (
            <View key={s.id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  {s.name}
                </Text>
                {s.is_preset ? <Chip label="内置" fg={C.text3} /> : null}
                {s.is_default ? <Chip label="默认" fg={C.gold} bg={C.goldSoft} bold /> : null}
              </View>
              {s.description ? (
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                  {s.description}
                </Text>
              ) : null}
              {s.custom_prompt ? (
                <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }} numberOfLines={2}>
                  自定义提示词 · {s.custom_prompt}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                {!s.is_default ? (
                  <Pressable
                    onPress={() => setDefault(s)}
                    disabled={defaultBusy !== null}
                    style={{ height: 34, paddingHorizontal: 14, borderRadius: 11, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.4)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, opacity: defaultBusy === s.id ? 0.6 : 1 }}
                  >
                    {defaultBusy === s.id ? <ActivityIndicator size="small" color={C.gold} /> : <Ionicons name="star-outline" size={13} color={C.gold} />}
                    <Text style={{ color: C.gold, fontSize: 12.5, fontWeight: '700' }}>设为默认</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => openEdit(s)}
                  style={{ height: 34, paddingHorizontal: 14, borderRadius: 11, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}
                >
                  <Ionicons name="create-outline" size={13} color={C.text2} />
                  <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '700' }}>{s.is_preset ? '查看' : '编辑'}</Text>
                </Pressable>
                {!s.is_preset ? (
                  <Pressable
                    onPress={() => remove(s)}
                    style={{ height: 34, paddingHorizontal: 14, borderRadius: 11, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: C.seal, fontSize: 12.5, fontWeight: '700' }}>删除</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <SheetModal visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建风格' : cur?.is_preset ? '查看预设风格' : `编辑 · ${cur?.name ?? ''}`}>
        <FieldLabel>名称 *</FieldLabel>
        <Input value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="如：冷峻武侠风" editable={!cur?.is_preset} />
        <View style={{ gap: 7 }}>
          <FieldLabel>描述</FieldLabel>
          <Input value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="一句话概括这个风格" multiline height={64} editable={!cur?.is_preset} />
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>对标作者</FieldLabel>
          <Input value={form.author_name} onChangeText={(v) => setForm((f) => ({ ...f, author_name: v }))} placeholder="如：古龙" editable={!cur?.is_preset} />
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>自定义提示词</FieldLabel>
          <Input value={form.custom_prompt} onChangeText={(v) => setForm((f) => ({ ...f, custom_prompt: v }))} placeholder="文风要求的自由描述，生成正文时注入" multiline height={90} editable={!cur?.is_preset} />
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>参考文本</FieldLabel>
          <Input value={form.reference_text} onChangeText={(v) => setForm((f) => ({ ...f, reference_text: v }))} placeholder="粘贴一段目标文风的样例（网页端可让 AI 提炼特征）" multiline height={110} editable={!cur?.is_preset} />
        </View>
        {cur?.is_preset ? (
          <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>内置预设不可修改，可新建风格自由配置</Text>
        ) : (
          <Pressable onPress={save} disabled={saving} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{saving ? '保存中…' : '保存'}</Text>
          </Pressable>
        )}
      </SheetModal>
    </SafeAreaView>
  );
}
