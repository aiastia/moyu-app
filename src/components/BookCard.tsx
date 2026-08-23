import { Pressable, Text, View } from 'react-native';

import { CoverArt } from '@/components/CoverArt';
import { Chip, ProgressBar } from '@/components/ui';
import type { Book } from '@/lib/api';
import { fmtPercent, fmtRelative, fmtWords, STORY_KIND_LABEL } from '@/lib/format';
import { C, R } from '@/lib/theme';

export function BookCard({ book, onPress }: { book: Book; onPress: () => void }) {
  const pct = fmtPercent(book.current_word_count, book.target_word_count);
  const kind = STORY_KIND_LABEL[book.story_kind] ?? '作品';
  return (
    <Pressable
      onPress={onPress}
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
      <CoverArt projectId={book.id} title={book.title} />
      <View style={{ flex: 1, gap: 7 }}>
        <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
          {book.title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {book.tag ? <Chip label={book.tag} fg={C.gold} bg={C.goldSoft} bold /> : null}
          <Chip label={kind} fg={book.story_kind === 'short' ? C.purple : C.blue} bg={book.story_kind === 'short' ? C.purpleSoft : C.blueSoft} />
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
          <Text style={{ color: C.text3, fontSize: 11 }}>{book.updated ? `更新于 ${fmtRelative(book.updated)}` : ''}</Text>
          <Text style={{ color: C.gold, fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
        </View>
      </View>
    </Pressable>
  );
}
