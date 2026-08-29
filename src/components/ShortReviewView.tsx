import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import type { ShortReview, ShortReviewIssue } from '@/lib/api';
import { C, R } from '@/lib/theme';

/** 短篇审稿三标准的单条意见块（severity: high=严重/mid=中等/low=轻微） */
export function ReviewIssue({ label, data }: { label: string; data?: ShortReviewIssue | null }) {
  if (!data || (!data.issue && !data.suggestion)) return null;
  const sevColor = data.severity === 'high' ? C.seal : data.severity === 'mid' ? C.gold : C.text3;
  return (
    <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        {data.mode ? <Chip label={data.mode} fg={C.blue} bg={C.blueSoft} /> : null}
        <View style={{ flex: 1 }} />
        {data.severity ? (
          <Text style={{ color: sevColor, fontSize: 10.5, fontWeight: '700' }}>{data.severity === 'high' ? '严重' : data.severity === 'mid' ? '中等' : '轻微'}</Text>
        ) : null}
      </View>
      {data.issue ? <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 19 }}>{data.issue}</Text> : null}
      {data.suggestion ? <Text style={{ color: C.gold, fontSize: 12, lineHeight: 18 }}>改法：{data.suggestion}</Text> : null}
    </View>
  );
}

/** 短篇审稿结果完整渲染（三标准 + 逐段意见 + 总评；单章与全书审稿共用） */
export function ShortReviewView({ review }: { review: ShortReview }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Chip
          label={review.verdict === 'pass' ? '✓ 过稿' : '建议修改'}
          fg={review.verdict === 'pass' ? C.green : C.gold}
          bg={review.verdict === 'pass' ? C.greenSoft : C.goldSoft}
          bold
        />
        {review.overall_score != null ? (
          <Text style={{ color: C.gold, fontSize: 14, fontWeight: '800' }}>{review.overall_score} / 10 分</Text>
        ) : null}
      </View>
      <ReviewIssue label="前三行留人" data={review.three_lines} />
      <ReviewIssue label="信息差账本" data={review.information_gap} />
      <ReviewIssue label="结尾回甘" data={review.ending} />
      {(review.segment_notes ?? []).length > 0 ? (
        <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11, gap: 8 }}>
          <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>逐段意见</Text>
          {(review.segment_notes ?? []).map((n, i) => (
            <View key={i} style={{ gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="document-text-outline" size={11} color={C.gold} />
                <Text style={{ color: C.gold, fontSize: 11.5, fontWeight: '700' }}>第 {n.seg_index ?? i + 1} 段</Text>
              </View>
              {n.issue ? <Text style={{ color: C.text, fontSize: 12, lineHeight: 18 }}>{n.issue}</Text> : null}
              {n.suggestion ? <Text style={{ color: C.gold, fontSize: 11.5, lineHeight: 17 }}>改法：{n.suggestion}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      {review.summary ? (
        <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11 }}>
          <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 20 }}>{review.summary}</Text>
        </View>
      ) : null}
    </View>
  );
}
