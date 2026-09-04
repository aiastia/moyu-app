import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, MultiSelectField, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import { PortraitSheet } from '@/components/PortraitSheet';
import type { CharacterBody, CharacterItem, CharacterOutfit, CharacterRelation } from '@/lib/api';
import { ApiError, CHARACTER_STATUS_LABEL } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { pollTask } from '@/lib/tasks';
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
const STATUS_OPTIONS = [
  { value: 'alive', label: '存活' },
  { value: 'dead', label: '死亡' },
  { value: 'missing', label: '失踪' },
  { value: 'unknown', label: '未知' },
];
const ARC_OPTIONS = [
  { value: '', label: '不填' },
  { value: '成长', label: '成长' },
  { value: '堕落', label: '堕落' },
  { value: '救赎', label: '救赎' },
  { value: '顿悟', label: '顿悟' },
  { value: '平淡', label: '平淡' },
];

const ROLE_COLOR: Record<string, { fg: string; bg: string }> = {
  主角: { fg: '#E5B558', bg: 'rgba(229,181,88,0.13)' },
  男主: { fg: '#E5B558', bg: 'rgba(229,181,88,0.13)' },
  女主: { fg: '#E5B558', bg: 'rgba(229,181,88,0.13)' },
  大反派: { fg: '#D65A45', bg: 'rgba(214,90,69,0.14)' },
  反派: { fg: '#D65A45', bg: 'rgba(214,90,69,0.14)' },
};

const EMPTY_FORM: CharacterBody = {
  name: '',
  role: '配角',
  gender: '',
  age: '',
  identity: '',
  appearance: '',
  personality: '',
  background: '',
  growth_experience: '',
  ability: '',
  story_goal: '',
  motivation: '',
  weakness: '',
  arc_type: '',
  character_change: '',
  speech_style: '',
  mental_state: '',
  status: 'alive',
  aliases: [],
  outfits: [],
};

/** 编辑表单里的装扮行： AI 生成/手动填都归一为 {name, description}（与服务端 normalize_outfits 同构） */
const toFormOutfits = (c: CharacterItem): CharacterOutfit[] =>
  (c.outfits ?? []).filter((o) => o && typeof o.name === 'string').map((o) => ({ name: o.name ?? '', description: o.description ?? '' }));

