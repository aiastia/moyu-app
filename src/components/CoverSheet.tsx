import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { FieldLabel, Input, SheetModal, useToast } from '@/components/ui';
import { friendlyError, useAuth } from '@/lib/auth';
import { clearAuthImageCache } from '@/lib/image';
import { pollTask } from '@/lib/tasks';
import { C, R } from '@/lib/theme';

const SIZES = [
  { key: '1024x1536', label: '竖版 2:3' },
  { key: '1024x1024', label: '方形 1:1' },
];

/** 封面生成：AI 提示词 → 出图（可一键链式），完成后刷新封面 */
export function CoverSheet({ projectId, initialPrompt, onCoverChanged }: { projectId: number; initialPrompt?: string | null; onCoverChanged: () => void }) {
  const { api } = useAuth();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1536');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [toast, toastNode] = useToast();

  const openSheet = () => {
    setPrompt(initialPrompt ?? '');
    setPhase('');
    setOpen(true);
  };

  const genPrompt = async () => {
    if (!api || busy) return;
    setBusy(true);
    setPhase('提示词生成中…');
    try {
      const r = await api.coverPromptAsync(projectId);
      await pollTask(api, r.task_id, { onTick: (t) => setPhase(`提示词 ${t.progress ?? 0}%`) });
      const proj = await api.getProject(projectId);
      setPrompt(proj.cover_prompt ?? '');
      setPhase('');
      toast('提示词已生成，可直接出图或修改后再出');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const genImage = async () => {
    if (!api || busy) return;
    if (!prompt.trim()) {
      toast('先让 AI 写提示词，或自己填一段');
      return;
    }
    setBusy(true);
    setPhase('封面出图中…');
    try {
      const r = await api.coverImageAsync(projectId, prompt.trim(), size);
      await pollTask(api, r.task_id, { onTick: (t) => setPhase(`出图 ${t.progress ?? 0}%`) });
      clearAuthImageCache();
      onCoverChanged();
      setOpen(false);
      toast('封面已生成');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const oneTap = async () => {
    if (!api || busy) return;
    setBusy(true);
    setPhase('提示词生成中…');
    try {
      const p = await api.coverPromptAsync(projectId);
      await pollTask(api, p.task_id, { onTick: (t) => setPhase(`提示词 ${t.progress ?? 0}%`) });
      const proj = await api.getProject(projectId);
      const finalPrompt = (proj.cover_prompt ?? '').trim();
      setPrompt(finalPrompt);
      if (!finalPrompt) throw new Error('提示词生成结果为空');
      setPhase('封面出图中…');
      const img = await api.coverImageAsync(projectId, finalPrompt, size);
      await pollTask(api, img.task_id, { onTick: (t) => setPhase(`出图 ${t.progress ?? 0}%`) });
      clearAuthImageCache();
      onCoverChanged();
      setOpen(false);
      toast('封面已生成');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {toastNode}
      <Pressable
        onPress={openSheet}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          height: 44,
          borderRadius: R.m,
          backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
          borderWidth: 1,
          borderColor: 'rgba(229,181,88,0.4)',
        })}
      >
        <Ionicons name="image-outline" size={16} color={C.gold} />
        <Text style={{ color: C.gold, fontSize: 14, fontWeight: '700' }}>AI 生成封面</Text>
      </Pressable>

      <SheetModal visible={open} onClose={() => !busy && setOpen(false)} title="AI 生成封面">
        <View style={{ gap: 9 }}>
          <FieldLabel>尺寸</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SIZES.map((s) => {
              const on = size === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setSize(s.key)}
                  style={{
                    paddingHorizontal: 15,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? C.goldSoft : C.card,
                    borderWidth: 1,
                    borderColor: on ? 'rgba(229,181,88,0.4)' : C.borderSoft,
                  }}
                >
                  <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 7 }}>
          <FieldLabel>封面提示词（可编辑）</FieldLabel>
          <Input value={prompt} onChangeText={setPrompt} placeholder="点「AI 写提示词」自动生成，或自己描述画面" multiline height={130} />
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

        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
          需要在服务端配置图像生成 API 才能出图
        </Text>
      </SheetModal>
    </View>
  );
}
