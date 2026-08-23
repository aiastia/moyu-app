import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, FieldLabel, Input, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { WorldCore, WorldItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const CORE_FIELDS: { key: keyof WorldCore; label: string; placeholder: string }[] = [
  { key: 'world_time_period', label: '时间设定', placeholder: '时代背景、纪年方式…' },
  { key: 'world_location', label: '地点设定', placeholder: '世界观的核心舞台…' },
  { key: 'world_atmosphere', label: '氛围设定', placeholder: '整体基调与气质…' },
  { key: 'world_rules', label: '规则设定', placeholder: '力量体系、社会法则…' },
];

/** 世界观设定面板：核心世界观（时间/地点/氛围/规则）+ 详细条目列表 */
export function WorldsPanel({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [items, setItems] = useState<WorldItem[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [core, setCore] = useState<WorldCore | null>(null);
  const [coreEdit, setCoreEdit] = useState<WorldCore | null>(null);
  const [coreSaving, setCoreSaving] = useState(false);
  const [editing, setEditing] = useState<WorldItem | 'new' | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiIdea, setAiIdea] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const [list, worldCore] = await Promise.all([api.getWorlds(projectId), api.getWorldCore(projectId).catch(() => null)]);
      setItems(list ?? []);
      setCore(worldCore);
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

  /** 保存核心世界观（四字段手动编辑） */
  const saveCore = () => {
    if (!api || !coreEdit || coreSaving) return;
    setCoreSaving(true);
    api
      .updateWorldCore(projectId, coreEdit)
      .then(() => {
        setCore(coreEdit);
        setCoreEdit(null);
        toast('核心世界观已保存');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setCoreSaving(false));
  };

  /** AI 重新生成核心世界观（异步任务，会覆盖现有四项） */
  const regenCore = () => {
    if (!api) return;
    confirm({
      title: 'AI 重新生成核心世界观',
      message: 'AI 会根据本书简介与已有设定重新生成时间/地点/氛围/规则四项，覆盖现有内容。确定提交吗？',
      confirmText: '提交生成',
      onConfirm: () => {
        api
          .generateWorldCoreAsync(projectId)
          .then(() => {
            setCoreEdit(null);
            toast('已提交世界观生成任务，可在「任务」页看进度');
            router.navigate('/tasks');
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const openNew = () => {
    setEditing('new');
    setName('');
    setCategory(categories.includes('其他') ? '其他' : (categories[0] ?? ''));
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
    confirm({
      title: '删除设定',
      message: `确定删除「${w.name}」？此操作不可恢复。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api.deleteWorld(projectId, w.id).then(load).catch((e) => toast(friendlyError(e)));
      },
    });
  };

  /** 下拉分类选项：服务端统一清单 + 兼容历史自定义值 */
  const categoryOptions = useMemo(() => {
    const opts = categories.map((c) => ({ value: c, label: c }));
    if (category && !categories.includes(category)) {
      opts.push({ value: category, label: `${category}（历史）` });
    }
    return opts;
  }, [categories, category]);

  /** AI 生成一批详细设定（同步接口，需要等待） */
  const submitAi = async () => {
    if (!api || aiBusy) return;
    setAiBusy(true);
    try {
      const r = await api.generateWorlds(projectId, { idea: aiIdea.trim() });
      setAiOpen(false);
      setAiIdea('');
      toast(`AI 生成了 ${r.count} 条设定，下拉刷新查看`);
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setAiBusy(false);
    }
  };

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
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>新建设定</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAiIdea('');
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
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>AI 生成设定</Text>
        </Pressable>
      </View>

      {/* 核心世界观（时间/地点/氛围/规则，存于项目；网页端世界观页第一张卡） */}
      {core !== null ? (
        <Pressable
          onPress={() => setCoreEdit(core)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? C.card2 : C.card,
            borderWidth: 1,
            borderColor: 'rgba(95,191,143,0.28)',
            borderRadius: R.m,
            padding: 13,
            gap: 8,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="planet-outline" size={15} color={C.green} />
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '800', flex: 1 }}>核心世界观</Text>
            <Ionicons name="create-outline" size={14} color={C.text3} />
          </View>
          {CORE_FIELDS.every((f) => !core[f.key]) ? (
            <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
              还没填时间/地点/氛围/规则四项设定，点开手动填写，或让 AI 生成
            </Text>
          ) : (
            CORE_FIELDS.filter((f) => core[f.key]).map((f) => (
              <View key={f.key} style={{ gap: 3 }}>
                <Text style={{ color: C.green, fontSize: 11.5, fontWeight: '700' }}>{f.label}</Text>
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                  {core[f.key]}
                </Text>
              </View>
            ))
          )}
        </Pressable>
      ) : null}

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
        <SelectField label="分类" value={category} options={categoryOptions} onChange={setCategory} placeholder="选择分类" />
        <View style={{ gap: 7 }}>
          <FieldLabel>内容</FieldLabel>
          <Input value={content} onChangeText={setContent} placeholder="设定正文…" multiline height={180} />
        </View>
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

      {/* 核心世界观编辑：四项设定 + AI 重新生成 */}
      <SheetModal visible={coreEdit !== null} onClose={() => setCoreEdit(null)} title="核心世界观">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          四项核心设定会作为最高优先级背景注入大纲与正文生成。
        </Text>
        {CORE_FIELDS.map((f) => (
          <View key={f.key} style={{ gap: 7 }}>
            <FieldLabel>{f.label}</FieldLabel>
            <Input
              value={coreEdit?.[f.key] ?? ''}
              onChangeText={(v) => setCoreEdit((c) => (c ? { ...c, [f.key]: v } : c))}
              placeholder={f.placeholder}
              multiline
              height={84}
            />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Pressable
            onPress={regenCore}
            style={{ height: 44, paddingHorizontal: 16, borderRadius: R.m, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
          >
            <Ionicons name="sparkles" size={14} color={C.blue} />
            <Text style={{ color: C.blue, fontSize: 13.5, fontWeight: '700' }}>AI 重新生成</Text>
          </Pressable>
          <Pressable
            onPress={saveCore}
            disabled={coreSaving}
            style={{ flex: 1, height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{coreSaving ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>
      </SheetModal>

      {/* AI 生成一批世界设定（同步等待） */}
      <SheetModal visible={aiOpen} onClose={() => (aiBusy ? undefined : setAiOpen(false))} title="AI 生成设定">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          AI 会基于本书的世界观与已有设定，补一批地理/历史/体系类的详细条目（最多 10 条）。
        </Text>
        <View style={{ gap: 7 }}>
          <FieldLabel>生成方向（可选）</FieldLabel>
          <Input
            value={aiIdea}
            onChangeText={setAiIdea}
            placeholder="如：重点补魔药体系、东海一带的地理势力"
            multiline
            height={90}
            editable={!aiBusy}
          />
        </View>
        <Pressable
          onPress={submitAi}
          disabled={aiBusy}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: aiBusy ? 0.75 : 1 }}
        >
          {aiBusy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{aiBusy ? 'AI 正在生成，稍等…' : '开始生成'}</Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>这一步要等 AI 写完（约半分钟到几分钟），生成中请不要关闭弹窗</Text>
      </SheetModal>
    </View>
  );
}