/** 角色面板：列表 + 手动新建/编辑/删除 + AI 批量生成 */
export function CharactersPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<CharacterItem[] | null>(null);
  const [editing, setEditing] = useState<CharacterItem | 'new' | null>(null);
  const [form, setForm] = useState<CharacterBody>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [portraitChar, setPortraitChar] = useState<CharacterItem | null>(null);
  const [relationsChar, setRelationsChar] = useState<CharacterItem | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState(3);
  const [aiRole, setAiRole] = useState('');
  const [aiReq, setAiReq] = useState('');
  const [aiSubmitting, setAiSubmitting] = useState(false);
  // AI 配装扮弹窗（编辑弹窗内发起，完成后装扮直接落库并同步回表单）
  const [outfitAiOpen, setOutfitAiOpen] = useState(false);
  const [outfitAiCount, setOutfitAiCount] = useState(3);
  const [outfitAiReq, setOutfitAiReq] = useState('');
  const [outfitAiBusy, setOutfitAiBusy] = useState(false);
  const [outfitAiPhase, setOutfitAiPhase] = useState('');

  const set = (patch: Partial<CharacterBody>) => setForm((f) => ({ ...f, ...patch }));

  /** 表单装扮行的增删改（整表替换语义：保存时随表单一并提交） */
  const addOutfit = () => setForm((f) => ({ ...f, outfits: [...(f.outfits ?? []), { name: '', description: '' }] }));
  const removeOutfit = (i: number) => setForm((f) => ({ ...f, outfits: (f.outfits ?? []).filter((_, j) => j !== i) }));
  const setOutfitRow = (i: number, patch: Partial<CharacterOutfit>) =>
    setForm((f) => ({ ...f, outfits: (f.outfits ?? []).map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

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

  // async 边界包裹：load 的 setState 都在异步续延里，直接调用会被 set-state-in-effect 规则判为同步写
  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
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
      growth_experience: c.growth_experience ?? '',
      ability: c.ability ?? '',
      story_goal: c.story_goal ?? '',
      motivation: c.motivation ?? '',
      weakness: c.weakness ?? '',
      arc_type: c.arc_type ?? '',
      character_change: c.character_change ?? '',
      speech_style: c.speech_style ?? '',
      mental_state: c.mental_state ?? '',
      status: c.status || 'alive',
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
      outfits: toFormOutfits(c),
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
      const cur = editing === 'new' ? null : editing;
      // 服务端 PUT 按 CharacterCreate 全量覆盖：App 表单没覆盖的职业/组织关联字段
      // 必须从列表数据原样带回，否则网页端设置的境界、所属组织会被默认空值清掉
      const body: CharacterBody = {
        ...form,
        name: form.name.trim(),
        outfits: (form.outfits ?? []).filter((o) => o.name.trim() || o.description.trim()),
        ...(cur
          ? {
              main_career_id: cur.main_career_id ?? null,
              main_career_stage: cur.main_career_stage ?? 0,
              main_career_stage_desc: cur.main_career_stage_desc ?? '',
              sub_careers: cur.sub_careers ?? [],
              organization_id: cur.organization_id ?? null,
            }
          : {}),
      };
      if (cur) {
        await api.updateCharacter(projectId, cur.id, body);
      } else {
        await api.createCharacter(projectId, body);
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

  /** 提交 AI 配装扮（异步任务）：完成即落库（追加合并同名跳过），刷新列表并同步回编辑表单 */
  const submitOutfitAi = async () => {
    if (!api || !cur || outfitAiBusy) return;
    setOutfitAiBusy(true);
    try {
      const r = await api.suggestOutfits(projectId, cur.id, outfitAiCount, outfitAiReq.trim());
      const t = await pollTask(api, r.task_id, { onTick: (x) => setOutfitAiPhase(`AI 配装中 ${x.progress ?? 0}%`) });
      const addedRaw = (t.result as { added?: unknown } | null | undefined)?.added;
      const added = Array.isArray(addedRaw) ? addedRaw.length : null;
      const list = await api.getCharacters(projectId);
      setItems(list ?? []);
      const fresh = (list ?? []).find((c) => c.id === cur.id);
      if (fresh) setForm((f) => ({ ...f, outfits: toFormOutfits(fresh) }));
      setOutfitAiOpen(false);
      setOutfitAiReq('');
      toast(added != null ? `已为「${cur.name}」新增 ${added} 套装扮` : '装扮已生成保存');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setOutfitAiBusy(false);
      setOutfitAiPhase('');
    }
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
          const dead = c.status && c.status !== 'alive';
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
                {(c.outfits?.length ?? 0) > 0 ? <Chip label={`${c.outfits!.length} 套装扮`} fg={C.purple} bg={C.purpleSoft} /> : null}
                {dead ? <Chip label={CHARACTER_STATUS_LABEL[c.status!] ?? c.status!} fg={C.seal} bg={C.sealSoft} /> : null}
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => setRelationsChar(c)}
                  hitSlop={6}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    backgroundColor: C.card2,
                    borderWidth: 1,
                    borderColor: C.borderSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="git-network-outline" size={15} color={C.blue} />
                </Pressable>
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
              {c.main_career_stage_desc ? (
                <Text style={{ color: C.gold, fontSize: 11.5 }} numberOfLines={1}>
                  主修 · {c.main_career_stage_desc}
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

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SelectField label="定位" value={form.role ?? ''} options={ROLES.map((r) => ({ value: r, label: r }))} onChange={(v) => set({ role: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField label="状态" value={form.status || 'alive'} options={STATUS_OPTIONS} onChange={(v) => set({ status: v })} />
          </View>
        </View>

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
        <MultiSelectField
          label="别名/称呼"
          options={[]}
          value={form.aliases ?? []}
          onChange={(v) => set({ aliases: v })}
          placeholder="如：顾三、顾公子（正文召回时一起匹配）"
        />
        <FieldLabel>性格</FieldLabel>
        <Input value={form.personality ?? ''} onChangeText={(v) => set({ personality: v })} placeholder="性格关键词" multiline height={80} />
        <FieldLabel>外貌</FieldLabel>
        <Input value={form.appearance ?? ''} onChangeText={(v) => set({ appearance: v })} placeholder="外貌特征" multiline height={80} />

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <FieldLabel>多套装扮（{form.outfits?.length ?? 0}）</FieldLabel>
            <View style={{ flex: 1 }} />
            {cur ? (
              <Pressable
                onPress={() => {
                  setOutfitAiCount(3);
                  setOutfitAiReq('');
                  setOutfitAiOpen(true);
                }}
                hitSlop={6}
              >
                <Text style={{ color: C.blue, fontSize: 12, fontWeight: '700' }}>AI 配装</Text>
              </Pressable>
            ) : null}
          </View>
          {(form.outfits ?? []).map((o, i) => (
            <View key={i} style={{ backgroundColor: C.card2, borderRadius: R.s, padding: 9, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input value={o.name} onChangeText={(v) => setOutfitRow(i, { name: v })} placeholder="装扮名（如：冬季校服）" />
                </View>
                <Pressable onPress={() => removeOutfit(i)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={17} color={C.seal} />
                </Pressable>
              </View>
              <Input value={o.description} onChangeText={(v) => setOutfitRow(i, { description: v })} placeholder="可绘制的外观描述（面料/颜色/配饰）" multiline height={56} />
            </View>
          ))}
          <Pressable
            onPress={addOutfit}
            style={({ pressed }) => ({
              height: 38,
              borderRadius: R.m,
              backgroundColor: pressed ? C.card2 : 'transparent',
              borderWidth: 1,
              borderColor: C.border,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            })}
          >
            <Ionicons name="add" size={14} color={C.text2} />
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>添加一套装扮</Text>
          </Pressable>
          {(form.outfits?.length ?? 0) === 0 ? (
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>
              立绘/封面出图时可按名选装；不设置则按档案外貌出图。 AI 配装会参考外貌与世界观看重名跳过。
            </Text>
          ) : null}
        </View>
        <FieldLabel>说话风格</FieldLabel>
        <Input value={form.speech_style ?? ''} onChangeText={(v) => set({ speech_style: v })} placeholder="如：语速慢、爱用反问" />
        <FieldLabel>当前心理</FieldLabel>
        <Input value={form.mental_state ?? ''} onChangeText={(v) => set({ mental_state: v })} placeholder="此刻的心理状态（剧情分析会自动更新）" />
        <FieldLabel>能力</FieldLabel>
        <Input value={form.ability ?? ''} onChangeText={(v) => set({ ability: v })} placeholder="金手指/功法/特长" multiline height={80} />
        <FieldLabel>背景</FieldLabel>
        <Input value={form.background ?? ''} onChangeText={(v) => set({ background: v })} placeholder="出身与经历" multiline height={100} />
        <FieldLabel>成长经历</FieldLabel>
        <Input value={form.growth_experience ?? ''} onChangeText={(v) => set({ growth_experience: v })} placeholder="关键转折点（剧情分析会自动更新）" multiline height={80} />
        <SelectField label="变化类型" value={form.arc_type ?? ''} options={ARC_OPTIONS} onChange={(v) => set({ arc_type: v })} />
        <FieldLabel>人物变化轨迹</FieldLabel>
        <Input value={form.character_change ?? ''} onChangeText={(v) => set({ character_change: v })} placeholder="开篇→结局的转变（随章节自动累积）" multiline height={80} />
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

      {/* AI 配装扮（1-3 套，完成即自动保存落库） */}
      <SheetModal visible={outfitAiOpen} onClose={() => !outfitAiBusy && setOutfitAiOpen(false)} title={`AI 配装扮 · ${cur?.name ?? ''}`}>
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          参考角色外貌与本书世界观设计新装扮，完成即自动保存；与已有装扮同名的跳过不覆盖。
        </Text>
        <View style={{ gap: 9 }}>
          <FieldLabel>生成套数</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3].map((n) => {
              const on = outfitAiCount === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setOutfitAiCount(n)}
                  style={{
                    paddingHorizontal: 20,
                    height: 38,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? C.blueSoft : C.card2,
                    borderWidth: 1,
                    borderColor: on ? 'rgba(106,166,232,0.45)' : C.border,
                  }}
                >
                  <Text style={{ color: on ? C.blue : C.text2, fontSize: 13.5, fontWeight: on ? '700' : '500' }}>{n} 套</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>特别要求（可选）</FieldLabel>
          <Input value={outfitAiReq} onChangeText={setOutfitAiReq} placeholder="如：配一套冬季便装 / 要有宗门制服感" multiline height={70} />
        </View>
        {outfitAiPhase ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
            <ActivityIndicator size="small" color={C.blue} />
            <Text style={{ color: C.text2, fontSize: 12.5 }}>{outfitAiPhase}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={submitOutfitAi}
          disabled={outfitAiBusy}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.45)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: outfitAiBusy ? 0.7 : 1 }}
        >
          {outfitAiBusy ? <ActivityIndicator size="small" color={C.blue} /> : <Ionicons name="sparkles" size={16} color={C.blue} />}
          <Text style={{ color: C.blue, fontSize: 15, fontWeight: '800' }}>{outfitAiBusy ? '配装中…' : `设计 ${outfitAiCount} 套装扮`}</Text>
        </Pressable>
      </SheetModal>

      {/* key=角色 id：换角色/重开整组件重挂载，状态初始化即角色当前值（配合 PortraitSheet 去 effect 重置） */}
      <PortraitSheet
        key={portraitChar ? `portrait-${portraitChar.id}` : 'portrait-none'}
        projectId={projectId}
        kind="character"
        entity={portraitChar}
        visible={portraitChar !== null}
        onClose={() => setPortraitChar(null)}
        onUpdated={load}
      />

      <RelationsSheet projectId={projectId} character={relationsChar} onClose={() => setRelationsChar(null)} />

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

const RELATION_SOURCE_LABEL: Record<string, string> = {
  incremental: 'AI 增量分析',
  manual: '手动',
  auto: 'AI 分析',
};

/** 单个角色的人际关系面板：对方/类型/亲密度 + AI 分析的置信度与证据（可展开） */
function RelationsSheet({ projectId, character, onClose }: { projectId: number; character: CharacterItem | null; onClose: () => void }) {
  const { api } = useAuth();
  const [toast, toastNode] = useToast();
  const [all, setAll] = useState<CharacterRelation[] | null>(null);
  const [openEvidence, setOpenEvidence] = useState<number | null>(null);

  useEffect(() => {
    if (!character || !api) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开面板时先置空再异步拉关系列表
    setAll(null);
    setOpenEvidence(null);
    api
      .listRelations(projectId)
      .then((list) => setAll(list ?? []))
      .catch((e) => {
        setAll([]);
        toast(friendlyError(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  if (!character) return null;

  /** 有向关系：箭头方向标出谁对谁 */
  const rows = (all ?? []).filter((r) => r.from_character_id === character.id || r.to_character_id === character.id);
  const counterpart = (r: CharacterRelation) =>
    r.from_character_id === character.id ? { name: r.to_name ?? '?', outgoing: true } : { name: r.from_name ?? '?', outgoing: false };

  return (
    <>
      {toastNode}
      <SheetModal visible onClose={onClose} title={`人际关系 · ${character.name}`}>
        {all === null ? (
          <Skeleton count={3} height={72} />
        ) : rows.length === 0 ? (
          <EmptyState icon="git-network-outline" title="还没有关系" sub="开「自动关系分析」或让 AI 批量生成后，这里会展示 TA 与其他角色的关系" />
        ) : (
          rows.map((r) => {
            const cp = counterpart(r);
            const conf = typeof r.confidence === 'number' ? Math.round(r.confidence * 100) : null;
            const evidence = r.evidence ?? [];
            const evOpen = openEvidence === r.id;
            return (
              <View key={r.id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 12, gap: 7 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={cp.outgoing ? 'arrow-forward' : 'arrow-back'} size={13} color={C.text3} />
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {cp.name}
                  </Text>
                  <Chip label={r.relation_type} fg={C.gold} bg={C.goldSoft} bold />
                </View>
                {r.description ? (
                  <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={3}>
                    {r.description}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {typeof r.intimacy === 'number' && r.intimacy !== 0 ? (
                    <Chip label={r.intimacy > 0 ? `亲密 ${r.intimacy}` : `敌对 ${Math.abs(r.intimacy)}`} fg={r.intimacy > 0 ? C.green : C.seal} bg={r.intimacy > 0 ? C.greenSoft : C.sealSoft} />
                  ) : null}
                  {r.last_updated_chapter ? <Chip label={`依据至第${r.last_updated_chapter}章`} /> : null}
                  {r.source ? <Chip label={RELATION_SOURCE_LABEL[r.source] ?? r.source} /> : null}
                  {conf !== null ? (
                    <Chip label={`置信度 ${conf}%`} fg={conf >= 70 ? C.green : C.text2} bg={conf >= 70 ? C.greenSoft : C.card2} />
                  ) : null}
                </View>
                {evidence.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    <Pressable onPress={() => setOpenEvidence(evOpen ? null : r.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
                      <Ionicons name={evOpen ? 'chevron-down' : 'chevron-forward'} size={12} color={C.text3} />
                      <Text style={{ color: C.text3, fontSize: 11, fontWeight: '600' }}>证据 {evidence.length} 条{evOpen ? '' : '（展开）'}</Text>
                    </Pressable>
                    {evOpen ? (
                      <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.s, padding: 9, gap: 6 }}>
                        {evidence.slice(0, 6).map((ev, i) => (
                          <Text key={i} style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }}>
                            {ev.source === 'profile' || ev.type === 'profile' ? '〔档案〕' : ev.snippet?.startsWith('第') ? '' : '〔正文〕'}
                            {ev.snippet ?? ''}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </SheetModal>
    </>
  );
}
