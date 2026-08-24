import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { Chip, FieldLabel, Input, SheetModal, useConfirm, useToast } from '@/components/ui';
import type { CharacterItem } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { useAuthImage } from '@/lib/image';
import { pollTask } from '@/lib/tasks';
import { C, R } from '@/lib/theme';

const STYLES = [
  { key: 'game_cg', label: '游戏CG' },
  { key: 'anime', label: '日系动漫' },
  { key: 'guofeng', label: '新国风' },
  { key: 'ghibli', label: '吉卜力' },
  { key: 'healing', label: '治愈水彩' },
  { key: 'ink', label: '水墨' },
  { key: 'film', label: '写实胶片' },
  { key: 'photo', label: '纪实摄影' },
];

const VIEWS = [
  { key: 'single', label: '正面立绘' },
  { key: 'turnaround', label: '三视图设定' },
];

/** 角色立绘：AI 提示词 → 出图（可一键链式）、预览、删除 */
export function PortraitSheet({
  projectId,
  character,
  visible,
  onClose,
  onUpdated,
}: {
  projectId: number;
  character: CharacterItem | null;
  visible: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { api } = useAuth();
  const [style, setStyle] = useState('game_cg');
  const [view, setView] = useState('single');
  const [extra, setExtra] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [imgVersion, setImgVersion] = useState(0);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const hasImage = !!character?.reference_image && character.reference_image !== 'manual';
  const portraitUri = useAuthImage(
    visible && hasImage && api ? `portrait:${character!.id}` : null,
    api && character ? api.portraitUrl(character.id) : null,
    imgVersion,
  );

  // 打开时同步角色最新提示词
  useEffect(() => {
    if (visible && character) {
      setPrompt(character.reference_prompt ?? '');
      setExtra('');
      setPhase('');
      setImgVersion(0);
    }
  }, [visible, character]);

  const refreshChar = async (): Promise<CharacterItem | null> => {
    if (!api || !character) return null;
    const list = await api.getCharacters(projectId);
    const fresh = list.find((c) => c.id === character.id) ?? null;
    return fresh;
  };

  const genPrompt = async () => {
    if (!api || !character || busy) return;
    setBusy(true);
    setPhase('提示词生成中…');
    try {
      const r = await api.portraitPromptAsync(projectId, character.id, { style, view, extra_requirements: extra });
      await pollTask(api, r.task_id, { onTick: (t) => setPhase(`提示词 ${t.progress ?? 0}%`) });
      const fresh = await refreshChar();
      setPrompt(fresh?.reference_prompt ?? '');
      onUpdated();
      setPhase('');
      toast('提示词已生成，可编辑后出图');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const genImage = async () => {
    if (!api || !character || busy) return;
    if (!prompt.trim()) {
      toast('先让 AI 写提示词，或自己填一段');
      return;
    }
    setBusy(true);
    setPhase('立绘出图中…');
    try {
      const r = await api.portraitImageAsync(projectId, character.id, prompt.trim());
      await pollTask(api, r.task_id, { onTick: (t) => setPhase(`出图 ${t.progress ?? 0}%`) });
      setImgVersion((v) => v + 1);
      onUpdated();
      setPhase('');
      toast('立绘已生成');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const oneTap = async () => {
    if (!api || !character || busy) return;
    setBusy(true);
    setPhase('提示词生成中…');
    try {
      const p = await api.portraitPromptAsync(projectId, character.id, { style, view, extra_requirements: extra });
      await pollTask(api, p.task_id, { onTick: (t) => setPhase(`提示词 ${t.progress ?? 0}%`) });
      const fresh = await refreshChar();
      const finalPrompt = (fresh?.reference_prompt ?? '').trim();
      setPrompt(finalPrompt);
      if (!finalPrompt) throw new Error('提示词生成结果为空');
      setPhase('立绘出图中…');
      const img = await api.portraitImageAsync(projectId, character.id, finalPrompt);
      await pollTask(api, img.task_id, { onTick: (t) => setPhase(`出图 ${t.progress ?? 0}%`) });
      setImgVersion((v) => v + 1);
      onUpdated();
      setPhase('');
      toast('立绘已生成');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeImage = () => {
    if (!api || !character) return;
    confirm({
      title: '删除立绘',
      message: `删除「${character.name}」的立绘图片？（提示词保留，可重新出图）`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api
          .deletePortraitImage(projectId, character.id)
          .then(() => {
            setImgVersion((v) => v + 1);
            onUpdated();
            toast('已删除');
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  if (!character) return (
    <>
      {toastNode}
      {confirmNode}
    </>
  );

  return (
    <>
      {toastNode}
      {confirmNode}
      <SheetModal
        visible={visible}
        onClose={() => {
          if (!busy) onClose();
        }}
        title={`立绘 · ${character.name}`}
      >
        {/* 立绘预览 */}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 190,
              height: 285,
              borderRadius: 16,
              backgroundColor: C.card2,
              borderWidth: 1,
              borderColor: C.border,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {portraitUri ? (
              <Image source={{ uri: portraitUri }} style={{ width: 190, height: 285 }} resizeMode="cover" />
            ) : portraitUri === null ? (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Ionicons name="person-circle-outline" size={44} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 12 }}>还没有立绘</Text>
              </View>
            ) : (
              <ActivityIndicator color={C.gold} />
            )}
          </View>
          {hasImage ? (
            <Pressable onPress={removeImage} hitSlop={6}>
              <Text style={{ color: C.seal, fontSize: 12 }}>删除立绘</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>画风</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7 }}>
            {STYLES.map((s) => (
              <Pressable key={s.key} onPress={() => setStyle(s.key)}>
                <Chip label={s.label} fg={style === s.key ? C.gold : C.text2} bg={style === s.key ? C.goldSoft : C.card2} bold={style === s.key} />
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>视角</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {VIEWS.map((v) => (
              <Pressable key={v.key} onPress={() => setView(v.key)}>
                <Chip label={v.label} fg={view === v.key ? C.gold : C.text2} bg={view === v.key ? C.goldSoft : C.card2} bold={view === v.key} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: 7 }}>
          <FieldLabel>补充要求（可选）</FieldLabel>
          <Input value={extra} onChangeText={setExtra} placeholder="如：穿第二章后的黑斗篷" height={40} />
        </View>

        <View style={{ gap: 7 }}>
          <FieldLabel>立绘提示词（可编辑）</FieldLabel>
          <Input value={prompt} onChangeText={setPrompt} placeholder="点「AI 写提示词」自动生成" multiline height={110} />
        </View>

        {phase ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
            <ActivityIndicator size="small" color={C.gold} />
            <Text style={{ color: C.text2, fontSize: 12.5 }}>{phase}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={oneTap}
          disabled={busy}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
        >
          {busy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>一键生成（提示词 + 出图）</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={genPrompt}
            disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>只要提示词</Text>
          </Pressable>
          <Pressable
            onPress={genImage}
            disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>用当前提示词出图</Text>
          </Pressable>
        </View>
      </SheetModal>
    </>
  );
}
