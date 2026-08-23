import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChapterFull, ChapterNav } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, loadReaderPrefs, saveLastRead, saveReaderPrefs, useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui';
import { getChapterVersion } from '@/lib/version';
import { C, DEFAULT_READER_PREFS, READER_THEMES, type ReaderPrefs } from '@/lib/theme';

export default function ReaderScreen() {
  const { projectId: pid, chapterId: cid, canGenerate, reason } = useLocalSearchParams<{
    projectId: string;
    chapterId: string;
    canGenerate?: string;
    reason?: string;
  }>();
  const projectId = Number(pid);
  const chapterId = Number(cid);
  const { api, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [chapter, setChapter] = useState<ChapterFull | null>(null);
  const [nav, setNav] = useState<ChapterNav | null>(null);
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, toastNode] = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const loadedVersion = useRef(0);

  const theme = useMemo(() => READER_THEMES.find((t) => t.key === prefs.theme) ?? READER_THEMES[0], [prefs.theme]);
  const isLight = prefs.theme !== 'night';

  useEffect(() => {
    loadReaderPrefs().then(setPrefs);
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (!api || Number.isNaN(projectId) || Number.isNaN(chapterId)) return;
      if (!silent) {
        setError('');
        setChapter(null);
      }
      try {
        const [ch, n] = await Promise.all([
          api.getChapter(projectId, chapterId),
          api.getChapterNav(projectId, chapterId).catch(() => null),
        ]);
        setChapter(ch);
        setNav(n);
        loadedVersion.current = getChapterVersion(projectId, chapterId);
        setError('');
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        saveLastRead(projectId, chapterId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await logout();
          router.replace('/login');
          return;
        }
        setError(friendlyError(e));
      }
    },
    [api, projectId, chapterId, logout],
  );

  useEffect(() => {
    load();
  }, [load]);

  // 编辑保存后回到阅读页：静默刷新
  useFocusEffect(
    useCallback(() => {
      if (chapter && getChapterVersion(projectId, chapterId) > loadedVersion.current) {
        load(true);
      }
    }, [chapter, projectId, chapterId, load]),
  );

  const updatePrefs = (p: Partial<ReaderPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    saveReaderPrefs(next);
  };

  const gotoChapter = (id: number) => {
    router.replace({ pathname: '/reader', params: { projectId: String(projectId), chapterId: String(id) } });
  };

  /** 空章一键生成 */
  const generateHere = () => {
    if (!api || submitting || submitted) return;
    if (canGenerate !== '1') {
      toast(reason || '本章暂不能生成，请先在网页端准备大纲');
      return;
    }
    setSubmitting(true);
    api
      .generateChapter(projectId, chapterId)
      .then(() => {
        setSubmitted(true);
        toast('已提交生成任务，完成后回来下拉即可看到正文');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setSubmitting(false));
  };

  const paragraphs = useMemo(() => (chapter?.content ? chapter.content.split(/\n+/).map((s) => s.trim()).filter(Boolean) : []), [chapter]);
  const bodyFont = prefs.serif ? 'NotoSerifSC' : undefined;
  const lineGap = Math.round(prefs.fontSize * 0.95);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {toastNode}
      <StatusBar style={isLight ? 'dark' : 'light'} />

      {/* 顶栏 */}
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : '#1B2130', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={19} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ color: theme.sub, fontSize: 11 }}>第{chapter?.chapter_number ?? '—'}章</Text>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
            {chapter?.title ?? '加载中…'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/editor', params: { projectId: String(projectId), chapterId: String(chapterId) } })}
          hitSlop={8}
          style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="create-outline" size={17} color={theme.text} />
        </Pressable>
        <Pressable
          onPress={() => setPanelOpen(true)}
          hitSlop={8}
          style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>Aa</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={theme.sub} />
          <Text style={{ color: theme.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>{error}</Text>
          <Pressable onPress={() => load()} style={{ paddingHorizontal: 20, height: 38, borderRadius: 12, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '700' }}>重试</Text>
          </Pressable>
        </View>
      ) : chapter === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.gold} />
        </View>
      ) : paragraphs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 }}>
          <Ionicons name="sparkles-outline" size={36} color={theme.sub} />
          <Text style={{ color: theme.sub, fontSize: 13 }}>本章还没有正文</Text>
          {submitted ? (
            <Pressable
              onPress={() => router.navigate('/tasks')}
              style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 22, borderRadius: 14, backgroundColor: C.gold }}
            >
              <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>已提交 · 去任务页看进度</Text>
              <Ionicons name="chevron-forward" size={15} color="#1A1206" />
            </Pressable>
          ) : (
            <Pressable
              onPress={generateHere}
              disabled={submitting}
              style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 7, height: 46, paddingHorizontal: 24, borderRadius: 14, backgroundColor: canGenerate === '1' ? C.gold : theme.card, opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={canGenerate === '1' ? '#1A1206' : theme.sub} />
              ) : (
                <Ionicons name="sparkles" size={16} color={canGenerate === '1' ? '#1A1206' : theme.sub} />
              )}
              <Text style={{ color: canGenerate === '1' ? '#1A1206' : theme.sub, fontSize: 14.5, fontWeight: '800' }}>
                {canGenerate === '1' ? '生成本章正文' : '本章暂不能生成'}
              </Text>
            </Pressable>
          )}
          {canGenerate !== '1' && reason ? (
            <Text style={{ color: theme.sub, fontSize: 11.5, lineHeight: 17, textAlign: 'center' }}>{reason}</Text>
          ) : null}
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 30 }}>
          <Text style={{ color: theme.text, fontSize: prefs.fontSize + 5, fontWeight: '800', fontFamily: bodyFont, lineHeight: (prefs.fontSize + 5) * 1.6, marginBottom: 6 }}>
            {chapter.title || `第${chapter.chapter_number}章`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 }}>
            <View style={{ width: 26, height: 2, borderRadius: 1, backgroundColor: C.gold, opacity: 0.85 }} />
            <Text style={{ color: theme.sub, fontSize: 11.5 }}>共 {chapter.word_count} 字</Text>
          </View>
          {paragraphs.map((p, i) => (
            <Text
              key={i}
              style={{ color: theme.text, fontSize: prefs.fontSize, lineHeight: lineGap, fontFamily: bodyFont, marginBottom: 14, textAlign: 'justify' }}
            >
              {p}
            </Text>
          ))}
          <View style={{ alignItems: 'center', gap: 14, marginTop: 26 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 30, height: 1, backgroundColor: theme.sub, opacity: 0.5 }} />
              <Text style={{ color: theme.sub, fontSize: 12 }}>本章完</Text>
              <View style={{ width: 30, height: 1, backgroundColor: theme.sub, opacity: 0.5 }} />
            </View>
          </View>
        </ScrollView>
      )}

      {/* 底部翻章栏 */}
      <View style={{ paddingBottom: insets.bottom + 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: isLight ? 'rgba(0,0,0,0.08)' : '#1B2130', flexDirection: 'row', gap: 10 }}>
        <Pressable
          disabled={!nav?.previous}
          onPress={() => nav?.previous && gotoChapter(nav.previous.id)}
          style={{
            flex: 1,
            height: 42,
            borderRadius: 13,
            backgroundColor: theme.card,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: nav?.previous ? 1 : 0.4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chevron-back" size={14} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
              上一章
            </Text>
          </View>
        </Pressable>
        <Pressable
          disabled={!nav?.next}
          onPress={() => nav?.next && gotoChapter(nav.next.id)}
          style={{
            flex: 1,
            height: 42,
            borderRadius: 13,
            backgroundColor: nav?.next ? C.gold : theme.card,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: nav?.next ? 1 : 0.4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: nav?.next ? '#1A1206' : theme.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
              下一章
            </Text>
            <Ionicons name="chevron-forward" size={14} color={nav?.next ? '#1A1206' : theme.text} />
          </View>
        </Pressable>
      </View>

      {/* 阅读设置面板 */}
      <Modal visible={panelOpen} transparent animationType="slide" onRequestClose={() => setPanelOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setPanelOpen(false)} />
        <View style={{ backgroundColor: '#141826', paddingHorizontal: 22, paddingTop: 20, paddingBottom: insets.bottom + 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }}>阅读设置</Text>
            <Pressable onPress={() => setPanelOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={21} color={C.text2} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ color: C.text2, fontSize: 13, width: 44 }}>字号</Text>
            <Pressable
              onPress={() => updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) })}
              style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: C.text, fontSize: 15 }}>A-</Text>
            </Pressable>
            <Text style={{ color: C.gold, fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' }}>{prefs.fontSize}</Text>
            <Pressable
              onPress={() => updatePrefs({ fontSize: Math.min(28, prefs.fontSize + 1) })}
              style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: C.text, fontSize: 17 }}>A+</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ color: C.text2, fontSize: 13, width: 44 }}>背景</Text>
            {READER_THEMES.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => updatePrefs({ theme: t.key })}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: t.bg,
                  borderWidth: 2,
                  borderColor: prefs.theme === t.key ? C.gold : '#2A3042',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: t.text, fontSize: 10 }}>{t.name}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: C.text2, fontSize: 13, flex: 1 }}>宋体正文（思源宋体）</Text>
            <Pressable
              onPress={() => updatePrefs({ serif: !prefs.serif })}
              style={{
                width: 50,
                height: 30,
                borderRadius: 15,
                backgroundColor: prefs.serif ? C.gold : '#2A3042',
                padding: 3,
              }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignSelf: prefs.serif ? 'flex-end' : 'flex-start' }} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
