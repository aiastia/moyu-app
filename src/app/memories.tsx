import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState, Input, ScreenHeader, Skeleton, StepperRow, Toggle, useConfirm, useToast } from '@/components/ui';
import type { UserMemory } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

/** 作者记忆（用户级记忆库）：跨作品生效的偏好/红线/节奏纪律，正文/大纲/润色三面注入 */
export default function MemoriesScreen() {
  const { api, logout } = useAuth();
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [items, setItems] = useState<UserMemory[] | null>(null);
  const [editing, setEditing] = useState<UserMemory | null>(null);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState(5);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const guard = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }
      toast(friendlyError(e));
    },
    [logout, toast],
  );

  const load = useCallback(() => {
    if (!api) return;
    api
      .listUserMemories()
      .then((r) => setItems(r.items ?? []))
      .catch((e) => guard(e));
  }, [api, guard]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const resetForm = () => {
    setEditing(null);
    setContent('');
    setCategory('');
    setPriority(5);
    setEnabled(true);
  };

  const startEdit = (m: UserMemory) => {
    setEditing(m);
    setContent(m.content);
    setCategory(m.category ?? '');
    setPriority(m.priority ?? 5);
    setEnabled(m.enabled);
  };

  const save = () => {
    if (!api || saving) return;
    if (!content.trim()) {
      toast('记忆内容不能为空');
      return;
    }
    setSaving(true);
    const body = { content: content.trim(), category: category.trim(), priority, enabled };
    const req = editing ? api.updateUserMemory(editing.id, body) : api.createUserMemory(body);
    req
      .then(() => {
        toast(editing ? '已保存' : '已添加');
        resetForm();
        load();
      })
      .catch((e) => guard(e))
      .finally(() => setSaving(false));
  };

  const remove = (m: UserMemory) => {
    if (!api) return;
    confirm({
      title: '删除记忆',
      message: '删除后不再注入任何生成，确定删除这条记忆？',
      confirmText: '删除',
      destructive: true,
      onConfirm: () =>
        api
          .deleteUserMemory(m.id)
          .then(() => {
            if (editing?.id === m.id) resetForm();
            load();
          })
          .catch((e) => guard(e)),
    });
  };

  const toggleEnabled = (m: UserMemory) => {
    if (!api) return;
    const req = api.updateUserMemory(m.id, { content: m.content, category: m.category ?? '', priority: m.priority ?? 5, enabled: !m.enabled });
    // 乐观更新，失败回滚重拉
    setItems((list) => (list ?? []).map((x) => (x.id === m.id ? { ...x, enabled: !m.enabled } : x)));
    req.then(load).catch(() => load());
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      {confirmNode}
      <FlatList
        data={items ?? []}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <ScreenHeader title="作者记忆" subtitle="跨作品注入，最多 200 条" onBack={() => router.back()} />
        }
        ListEmptyComponent={
          items === null ? (
            <Skeleton count={3} height={90} />
          ) : (
            <EmptyState icon="library-outline" title="还没有记忆" sub="记一条你的写作偏好或红线，AI 在正文/大纲/润色时都会遵守" />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => startEdit(item)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? C.card2 : C.card,
              borderRadius: R.l,
              borderWidth: 1,
              borderColor: C.borderSoft,
              padding: 13,
              gap: 7,
              opacity: item.enabled ? 1 : 0.55,
            })}
          >
            <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 19 }}>{item.content}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {item.category ? <Chip label={item.category} fg={C.blue} bg={C.blueSoft} /> : null}
              {(item.priority ?? 5) !== 5 ? <Chip label={`优先级 ${item.priority}`} fg={C.text3} bg={C.card2} /> : null}
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => toggleEnabled(item)}
                hitSlop={6}
                style={{ paddingHorizontal: 10, height: 28, borderRadius: 9, backgroundColor: item.enabled ? C.greenSoft : C.card2, borderWidth: 1, borderColor: item.enabled ? 'rgba(106,186,120,0.4)' : C.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: item.enabled ? C.green : C.text3, fontSize: 11.5, fontWeight: '700' }}>{item.enabled ? '注入中' : '已停用'}</Text>
              </Pressable>
              <Pressable onPress={() => remove(item)} hitSlop={6} style={{ paddingHorizontal: 10, height: 28, borderRadius: 9, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.seal, fontSize: 11.5, fontWeight: '700' }}>删除</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      />
      <View style={{ paddingHorizontal: SP.l, paddingBottom: 16, paddingTop: 4 }}>
        <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700', flex: 1 }}>{editing ? `编辑记忆 #${editing.id}` : '添加记忆'}</Text>
            {editing ? (
              <Pressable onPress={resetForm} hitSlop={6}>
                <Text style={{ color: C.text3, fontSize: 12 }}>取消编辑</Text>
              </Pressable>
            ) : null}
          </View>
          <Input value={content} onChangeText={setContent} placeholder={'如：女主对话不要用「难道」开头\n高潮章禁止章节末尾说教'} multiline height={72} maxLength={2000} />
          <Input value={category} onChangeText={setCategory} placeholder="分类（可选）：如 文风/红线/节奏" maxLength={50} />
          <StepperRow label="优先级" hint="高优先先注入（1-10）" value={priority} step={1} min={1} max={10} onChange={setPriority} />
          <Toggle label="启用" hint="停用后保留条目但不注入" value={enabled} onChange={setEnabled} />
          <Pressable
            onPress={save}
            disabled={saving}
            style={{ height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}
          >
            {saving ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name={editing ? 'checkmark' : 'add'} size={16} color="#1A1206" />}
            <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{editing ? '保存修改' : '添加'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
