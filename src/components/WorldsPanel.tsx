import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, SheetModal, Skeleton, useToast } from '@/components/ui';
import type { WorldItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

/** 世界观设定面板：列表 + 新建/编辑/删除 */
export function WorldsPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<WorldItem[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<WorldItem | 'new' | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, toastNode] = useToast();

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const list = await api.getWorlds(projectId);
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
    load();
    api?.getWorldCategories(projectId).then((r) => setCategories(r.categories ?? [])).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openNew = () => {
    setEditing('new');
    setName('');
    setCategory(categories[0] ?? '');
    setContent('');
  };

  const openEdit = (w: WorldItem) => {
    setEditing(w);
    setName(w.name);
    setCategory(w.category ?? '');
    setContent(w.content ?? '');
  };

  const save = async () => {
    if (!api || !editing || saving) return;
    if (!name.trim()) {
      toast('请填写设定名称');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.createWorld(projectId, { name: name.trim(), category: category.trim(), content });
      } else {
        await api.updateWorld(projectId, editing.id, { name: name.trim(), category: category.trim(), content });
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

  const remove = (w: WorldItem) => {
    if (!api) return;
    Alert.alert('删除设定', `确定删除「${w.name}」？此操作不可恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          api.deleteWorld(projectId, w.id).then(load).catch((e) => toast(friendlyError(e)));
        },
      },
    ]);
  };

  return (
    <View style={{ gap: 10 }}>
      {toastNode}
      <Pressable
        onPress={openNew}
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
        <Ionicons name="add" size={16} color={C.gold} />
        <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '700' }}>新建世界设定</Text>
      </Pressable>

      {items === null ? (
        <Skeleton count={4} height={84} />
      ) : items.length === 0 ? (
        <EmptyState icon="globe-outline" title="还没有世界设定" sub="把地理、历史、力量体系等规则记在这里，AI 写作时会参考" />
      ) : (
        items.map((w) => (
          <Pressable
            key={w.id}
            onPress={() => openEdit(w)}
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
              <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                {w.name}
              </Text>
              {w.category ? <Chip label={w.category} fg={C.green} bg={C.greenSoft} /> : null}
            </View>
            {w.content ? (
              <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                {w.content}
              </Text>
            ) : null}
          </Pressable>
        ))
      )}

      <SheetModal visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建世界设定' : '编辑世界设定'}>
        <FieldLabel>名称</FieldLabel>
        <Input value={name} onChangeText={setName} placeholder="如：东洲地理格局" />
        <FieldLabel>分类</FieldLabel>
        <Input value={category} onChangeText={setCategory} placeholder="如：地理 / 历史 / 力量体系" />
        {categories.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
            {categories.slice(0, 12).map((cat) => (
              <Pressable key={cat} onPress={() => setCategory(cat)}>
                <Chip label={cat} fg={category === cat ? C.gold : C.text2} bg={category === cat ? C.goldSoft : C.card2} bold={category === cat} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <FieldLabel>内容</FieldLabel>
        <Input value={content} onChangeText={setContent} placeholder="设定正文…" multiline height={180} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          {editing !== 'new' && editing ? (
            <Pressable
              onPress={() => {
                remove(editing);
                setEditing(null);
              }}
              style={{ height: 44, paddingHorizontal: 18, borderRadius: R.m, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: C.seal, fontSize: 14, fontWeight: '700' }}>删除</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={save}
            disabled={saving}
            style={{ flex: 1, height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{saving ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>
      </SheetModal>
    </View>
  );
}
