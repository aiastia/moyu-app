import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import { PortraitSheet } from '@/components/PortraitSheet';
import type { CharacterBody, CharacterItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const ROLES = ['主角', '男主', '女主', '大反派', '反派', '配角', '路人'];

const ROLE_OPTIONS = [
  { value: '', label: '不指定', hint: 'AI 根据大纲自由分配定位' },
  ...ROLES.map((r) => ({ value: r, label: r })),
];
const GENDER_OPTIONS = [
  { value: '', label: '不填' },
  { value: '男', label: '男' },
  { value: '女', label: '女' },
];

const ROLE_COLOR: Record<string, { fg: string; bg: string }> = {
  主角: { fg: '#E5B558', bg: 'rgba(229,181,88,0.13)' },
  男主: { fg: '#E5B558', bg: 'rgba(229,181,88,0.13)' },
  女主: { fg: '#E5B558', bg: 'rgba(229,181,88,0.13)' },
  大反派: { fg: '#D65A45', bg: 'rgba(214,90,69,0.14)' },
  反派: { fg: '#D65A45', bg: 'rgba(214,90,69,0.14)' },
};

/** 角色面板：列表 + 手动新建/编辑/删除 + AI 批量生成 */
export function CharactersPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<CharacterItem[] | null>(null);
  const [editing, setEditing] = useState<CharacterItem | 'new' | null>(null);
  const [form, setForm] = useState<CharacterBody>({ name: '', role: '配角', gender: '', age: '', identity: '', appearance: '', personality: '', background: '', ability: '', story_goal: '', motivation: '', weakness: '' });
  const [saving, setSaving] = useState(false);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [portraitChar, setPortraitChar] = useState<CharacterItem | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState(3);
  const [aiRole, setAiRole] = useState('');
  const [aiReq, setAiReq] = useState('');
  const [aiSubmitting, setAiSubmitting] = useState(false);

  const set = (patch: Partial<CharacterBody>) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const list = await api.getCharacters(projectId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openNew = () => {
    setEditing('new');
    setForm({ name: '', role: '配角', gender: '', age: '', identity: '', appearance: '', personality: '', background: '', ability: '', story_goal: '', motivation: '', weakness: '' });
  };

  const openEdit = (c: CharacterItem) => {
    setEditing(c);
    setForm({
      name: c.name,
      role: c.role || '配角',
      gender: c.gender ?? '',
      age: c.age ?? '',
      identity: c.identity ?? '',
      appearance: c.appearance ?? '',
      personality: c.personality ?? '',
      background: c.background ?? '',
      ability: c.ability ?? '',
      story_goal: c.story_goal ?? '',
      motivation: c.motivation ?? '',
      weakness: c.weakness ?? '',
    });
  };

  const save = async () => {
    if (!api || !editing || saving) return;
    if (!form.name.trim()) {
      toast('请填写角色姓名');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.createCharacter(projectId, { ...form, name: form.name.trim() });
      } else {
        await api.updateCharacter(projectId, editing.id, { ...form, name: form.name.trim() });
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

  const remove = (c: CharacterItem) => {
    if (!api) return;
    confirm({
      title: '删除角色',
      message: `确定删除「${c.name}」？关联的关系与档案将一并处理，不可恢复。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api.deleteCharacter(projectId, c.id).then(load).catch((e) => toast(friendlyError(e)));
      },
    });
  };

  /** 提交 AI 批量生成角色（异步任务，任务页看进度） */
  const submitAi = () => {
    if (!api || aiSubmitting) return;
    setAiSubmitting(true);
    api
      .generateCharactersAsync(projectId, { count: aiCount, role: aiRole, requirements: aiReq.trim() })
      .then(() => {
        setAiOpen(false);
        toast('已提交角色生成任务，可在「任务」页看进度');
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
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>新建角色</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAiCount(3);
            setAiRole('');
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
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>AI 生成角色</Text>
        </Pressable>
      </View>

      {items === null ? (
        <Skeleton count={4} height={88} />
      ) : items.length === 0 ? (
        <EmptyState icon="people-outline" title="还没有角色" sub="建好角色档案，AI 写正文时人设更稳" />
      ) : (
        items.map((c) => {
          const rc = ROLE_COLOR[c.role] ?? { fg: '#A78BFA', bg: 'rgba(167,139,250,0.13)' };
          return (
            <Pressable
              key={c.id}
              onPress={() => openEdit(c)}
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
                <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800' }}>{c.name}</Text>
                {c.role ? <Chip label={c.role} fg={rc.fg} bg={rc.bg} /> : null}
                {c.gender ? <Chip label={c.gender} /> : null}
                {c.status && c.status !== 'alive' ? <Chip label={c.status} fg={C.text3} /> : null}
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => setPortraitChar(c)}
                  hitSlop={6}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    backgroundColor: c.reference_image ? C.goldSoft : C.card2,
                    borderWidth: 1,
                    borderColor: c.reference_image ? 'rgba(229,181,88,0.35)' : C.borderSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="image-outline" size={15} color={c.reference_image ? C.gold : C.text3} />
                </Pressable>
                <Ionicons name="chevron-forward" size={14} color={C.text3} />
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
            </Pressable>
          );
        })
      )}

      <SheetModal visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建角色' : `编辑 · ${cur?.name ?? ''}`}>
        <FieldLabel>姓名 *</FieldLabel>
        <Input value={form.name ?? ''} onChangeText={(v) => set({ name: v })} placeholder="角色姓名" />

        <SelectField label="定位" value={form.role ?? ''} options={ROLES.map((r) => ({ value: r, label: r }))} onChange={(v) => set({ role: v })} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 120 }}>
            <SelectField label="性别" value={form.gender ?? ''} options={GENDER_OPTIONS} onChange={(v) => set({ gender: v })} />
          </View>
          <View style={{ flex: 1, gap: 7 }}>
            <FieldLabel>年龄</FieldLabel>
            <Input value={form.age ?? ''} onChangeText={(v) => set({ age: v })} placeholder="如 17 / 千年" />
          </View>
        </View>

        <FieldLabel>身份</FieldLabel>
        <Input value={form.identity ?? ''} onChangeText={(v) => set({ identity: v })} placeholder="如：青云宗内门弟子" />
        <FieldLabel>性格</FieldLabel>
        <Input value={form.personality ?? ''} onChangeText={(v) => set({ personality: v })} placeholder="性格关键词" multiline height={80} />
        <FieldLabel>外貌</FieldLabel>
        <Input value={form.appearance ?? ''} onChangeText={(v) => set({ appearance: v })} placeholder="外貌特征" multiline height={80} />
        <FieldLabel>能力</FieldLabel>
        <Input value={form.ability ?? ''} onChangeText={(v) => set({ ability: v })} placeholder="金手指/功法/特长" multiline height={80} />
        <FieldLabel>背景</FieldLabel>
        <Input value={form.background ?? ''} onChangeText={(v) => set({ background: v })} placeholder="出身与经历" multiline height={100} />
        <FieldLabel>故事目标</FieldLabel>
        <Input value={form.story_goal ?? ''} onChangeText={(v) => set({ story_goal: v })} placeholder="TA 想达成什么" multiline height={70} />
        <FieldLabel>动机</FieldLabel>
        <Input value={form.motivation ?? ''} onChangeText={(v) => set({ motivation: v })} placeholder="为什么执着于此" multiline height={70} />
        <FieldLabel>弱点</FieldLabel>
        <Input value={form.weakness ?? ''} onChangeText={(v) => set({ weakness: v })} placeholder="性格或能力上的软肋" multiline height={70} />

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
          <Pressable
            onPress={save}
            disabled={saving}
            style={{ flex: 1, height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{saving ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>
      </SheetModal>

      <PortraitSheet
        projectId={projectId}
        character={portraitChar}
        visible={portraitChar !== null}
        onClose={() => setPortraitChar(null)}
        onUpdated={load}
      />

      {/* AI 批量生成角色 */}
      <SheetModal visible={aiOpen} onClose={() => setAiOpen(false)} title="AI 生成角色">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          AI 会参考本书的世界观、大纲和已有角色，生成一批不重样的新角色档案。
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
        <SelectField label="角色定位" value={aiRole} options={ROLE_OPTIONS} onChange={setAiRole} />
        <View style={{ gap: 7 }}>
          <FieldLabel>补充要求（可选）</FieldLabel>
          <Input
            value={aiReq}
            onChangeText={setAiReq}
            placeholder="如：需要 2 个女性角色；反派是主角的师兄"
            multiline
            height={80}
          />
        </View>
        <Pressable
          onPress={submitAi}
          disabled={aiSubmitting}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: aiSubmitting ? 0.7 : 1 }}
        >
          <Ionicons name="sparkles" size={16} color="#1A1206" />
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{aiSubmitting ? '提交中…' : `生成 ${aiCount} 个角色`}</Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>异步执行不占手机，完成后回本页下拉刷新</Text>
      </SheetModal>
    </View>
  );
}
