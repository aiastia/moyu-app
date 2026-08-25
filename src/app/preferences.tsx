import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FieldLabel, Input, ScreenHeader, SelectField, useToast } from '@/components/ui';
import type { WritingStyleItem } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { NARRATIVE_POV_OPTIONS } from '@/lib/platforms';
import { C, R, SP } from '@/lib/theme';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 12 }}>
      <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>{title}</Text>
      {children}
    </View>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }}>{children}</Text>;
}

/** 个人偏好（用户级，对所有项目生效）——昵称/默认笔名/默认人称/默认字数走 /api/user/preferences，
 *  默认写作风格选中即生效（与写作风格页同一接口）。新建书时服务端自动带出这些默认值。 */
export default function PreferencesScreen() {
  const { api, updateUser } = useAuth();
  const [toast, toastNode] = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState('');
  const [penName, setPenName] = useState('');
  const [pov, setPov] = useState('');
  const [targetWan, setTargetWan] = useState('');

  const [styles, setStyles] = useState<WritingStyleItem[]>([]);
  const [styleSaving, setStyleSaving] = useState(false);
  const defaultStyleId = styles.find((s) => s.is_default)?.id;
  const defaultStyleName = styles.find((s) => s.id === defaultStyleId)?.name;

  useEffect(() => {
    if (!api) return;
    (async () => {
      try {
        const [prefs, styleList] = await Promise.all([
          api.getUserPreferences(),
          api.getWritingStyles().catch(() => [] as WritingStyleItem[]),
        ]);
        setNickname(prefs.nickname || '');
        setPenName(prefs.default_pen_name || '');
        setPov(prefs.new_book_defaults?.narrative_pov || '');
        const wan = Math.round((prefs.new_book_defaults?.target_word_count || 0) / 10000);
        setTargetWan(wan > 0 ? String(wan) : '');
        setStyles(Array.isArray(styleList) ? styleList : []);
      } catch (e) {
        toast(friendlyError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [api, toast]);

  const save = useCallback(async () => {
    if (!api || saving) return;
    setSaving(true);
    try {
      const wan = Math.round(Number(targetWan) || 0);
      const res = await api.putUserPreferences({
        nickname: nickname.trim(),
        default_pen_name: penName.trim(),
        new_book_defaults: {
          narrative_pov: pov,
          target_word_count: wan > 0 ? wan * 10000 : 0,
        },
      });
      setNickname(res?.nickname ?? nickname);
      // 昵称用于书架/设置页顶栏显示，改完即时同步
      updateUser({ nickname: res?.nickname ?? nickname.trim() });
      toast('已保存');
    } catch (e) {
      toast('保存失败：' + friendlyError(e));
    } finally {
      setSaving(false);
    }
  }, [api, saving, nickname, penName, pov, targetWan, updateUser, toast]);

  const onStyleChange = async (raw: string) => {
    const id = Number(raw);
    if (!api || !id || id === defaultStyleId || styleSaving) return;
    setStyleSaving(true);
    try {
      await api.setDefaultWritingStyle(id);
      setStyles((ss) => ss.map((s) => ({ ...s, is_default: s.id === id })));
      toast('已设为默认风格，新书将自动继承');
    } catch (e) {
      toast('设置失败：' + friendlyError(e));
    } finally {
      setStyleSaving(false);
    }
  };

  // 人称选项 = 标准清单 + 偏好里已存的自定义值（网页端可自由输入，保持可选不丢）
  const povOptions = (() => {
    const extra = pov && !NARRATIVE_POV_OPTIONS.includes(pov) ? [pov] : [];
    return [...NARRATIVE_POV_OPTIONS, ...extra].map((v) => ({ value: v, label: v }));
  })();

  const styleOptions = [
    { value: '', label: '未设置' },
    ...styles.map((s) => ({ value: String(s.id), label: `${s.name}${s.is_preset ? '（内置）' : ''}` })),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="个人偏好" subtitle="用户级设置，对当前账号的所有项目生效" onBack={() => router.back()} />

        {loading ? (
          <ActivityIndicator color={C.gold} style={{ paddingVertical: 40 }} />
        ) : (
          <>
            <Card title="作者信息">
              <View style={{ gap: 7 }}>
                <FieldLabel>账号昵称</FieldLabel>
                <Input value={nickname} onChangeText={setNickname} placeholder="界面显示用（可选）" maxLength={50} />
              </View>
              <View style={{ gap: 7 }}>
                <FieldLabel>默认笔名</FieldLabel>
                <Input value={penName} onChangeText={setPenName} placeholder="用于封面展示与导出（可选）" maxLength={100} />
                <Hint>新建书时自动带出作为该书笔名，每本书仍可单独修改。</Hint>
              </View>
            </Card>

            <Card title="写作偏好">
              <View style={{ gap: 7 }}>
                <FieldLabel>默认写作风格</FieldLabel>
                <SelectField
                  value={defaultStyleId ? String(defaultStyleId) : ''}
                  options={styleOptions}
                  onChange={onStyleChange}
                  placeholder="未设置"
                  disabled={styleSaving || styles.length === 0}
                />
                <Hint>选中即生效。新建书自动继承为该书的默认风格，书内可单独更换；风格的编辑在「设置 → 写作风格」。</Hint>
              </View>
              <View style={{ gap: 7 }}>
                <FieldLabel>默认叙事人称</FieldLabel>
                <SelectField value={pov} options={povOptions} onChange={setPov} placeholder="未设置（建书时默认第三人称）" />
                <Hint>新建书时作为预填人称；在向导里改过的，以向导为准。</Hint>
              </View>
              <View style={{ gap: 7 }}>
                <FieldLabel>默认目标字数（万）</FieldLabel>
                <Input
                  value={targetWan}
                  onChangeText={setTargetWan}
                  placeholder="0 = 不预填"
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <Hint>新建书时预填到向导（留空不预填），书内可随时改。</Hint>
              </View>
            </Card>

            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => ({
                height: 48,
                borderRadius: R.m,
                backgroundColor: pressed ? '#D9A844' : C.gold,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                opacity: saving ? 0.7 : 1,
              })}
            >
              {saving ? <ActivityIndicator size="small" color="#1A1408" /> : <Ionicons name="checkmark" size={18} color="#1A1408" />}
              <Text style={{ color: '#1A1408', fontSize: 15, fontWeight: '800' }}>保存</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
