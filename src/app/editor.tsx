import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, PanResponder, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectField } from '@/components/ui';
import type { ChapterFull } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';
import { bumpChapterVersion } from '@/lib/version';

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿', hint: '创作中，还会继续修改' },
  { value: 'completed', label: '已完成', hint: '定稿章节（生成完默认置为已完成）' },
];

export default function EditorScreen() {
  const { projectId: pid, chapterId: cid } = useLocalSearchParams<{ projectId: string; chapterId: string }>();
  const projectId = Number(pid);
  const chapterId = Number(cid);
  const { api, logout } = useAuth();

  const [chapter, setChapter] = useState<ChapterFull | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('draft');
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

  /** statusOverride：切状态时事件闭包里的新值（此时 state 里的 status 还没更新） */
  const isDirtyNow = (statusOverride?: string) =>
    !!chapter &&
    (titleRef.current !== (chapter.title ?? '') ||
      contentRef.current !== (chapter.content ?? '') ||
      (statusOverride ?? status) !== (chapter.status ?? 'draft'));

  const scheduleStats = (statusOverride?: string) => {
    if (statsTimer.current) clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => {
      setStats({ len: contentRef.current.length, dirty: isDirtyNow(statusOverride) });
    }, 300);
  };

  const touchStats = () => scheduleStats();

  // ===== 键盘收起 + 全文快速跳转 =====
  const [kbVisible, setKbVisible] = useState(false);
  /** 拖动滑杆期间的受控光标位置（设置 selection 会把 EditText 视口滚到光标处 → 跳转） */
  const [selOffset, setSelOffset] = useState<{ start: number; end: number } | undefined>(undefined);
  /** 光标当前位置占全文百分比（滑杆 thumb 定位） */
  const [trackPct, setTrackPct] = useState(0);
  const [jumpPct, setJumpPct] = useState<number | null>(null);
  const sliderH = useRef(0);

  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', () => setKbVisible(true));
    const h = Keyboard.addListener('keyboardDidHide', () => setKbVisible(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const jumpAt = (y: number) => {
    const h = sliderH.current || 1;
    const ratio = Math.max(0, Math.min(1, y / h));
    const off = Math.round(ratio * Math.max(0, contentRef.current.length));
    setSelOffset({ start: off, end: off });
    setJumpPct(Math.round(ratio * 100));
  };

  const endJump = () => {
    setSelOffset(undefined);
    setJumpPct(null);
  };

  /** 右侧滑杆：拖动映射到全文 offset。长正文靠内容区滚动一次只能几行，这里一步到位 */
  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => jumpAt(e.nativeEvent.locationY),
      onPanResponderMove: (e) => jumpAt(e.nativeEvent.locationY),
      onPanResponderRelease: endJump,
      onPanResponderTerminate: endJump,
    }),
  ).current;

  const load = useCallback(async () => {
    if (!api || Number.isNaN(projectId) || Number.isNaN(chapterId)) return;
    try {
      const ch = await api.getChapter(projectId, chapterId);
      setChapter(ch);
      setTitle(ch.title ?? '');
      setStatus(ch.status || 'draft');
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
    if (!chapter || (trimmedTitle === (chapter.title ?? '') && content === (chapter.content ?? '') && status === (chapter.status ?? 'draft'))) return;
    setSaving(true);
    try {
      await api.updateChapter(projectId, chapterId, { title: trimmedTitle, content, status });
      bumpChapterVersion(projectId, chapterId);
      setChapter((c) => (c ? { ...c, title: trimmedTitle, content, status, word_count: content.length } : c));
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
      {/* 点空白区收起输入法：正文输入区外的任何点击（标题栏/底栏/卡片留白）都会先收键盘 */}
      <Pressable style={{ paddingHorizontal: SP.l, paddingTop: 10, gap: 12, flex: 1 }} onPress={() => Keyboard.dismiss()}>
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
          {/* 收起键盘按钮放顶栏：键盘弹出时底栏被键盘盖住，放底栏根本点不到 */}
          {kbVisible ? (
            <Pressable
              onPress={() => Keyboard.dismiss()}
              hitSlop={6}
              style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="keypad-outline" size={17} color={C.text2} />
            </Pressable>
          ) : null}
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
            <SelectField
              label="状态"
              value={status || 'draft'}
              options={STATUS_OPTIONS}
              onChange={(v) => {
                setStatus(v);
                // 只切状态不改正文时脏标记也要亮起：闭包里拿新值 v 走同一防抖
                scheduleStats(v);
              }}
            />
            <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
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
                selection={selOffset}
                onSelectionChange={(e) => {
                  const len = Math.max(1, contentRef.current.length);
                  setTrackPct(Math.min(1, e.nativeEvent.selection.start / len));
                }}
                style={{ flex: 1, color: C.text, fontSize: 15 }}
              />
              {/* 快速跳转滑杆：thumb 按光标位置定位；拖动把光标设到对应 offset，EditText 随之滚动 */}
              <View
                style={{ width: 24, alignItems: 'stretch' }}
                onLayout={(e) => {
                  sliderH.current = e.nativeEvent.layout.height;
                }}
                {...sliderPan.panHandlers}
              >
                <View style={{ width: 4, flex: 1, borderRadius: 2, backgroundColor: '#232A3C', alignSelf: 'center', overflow: 'visible' }}>
                  <View
                    style={{
                      position: 'absolute',
                      left: -6,
                      width: 16,
                      height: 22,
                      top: `${(jumpPct != null ? jumpPct / 100 : trackPct) * 100}%`,
                      marginTop: -11,
                      borderRadius: 6,
                      backgroundColor: C.goldSoft,
                      borderWidth: 1,
                      borderColor: 'rgba(229,181,88,0.55)',
                    }}
                  />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 10 }}>
              <Text style={{ color: C.text3, fontSize: 11.5, flex: 1 }}>
                {stats.len} 字
                {stats.dirty ? ' · 有未保存修改' : ''}
                {jumpPct != null ? ` · ${jumpPct}%` : ''}
              </Text>
              {chapter.quality_score ? <Text style={{ color: C.gold, fontSize: 11.5 }}>评分 {chapter.quality_score}</Text> : null}
            </View>
          </View>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
