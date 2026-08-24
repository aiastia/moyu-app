import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Font from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';

import type { ChapterFull, ChapterNav } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, loadReaderPrefs, saveLastRead, saveReaderPrefs, useAuth } from '@/lib/auth';
import { AnalysisSheet } from '@/components/AnalysisSheet';
import { SheetModal, SelectField, StepperRow, useToast } from '@/components/ui';
import { getChapterVersion } from '@/lib/version';
import { C, DEFAULT_READER_PREFS, READER_FONTS, READER_THEMES, type ReaderPrefs } from '@/lib/theme';

/** 用户导入的自定义字体：固定存一份在应用沙箱，启动时重新注册 */
const CUSTOM_FONT_FAMILY = 'moyu-custom-font';
const CUSTOM_FONT_FILE = () => FileSystem.documentDirectory + 'reader-custom-font.ttf';

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
  const [importingFont, setImportingFont] = useState(false);
  const [customFontReady, setCustomFontReady] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const theme = useMemo(() => READER_THEMES.find((t) => t.key === prefs.theme) ?? READER_THEMES[0], [prefs.theme]);
  const isLight = prefs.theme !== 'night';

  /** 启动时恢复自定义字体（字体文件不会随进程存活，需重新注册）；失败回落默认 */
  const restoreCustomFont = async (label: string | undefined): Promise<boolean> => {
    try {
      const info = await FileSystem.getInfoAsync(CUSTOM_FONT_FILE());
      if (!info.exists) return false;
      if (!Font.isLoaded(CUSTOM_FONT_FAMILY)) {
        await Font.loadAsync({ [CUSTOM_FONT_FAMILY]: CUSTOM_FONT_FILE() });
      }
      setCustomFontReady(true);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    loadReaderPrefs().then(async (p) => {
      setPrefs(p);
      if (p.fontKey === 'custom') {
        const ok = await restoreCustomFont(p.customFontLabel);
        if (!ok) {
          const next = { ...p, fontKey: 'default' };
          setPrefs(next);
          saveReaderPrefs(next);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 从设备导入字体文件（ttf/otf/ttc），拷进沙箱并立即应用 */
  const importFont = async () => {
    if (importingFont) return;
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
    if (res.canceled) return;
    const file = res.assets?.[0];
    if (!file) return;
    if (!/\.(ttf|otf|ttc)$/i.test(file.name ?? '')) {
      toast('只支持 .ttf / .otf / .ttc 字体文件');
      return;
    }
    setImportingFont(true);
    try {
      const dest = CUSTOM_FONT_FILE();
      const old = await FileSystem.getInfoAsync(dest);
      if (old.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
      await FileSystem.copyAsync({ from: file.uri, to: dest });
      if (Font.isLoaded(CUSTOM_FONT_FAMILY)) await Font.unloadAsync(CUSTOM_FONT_FAMILY);
      await Font.loadAsync({ [CUSTOM_FONT_FAMILY]: dest });
      const label = (file.name ?? '自定义').replace(/\.(ttf|otf|ttc)$/i, '');
      setCustomFontReady(true);
      const next = { ...prefs, fontKey: 'custom', customFontLabel: label };
      setPrefs(next);
      saveReaderPrefs(next);
      toast(`已应用字体「${label}」`);
    } catch {
      toast('这个字体文件加载失败，换一个试试');
    } finally {
      setImportingFont(false);
    }
  };

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
  const bodyFont = useMemo(
    () => (prefs.fontKey === 'custom' && customFontReady ? CUSTOM_FONT_FAMILY : READER_FONTS.find((f) => f.key === prefs.fontKey)?.fontFamily),
    [prefs.fontKey, customFontReady],
  );
  /** 字体下拉选项：系统字体 + 已导入的自定义字体（选项文字按各自字体渲染预览） */
  const fontOptions = useMemo(() => {
    const opts = READER_FONTS.map((f) => ({ value: f.key, label: f.label, labelFontFamily: f.fontFamily }));
    if (customFontReady && prefs.customFontLabel) {
      opts.push({ value: 'custom', label: prefs.customFontLabel, labelFontFamily: CUSTOM_FONT_FAMILY });
    }
    return opts;
  }, [customFontReady, prefs.customFontLabel]);
  /** 行距/段距可调：行高 = 字号 × 行距倍数，段距是段间留白（用户反馈阅读排版太挤不可调） */
  const lineGap = Math.round(prefs.fontSize * prefs.lineSpacing);
  /** 正文段落元素缓存：打开设置面板/Toast 之类的界面态变化不再重渲整章几十上百个 Text */
  const paragraphEls = useMemo(
    () =>
      paragraphs.map((p, i) => (
        <Text key={i} style={{ color: theme.text, fontSize: prefs.fontSize, lineHeight: lineGap, fontFamily: bodyFont, marginBottom: prefs.paraSpacing, textAlign: 'justify' }}>
          {p}
        </Text>
      )),
    [paragraphs, theme.text, prefs.fontSize, lineGap, prefs.paraSpacing, bodyFont],
  );

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
          onPress={() => setAnalysisOpen(true)}
          hitSlop={8}
          style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="stats-chart-outline" size={16} color={theme.text} />
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
          {paragraphEls}
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
      <SheetModal visible={panelOpen} onClose={() => setPanelOpen(false)} title="阅读设置">
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

        <StepperRow
          label="行距"
          hint="行与行之间的疏密"
          value={prefs.lineSpacing}
          step={0.1}
          min={1.3}
          max={2.4}
          format={(v) => `${v.toFixed(1)} 倍`}
          onChange={(v) => updatePrefs({ lineSpacing: v })}
        />

        <StepperRow
          label="段间距"
          hint="段与段之间的留白"
          value={prefs.paraSpacing}
          step={2}
          min={0}
          max={36}
          format={(v) => `${v}`}
          onChange={(v) => updatePrefs({ paraSpacing: v })}
        />

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

        <View style={{ gap: 9 }}>
          <Text style={{ color: C.text2, fontSize: 13 }}>字体</Text>
          <SelectField
            value={prefs.fontKey}
            options={fontOptions}
            onChange={(k) => updatePrefs({ fontKey: k })}
          />
          <Pressable
            onPress={importFont}
            disabled={importingFont}
            style={{
              height: 42,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: 'rgba(229,181,88,0.5)',
              opacity: importingFont ? 0.6 : 1,
            }}
          >
            {importingFont ? <ActivityIndicator size="small" color={C.gold} /> : <Ionicons name="add" size={14} color={C.gold} />}
            <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '600' }}>
              {prefs.fontKey === 'custom' && prefs.customFontLabel ? '换一个字体文件' : '导入设备字体'}
            </Text>
          </Pressable>
          <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }}>
            系统字体按设备支持呈现；导入 .ttf / .otf / .ttc 字体文件后出现在下拉里，只对阅读正文生效
          </Text>
        </View>
      </SheetModal>

      {/* 章节剧情分析（评分 / 一致性 / 建议） */}
      {chapter ? (
        <AnalysisSheet
          projectId={projectId}
          chapterNumber={chapter.chapter_number}
          chapterId={chapterId}
          visible={analysisOpen}
          onClose={() => setAnalysisOpen(false)}
        />
      ) : null}
    </View>
  );
}
