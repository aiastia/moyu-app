import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, ProgressBar, SheetModal, useToast } from '@/components/ui';
import type { ChapterAnalysis } from '@/lib/api';
import { ANALYSIS_SCORE_LABEL, ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

/** 8 维评分里除总分/理由外的展示维度（顺序固定） */
const SCORE_DIMS = ['pacing', 'ai_flavor', 'coherence_logic', 'writing_quality', 'character_dialogue', 'world_consistency', 'commercial_appeal'];

/** 一致性问题条目的宽容渲染：字符串直接显示，对象取常见字段 */
function issueText(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    for (const key of ['description', 'issue', 'content', 'message', 'text']) {
      if (typeof o[key] === 'string' && o[key]) return o[key] as string;
    }
    try {
      return JSON.stringify(item);
    } catch {
      return '';
    }
  }
  return '';
}

/** 章节剧情分析弹窗：8 维评分卡 + 一致性问题 + 改进建议。
 *  没有分析过时显示「生成分析」入口（异步任务）。 */
export function AnalysisSheet({
  projectId,
  chapterNumber,
  chapterId,
  visible,
  onClose,
}: {
  projectId: number;
  chapterNumber: number;
  chapterId: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { api } = useAuth();
  const [data, setData] = useState<ChapterAnalysis | 'empty' | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, toastNode] = useToast();

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const a = await api.getChapterAnalysis(projectId, chapterNumber);
      setData(a);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setData('empty');
      } else {
        setData(null);
        toast(friendlyError(e));
      }
    } finally {
      setLoading(false);
    }
  }, [api, projectId, chapterNumber, toast]);

  useEffect(() => {
    if (visible) {
      setData(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开弹窗时拉数据
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, chapterNumber]);

  const submit = () => {
    if (!api || submitting) return;
    setSubmitting(true);
    api
      .analyzeChapterAsync(projectId, chapterId)
      .then(() => {
        toast('已提交分析任务，完成后重新打开本弹窗查看');
        onClose();
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setSubmitting(false));
  };

  const scores = data && data !== 'empty' ? (data.quality_scores ?? {}) : {};
  const overall = typeof scores.overall === 'number' ? scores.overall : Number(scores.overall);
  const justification = typeof scores.score_justification === 'string' ? scores.score_justification : '';
  const suggestions = data && data !== 'empty' && Array.isArray(data.suggestions) ? data.suggestions.filter((s) => typeof s === 'string' && s) : [];
  const issues = data && data !== 'empty' && Array.isArray(data.consistency_issues) ? data.consistency_issues.map(issueText).filter(Boolean) : [];

  const overallColor = Number.isFinite(overall) ? (overall >= 8 ? C.green : overall >= 6.5 ? C.gold : C.seal) : C.text3;

  return (
    <>
      {toastNode}
      <SheetModal visible={visible} onClose={onClose} title={`第 ${chapterNumber} 章 · 剧情分析`}>
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 30 }}>
            <ActivityIndicator color={C.gold} />
          </View>
        ) : data === 'empty' ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
            <Ionicons name="analytics-outline" size={32} color={C.text3} />
            <Text style={{ color: C.text2, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
              本章还没有做过剧情分析。提交后 AI 会评分并检查与已有设定的一致性。
            </Text>
            <Pressable onPress={submit} disabled={submitting} style={{ height: 44, paddingHorizontal: 26, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={15} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{submitting ? '提交中…' : '生成分析'}</Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            {/* 评分卡 */}
            <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 11 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ alignItems: 'center', justifyContent: 'center', width: 62, height: 62, borderRadius: 20, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: overallColor, fontSize: 21, fontWeight: '800' }}>{Number.isFinite(overall) ? overall.toFixed(1) : '—'}</Text>
                  <Text style={{ color: C.text3, fontSize: 9.5 }}>总分</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {data.plot_stage ? <Chip label={`阶段 · ${data.plot_stage}`} fg={C.gold} bg={C.goldSoft} maxWidth="78%" multiline /> : null}
                    {data.pacing ? <Chip label={`节奏 · ${data.pacing}`} maxWidth="78%" multiline /> : null}
                  </View>
                  {typeof data.dialogue_ratio === 'number' ? (
                    <Text style={{ color: C.text3, fontSize: 11 }}>
                      对白 {Math.round(data.dialogue_ratio * 100)}% · 描写 {typeof data.description_ratio === 'number' ? Math.round(data.description_ratio * 100) : '—'}%
                    </Text>
                  ) : null}
                </View>
              </View>
              {SCORE_DIMS.map((key) => {
                const v = Number(scores[key]);
                if (!Number.isFinite(v)) return null;
                return (
                  <View key={key} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.text2, fontSize: 11.5 }}>{ANALYSIS_SCORE_LABEL[key] ?? key}</Text>
                      <Text style={{ color: C.text, fontSize: 11.5, fontWeight: '700' }}>{v.toFixed(1)}</Text>
                    </View>
                    <ProgressBar pct={v * 10} height={3} color={v >= 8 ? C.green : v >= 6.5 ? C.gold : C.seal} />
                  </View>
                );
              })}
            </View>

            {justification ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 6 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>评分理由</Text>
                <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 20 }}>{justification}</Text>
              </View>
            ) : null}

            {issues.length > 0 ? (
              <View style={{ backgroundColor: 'rgba(214,90,69,0.08)', borderWidth: 1, borderColor: 'rgba(214,90,69,0.3)', borderRadius: R.m, padding: 13, gap: 8 }}>
                <Text style={{ color: C.seal, fontSize: 12, fontWeight: '700' }}>一致性问题（{issues.length}）</Text>
                {issues.map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ color: C.seal, fontSize: 12.5, lineHeight: 19 }}>▪</Text>
                    <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 19, flex: 1 }}>{s}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {suggestions.length > 0 ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 8 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>改进建议（{suggestions.length}）</Text>
                {suggestions.map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ color: C.gold, fontSize: 12.5, lineHeight: 19 }}>▪</Text>
                    <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 19, flex: 1 }}>{s}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {!justification && issues.length === 0 && suggestions.length === 0 ? (
              <Text style={{ color: C.text3, fontSize: 12.5, textAlign: 'center', paddingVertical: 10 }}>这份分析没有文字结论</Text>
            ) : null}
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
            <Text style={{ color: C.text3, fontSize: 13 }}>加载失败</Text>
            <Pressable onPress={load} style={{ paddingHorizontal: 20, height: 38, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '700' }}>重试</Text>
            </Pressable>
          </View>
        )}
      </SheetModal>
    </>
  );
}
