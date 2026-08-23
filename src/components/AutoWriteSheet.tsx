import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { FieldLabel, Input, SheetModal, useToast } from '@/components/ui';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const TOTAL_OPTIONS = [5, 10, 20, 30, 50];
const BATCH_OPTIONS = [3, 5];

function PickChips({ options, value, onChange, suffix = '' }: { options: number[]; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
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
            <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>
              {o}
              {suffix}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: C.text3, fontSize: 11 }}>{hint}</Text>
      </View>
      <View style={{ width: 46, height: 27, borderRadius: 14, backgroundColor: value ? C.gold : '#2A3042', padding: 3 }}>
        <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </View>
    </Pressable>
  );
}

/** 一键连写：循环「大纲→正文」直到写满总章数 */
export function AutoWriteSheet({ projectId }: { projectId: number }) {
  const { api } = useAuth();
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(10);
  const [batch, setBatch] = useState(3);
  const [polish, setPolish] = useState(true);
  const [analysis, setAnalysis] = useState(true);
  const [direction, setDirection] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, toastNode] = useToast();

  const submit = async () => {
    if (!api || busy) return;
    setBusy(true);
    try {
      await api.startAutoWrite(projectId, {
        total_chapters: total,
        batch_size: batch,
        enable_analysis: analysis,
        enable_polish: polish,
        story_direction: direction.trim() || undefined,
      });
      setOpen(false);
      Alert.alert('连写已启动', `目标写满 ${total} 章。每章约 5-12 分钟，可随时在任务页看进度或取消。`, [
        { text: '留在本页' },
        { text: '去任务页', onPress: () => router.navigate('/tasks') },
      ]);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {toastNode}
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: 46,
          borderRadius: R.m,
          backgroundColor: pressed ? '#B99447' : C.gold,
        })}
      >
        <Ionicons name="flash" size={17} color="#1A1206" />
        <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>一键连写</Text>
      </Pressable>

      <SheetModal visible={open} onClose={() => !busy && setOpen(false)} title="一键连写">
        <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18 }}>
          自动循环「续写大纲 → 批量写正文」，直到在现有进度上加满所选章数。写满即停。
        </Text>
        <View style={{ gap: 9 }}>
          <FieldLabel>本次新增章数</FieldLabel>
          <PickChips options={TOTAL_OPTIONS} value={total} onChange={setTotal} suffix=" 章" />
        </View>
        <View style={{ gap: 9 }}>
          <FieldLabel>每批章数</FieldLabel>
          <PickChips options={BATCH_OPTIONS} value={batch} onChange={setBatch} suffix=" 章/批" />
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 8, gap: 2 }}>
          <Toggle label="自动润色" hint="每章生成后去 AI 味（关了更快）" value={polish} onChange={setPolish} />
          <Toggle label="剧情分析" hint="审稿评分与一致性检查" value={analysis} onChange={setAnalysis} />
        </View>
        <View style={{ gap: 7 }}>
          <FieldLabel>故事走向（可选）</FieldLabel>
          <Input value={direction} onChangeText={setDirection} placeholder="如：本卷进入复仇线，主角开始反击…" multiline height={80} />
        </View>
        <Pressable
          onPress={submit}
          disabled={busy}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 4 }}
        >
          {busy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="play" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{busy ? '提交中…' : `开始连写 ${total} 章`}</Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
          同一本书同时只能有一个生成任务在跑{'\n'}重复提交会被服务端拒绝（409）
        </Text>
      </SheetModal>
    </View>
  );
}
