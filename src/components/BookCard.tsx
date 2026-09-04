import { Pressable, Text, View } from 'react-native';

import { CoverArt } from '@/components/CoverArt';
import { Chip, ProgressBar } from '@/components/ui';
import type { Book } from '@/lib/api';
import { BOOK_STATUS_LABEL, fmtPercent, fmtRelative, fmtWords, normalizeBookStatus, STORY_KIND_LABEL } from '@/lib/format';
import { C, R } from '@/lib/theme';

/** 连载状态徽章配色：完结绿/暂更金/太监红（连载中是默认态不显示，与网页端一致） */
const STATUS_CHIP: Record<string, { fg: string; bg: string }> = {
  completed: { fg: C.green, bg: C.greenSoft },
  paused: { fg: C.gold, bg: C.goldSoft },
  abandoned: { fg: C.seal, bg: C.sealSoft },
};

export function BookCard({
  book,
  onPress,
  onLongPress,
}: {
  book: Book;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const pct = fmtPercent(book.current_word_count, book.target_word_count);
  const kind = STORY_KIND_LABEL[book.story_kind] ?? '作品';
  const isShortKind = book.story_kind === 'short' || book.story_kind === 'single';
  const subCount = book.submissions?.count ?? 0;
  // 归档书按归档前状态显示徽章（旧归档数据无暂存值兜底连载中=不显示）
  const serialStatus = book.status === 'archived' ? normalizeBookStatus(book.pre_archive_status) : normalizeBookStatus(book.status);
  const statusChip = STATUS_CHIP[serialStatus];
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 14,
        backgroundColor: pressed ? C.card2 : C.card,
        borderRadius: R.l,
        borderWidth: 1,
        borderColor: C.borderSoft,
        padding: 14,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      {/* 列表用 320px 缩略图省流量；外链封面（book.cover 为 http(s)）直连 */}
      <CoverArt projectId={book.id} title={book.title} remoteUrl={book.cover} thumb />
      <View style={{ flex: 1, gap: 7 }}>
        <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
          {book.title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {book.tag ? <Chip label={book.tag} fg={C.gold} bg={C.goldSoft} bold /> : null}
          <Chip label={kind} fg={isShortKind ? C.purple : C.blue} bg={isShortKind ? C.purpleSoft : C.blueSoft} />
          {book.outline_mode === 'one_to_many' ? <Chip label="细化模式" fg={C.green} bg={C.greenSoft} /> : null}
          {subCount > 0 ? <Chip label={`已投 ${subCount}`} fg={C.gold} bg={C.goldSoft} /> : null}
          {statusChip && serialStatus !== 'active' ? (
            <Chip
              label={book.status === 'archived' ? `归档前·${BOOK_STATUS_LABEL[serialStatus]}` : BOOK_STATUS_LABEL[serialStatus]}
              fg={statusChip.fg}
              bg={statusChip.bg}
            />
          ) : null}
          {book.status === 'archived' ? <Chip label="已归档" fg={C.text3} bg={C.card2} /> : null}
        </View>
        {book.desc ? (
          <Text style={{ color: C.text2, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
            {book.desc}
          </Text>
        ) : null}
        <Text style={{ color: C.text3, fontSize: 11 }}>
          已写 {book.written_chapter_count ?? 0}/{book.chapter_count ?? 0} 章 · {fmtWords(book.current_word_count)}
          {book.target_word_count ? ` / ${fmtWords(book.target_word_count)}目标` : ''}
        </Text>
        <ProgressBar pct={pct} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: C.text3, fontSize: 11 }} numberOfLines={1}>
            {subCount > 0 && book.submissions?.platforms?.length
              ? `已投 ${book.submissions.platforms.join('、')} · `
              : ''}
            {book.updated ? `更新于 ${fmtRelative(book.updated)}` : ''}
          </Text>
          <Text style={{ color: C.gold, fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
        </View>
      </View>
    </Pressable>
  );
}
