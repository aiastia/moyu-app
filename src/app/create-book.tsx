import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FieldLabel, Input, ScreenHeader, useConfirm, useToast } from '@/components/ui';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

const GENRES = ['玄幻', '仙侠', '都市', '言情', '科幻', '悬疑', '历史', '游戏', '奇幻', '武侠'];
const POVS = ['第三人称', '第一人称'];
const KINDS = [
  { key: 'long', label: '长篇连载' },
  { key: 'short', label: '短篇单章' },
];

function OptionChips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={{
              paddingHorizontal: 14,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? C.goldSoft : C.card,
              borderWidth: 1,
              borderColor: on ? 'rgba(229,181,88,0.4)' : C.borderSoft,
            }}
          >
            <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function CreateBookScreen() {
  const { api } = useAuth();
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [kind, setKind] = useState('long');
  const [pov, setPov] = useState('第三人称');
  const [targetWan, setTargetWan] = useState('50');
  const [penName, setPenName] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const submit = async () => {
    if (!api || busy) return;
    if (!title.trim()) {
      toast('书名还没填哦');
      return;
    }
    setBusy(true);
    try {
      await api.createProject({
        title: title.trim(),
        genre,
        synopsis,
        story_kind: kind,
        narrative_pov: pov,
        target_word_count: (Number(targetWan) || 0) * 10000,
        pen_name: penName.trim() || undefined,
      });
      confirm({
        title: '创建成功',
        message: `《${title.trim()}》已创建。可以在网页端跑一键初始化，或直接在这里生成大纲。`,
        cancelText: '',
        confirmText: '好',
        onConfirm: () => router.back(),
      });
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      {confirmNode}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="新建作品" subtitle="创建后会出现在书架上" onBack={() => router.back()} />

        <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 14 }}>
          <View style={{ gap: 7 }}>
            <FieldLabel>书名 *</FieldLabel>
            <Input value={title} onChangeText={setTitle} placeholder="给这本书起个名字" />
          </View>

          <View style={{ gap: 9 }}>
            <FieldLabel>题材</FieldLabel>
            <OptionChips options={GENRES} value={genre} onChange={setGenre} />
            <Input value={genre} onChangeText={setGenre} placeholder="自定义题材（可改上面的选择）" />
          </View>

          <View style={{ gap: 7 }}>
            <FieldLabel>简介</FieldLabel>
            <Input value={synopsis} onChangeText={setSynopsis} placeholder="一两句话讲清楚这个故事（越完整，后续生成质量越高）" multiline height={110} />
          </View>

          <View style={{ gap: 9 }}>
            <FieldLabel>篇幅</FieldLabel>
            <OptionChips options={KINDS.map((k) => k.label)} value={KINDS.find((k) => k.key === kind)?.label ?? ''} onChange={(label) => setKind(KINDS.find((k) => k.label === label)?.key ?? 'long')} />
          </View>

          <View style={{ gap: 9 }}>
            <FieldLabel>叙事人称</FieldLabel>
            <OptionChips options={POVS} value={pov} onChange={setPov} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 7 }}>
              <FieldLabel>目标字数（万）</FieldLabel>
              <Input value={targetWan} onChangeText={(v) => setTargetWan(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="50" />
            </View>
            <View style={{ flex: 1, gap: 7 }}>
              <FieldLabel>笔名（可选）</FieldLabel>
              <Input value={penName} onChangeText={setPenName} placeholder="不填则留空" />
            </View>
          </View>
        </View>

        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => ({
            height: 50,
            borderRadius: R.m,
            backgroundColor: busy ? '#B99447' : C.gold,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          {busy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="add-circle-outline" size={19} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 16, fontWeight: '800' }}>{busy ? '创建中…' : '创建作品'}</Text>
        </Pressable>

        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17, textAlign: 'center' }}>
          世界观、角色、蓝图等重初始化建议稍后在网页端「一键初始化」完成{'\n'}也可以先在这里生成前几章大纲开始动笔
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
