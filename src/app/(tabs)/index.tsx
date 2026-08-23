import { Ionicons } from '@expo/vector-icons';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCard } from '@/components/BookCard';
import { EmptyState, Skeleton } from '@/components/ui';
import type { Book } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

export default function BookshelfScreen() {
  const { api, baseUrl, logout, user } = useAuth();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [archived, setArchived] = useState(false);

  const load = useCallback(
    async (silent = false, showArchived = archived) => {
      if (!api) return;
      if (!silent) setError('');
      try {
        const list = await api.getBooks({ archived: showArchived });
        setBooks(list ?? []);
        setError('');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await logout();
          router.replace('/login');
          return;
        }
        setError(friendlyError(e));
      }
    },
    [api, logout, archived],
  );

  useEffect(() => {
    setBooks(null);
    load();
  }, [load]);

  const switchFilter = (v: boolean) => {
    if (v === archived) return;
    setArchived(v);
    setBooks(null);
    setKeyword('');
  };

  // 从建书页/项目页返回时静默刷新
  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const filtered = useMemo(() => {
    if (!books) return null;
    const k = keyword.trim();
    if (!k) return books;
    return books.filter((b) => b.title.includes(k) || (b.tag ?? '').includes(k));
  }, [books, keyword]);

  const host = useMemo(() => {
    if (!baseUrl) return '';
    try {
      return new URL(baseUrl).host;
    } catch {
      return baseUrl;
    }
  }, [baseUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: SP.l, paddingTop: 10, gap: 14, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>书架</Text>
            <Text style={{ color: C.text3, fontSize: 12 }} numberOfLines={1}>
              {user?.nickname || user?.username || '已登录'} · {host}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/create-book')}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 14,
              backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
              borderWidth: 1,
              borderColor: 'rgba(229,181,88,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="add" size={21} color={C.gold} />
          </Pressable>
          <Link href="/settings" asChild>
            <Pressable
              style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="settings-outline" size={19} color={C.text2} />
            </Pressable>
          </Link>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: C.borderSoft,
            borderRadius: R.m,
            paddingHorizontal: 13,
            height: 42,
          }}
        >
          <Ionicons name="search" size={16} color={C.text3} />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="搜索书名或题材"
            placeholderTextColor="#5A6170"
            style={{ flex: 1, color: C.text, fontSize: 14, paddingVertical: 0 }}
          />
          {keyword ? (
            <Pressable onPress={() => setKeyword('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={C.text3} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {[
            { key: false, label: '连载中' },
            { key: true, label: '已归档' },
          ].map((f) => {
            const on = archived === f.key;
            return (
              <Pressable
                key={String(f.key)}
                onPress={() => switchFilter(f.key)}
                style={{
                  paddingHorizontal: 15,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? C.goldSoft : C.card,
                  borderWidth: 1,
                  borderColor: on ? 'rgba(229,181,88,0.4)' : C.borderSoft,
                }}
              >
                <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {books === null && !error ? (
          <View style={{ flex: 1 }}>
            <Skeleton count={4} height={128} />
          </View>
        ) : error ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <Ionicons name="cloud-offline-outline" size={40} color={C.text3} />
            <Text style={{ color: C.text2, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>{error}</Text>
            <Pressable
              onPress={() => load()}
              style={{ paddingHorizontal: 22, height: 40, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
            >
              <Text style={{ color: C.gold, fontSize: 14, fontWeight: '700' }}>重试</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered ?? []}
            keyExtractor={(b) => String(b.id)}
            contentContainerStyle={{ gap: 12, paddingBottom: 28, flexGrow: filtered?.length ? 0 : 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.gold} colors={[C.gold]} progressBackgroundColor={C.card} onRefresh={onRefresh} />}
            renderItem={({ item }) => (
              <BookCard
                book={item}
                onPress={() =>
                  router.push({
                    pathname: '/project/[id]',
                    params: { id: String(item.id) },
                  })
                }
              />
            )}
            ListEmptyComponent={
              keyword ? (
                <EmptyState icon="search-outline" title="没有匹配的作品" sub="换个关键词试试" />
              ) : archived ? (
                <EmptyState icon="archive-outline" title="没有归档的作品" sub="在网页端归档的书会出现在这里" />
              ) : (
                <EmptyState title="书架还是空的" sub="点右上角 + 创建第一本书，或先在网页端创建" />
              )
            }
            ListFooterComponent={refreshing ? <ActivityIndicator color={C.gold} style={{ marginTop: 10 }} /> : null}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
