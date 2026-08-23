import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ChapterFull } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';
import { bumpChapterVersion } from '@/lib/version';

export default function EditorScreen() {
  const { projectId: pid, chapterId: cid } = useLocalSearchParams<{ projectId: string; chapterId: string }>();
  const projectId = Number(pid);
  const chapterId = Number(cid);
  const { api, logout } = useAuth();

  const [chapter, setChapter] = useState<ChapterFull | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 正文用非受控输入（defaultValue + ref）：受控时每个按键都会带着几千字的 value 重渲染
   *  整页，是长正文编辑卡顿的主因；字数/脏标记走 300ms 防抖，仅供底栏和保存按钮参考。 */
  const contentRef = useRef('');
  const titleRef = useRef('');
  const [stats, setStats] = useState({ len: 0, dirty: false });
  const statsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirtyNow = () =>
    !!chapter && (titleRef.current !== (chapter.title ?? '') || contentRef.current !== (chapter.content ?? ''));

  const touchStats = () => {
    if (statsTimer.current) clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => {
      setStats({ len: contentRef.current.length, dirty: isDirtyNow() });
    }, 300);
  };

  const load = useCallback(async () => {
    if (!api || Number.isNaN(projectId) || Number.isNaN(chapterId)) return;
    try {
      const ch = await api.getChapter(projectId, chapterId);
      setChapter(ch);
      setTitle(ch.title ?? '');
      titleRef.current = ch.title ?? '';
      contentRef.current = ch.content ?? '';
      setStats({ len: (ch.content ?? '').length, dirty: false });
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }
      setError(friendlyError(e));
    }
  }, [api, projectId, chapterId, logout]);

  useEffect(() => {
    load();
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (statsTimer.current) clearTimeout(statsTimer.current);
    };
  }, [load]);

  const save = async () => {
    if (!api || saving) return;
    const content = contentRef.current;
    const trimmedTitle = titleRef.current.trim();
    // 以按下瞬间的实时内容判断，不被 300ms 防抖卡住
    if (!chapter || (trimmedTitle === (chapter.title ?? '') && content === (chapter.content ?? ''))) return;
    setSaving(true);
    try {
      await api.updateChapter(projectId, chapterId, { title: trimmedTitle, content });
      bumpChapterVersion(projectId, chapterId);
      setChapter((c) => (c ? { ...c, title: trimmedTitle, content, word_count: content.length } : c));
      setStats({ len: content.length, dirty: false });
      setSaved(true);
      savedTimer.current = setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: SP.l, paddingTop: 10, gap: 12, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </Pressable>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: C.text3, fontSize: 11 }}>编辑章节</Text>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
              第{chapter?.chapter_number ?? '—'}章 {title || '未命名'}
            </Text>
          </View>
          <Pressable
            onPress={save}
            disabled={saving}
            style={{
              height: 38,
              paddingHorizontal: 20,
              borderRadius: 12,
              backgroundColor: stats.dirty ? C.gold : C.card2,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={stats.dirty ? '#1A1206' : C.text3} />
            ) : (
              <Ionicons name="save-outline" size={15} color={stats.dirty ? '#1A1206' : C.text3} />
            )}
            <Text style={{ color: stats.dirty ? '#1A1206' : C.text3, fontSize: 14, fontWeight: '800' }}>
              {saving ? '保存中' : saved ? '已保存' : '保存'}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.goldSoft, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }}>
          <Ionicons name="information-circle-outline" size={14} color={C.gold} />
          <Text style={{ color: '#C8A96A', fontSize: 11.5, flex: 1, lineHeight: 16 }}>
            手机端适合小修小补；大段重写建议在网页端操作
          </Text>
        </View>

        {error ? (
          <Text style={{ color: C.seal, fontSize: 12.5, lineHeight: 18 }}>{error}</Text>
        ) : null}

        {chapter === null ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.gold} />
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.l, padding: 14, gap: 10 }}>
            <TextInput
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                titleRef.current = v;
                touchStats();
              }}
              placeholder="章节标题"
              placeholderTextColor="#5A6170"
              style={{ color: C.text, fontSize: 16, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: C.borderSoft, paddingBottom: 10 }}
            />
            <TextInput
              defaultValue={chapter.content ?? ''}
              onChangeText={(v) => {
                contentRef.current = v;
                touchStats();
              }}
              multiline
              textAlignVertical="top"
              placeholder="正文内容…"
              placeholderTextColor="#5A6170"
              style={{ flex: 1, color: C.text, fontSize: 15 }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 10 }}>
              <Text style={{ color: C.text3, fontSize: 11.5, flex: 1 }}>
                {stats.len} 字
                {stats.dirty ? ' · 有未保存修改' : ''}
              </Text>
              {chapter.quality_score ? <Text style={{ color: C.gold, fontSize: 11.5 }}>评分 {chapter.quality_score}</Text> : null}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
