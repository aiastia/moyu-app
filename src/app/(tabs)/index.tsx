import { Ionicons } from '@expo/vector-icons';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCard } from '@/components/BookCard';
import { SubmissionsSheet } from '@/components/SubmissionsSheet';
import { EmptyState, SelectField, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { Book } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

type ModeFilter = 'all' | 'one_to_one' | 'one_to_many';
type SubFilter = 'all' | 'submitted' | 'none' | 'archived';

const MODE_CHIPS: { key: ModeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'one_to_one', label: '传统模式' },
  { key: 'one_to_many', label: '细化模式' },
];

export default function BookshelfScreen() {
  const { api, baseUrl, logout, user } = useAuth();
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [shelf, setShelf] = useState<Book[] | null>(null);
  const [archivedBooks, setArchivedBooks] = useState<Book[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [mode, setMode] = useState<ModeFilter>('all');
  const [sub, setSub] = useState<SubFilter>('all');
  // 长按书籍卡片的操作面板 / 投稿记录弹窗
  const [actionBook, setActionBook] = useState<Book | null>(null);
  const [subBook, setSubBook] = useState<Book | null>(null);

  const showArchived = sub === 'archived';
  // 当前视图的列表与加载态：归档视图切回书架（或反之）时另一侧可能还没拉到
  const books = showArchived ? archivedBooks : shelf;
  const loading = books === null && !error;
  const archivedCount = archivedBooks?.length ?? 0;

  const load = useCallback(
    async (silent = false) => {
      if (!api) return;
      if (!silent) setError('');
      try {
        // 在架 + 归档两个列表并行拉（归档计数徽标要常显；切视图不再重新请求，本地切换）
        const [normal, archived] = await Promise.all([
          api.getBooks(),
          api.getBooks({ archived: true }).catch(() => [] as Book[]),
        ]);
        setShelf(normal ?? []);
        setArchivedBooks(archived ?? []);
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
    [api, logout],
  );

  useEffect(() => {
    load();
  }, [load]);

  // 从建书页/项目页返回时静默刷新
  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const switchSub = (v: string) => {
    // 切视图/投稿筛选都不重新请求：两个列表已在本地，归档徽标计数常显
    setSub(v as SubFilter);
  };

  // 投稿筛选计数从当前在架列表实时统计（与归档计数同款展示）
  const submittedCount = useMemo(() => (books ?? []).filter((b) => (b.submissions?.count ?? 0) > 0).length, [books]);
  const unsubmittedCount = useMemo(() => (books ?? []).filter((b) => !(b.submissions?.count ?? 0)).length, [books]);

  const filtered = useMemo(() => {
    if (!books) return null;
    let list = books;
    // 归档视图与书架共用同一套筛选（模式/投稿/搜索），与网页端一致
    if (mode !== 'all') list = list.filter((b) => (b.outline_mode || 'one_to_one') === mode);
    if (sub === 'submitted') list = list.filter((b) => (b.submissions?.count ?? 0) > 0);
    else if (sub === 'none') list = list.filter((b) => !(b.submissions?.count ?? 0));
    const k = keyword.trim().toLowerCase();
    if (k) {
      list = list.filter((b) =>
        [b.title, b.tag, b.genre ?? b.tag, ...(b.submissions?.platforms ?? [])]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(k)),
      );
    }
    return list;
  }, [books, keyword, mode, sub]);

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

  const doArchive = (b: Book) => {
    setActionBook(null);
    confirm({
      title: `归档《${b.title}》`,
      message: '归档后在「已归档」中随时可恢复，不影响书籍数据。',
      confirmText: '归档',
      destructive: true,
      onConfirm: async () => {
        if (!api) return;
        try {
          await api.updateProject(b.id, { status: 'archived' });
          toast('已归档');
          load(true);
        } catch (e) {
          toast(friendlyError(e));
        }
      },
    });
  };

  const doRestore = async (b: Book) => {
    setActionBook(null);
    if (!api) return;
    try {
      await api.updateProject(b.id, { status: 'active' });
      toast('已恢复到书架');
      load(true);
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  const subOptions = [
    { value: 'all', label: '全部投稿状态' },
    { value: 'submitted', label: submittedCount ? `已投稿 (${submittedCount})` : '已投稿' },
    { value: 'none', label: unsubmittedCount ? `未投稿 (${unsubmittedCount})` : '未投稿' },
    { value: 'archived', label: archivedCount ? `已归档 (${archivedCount})` : '已归档' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      {confirmNode}
      <View style={{ paddingHorizontal: SP.l, paddingTop: 10, gap: 14, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>{showArchived ? '已归档' : '书架'}</Text>
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
            placeholder="搜索书名 / 类型 / 投稿平台"
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
          {MODE_CHIPS.map((f) => {
            const on = mode === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setMode(f.key)}
                style={{
                  paddingHorizontal: 13,
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
          <View style={{ flex: 1, minWidth: 130 }}>
            <SelectField value={sub} options={subOptions} onChange={switchSub} placeholder="投稿状态" />
          </View>
        </View>

        {loading ? (
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
                onLongPress={() => setActionBook(item)}
              />
            )}
            ListEmptyComponent={
              keyword ? (
                <EmptyState icon="search-outline" title="没有匹配的作品" sub="换个关键词试试" />
              ) : showArchived ? (
                <EmptyState icon="archive-outline" title="没有归档的作品" sub="长按书架里的书可以归档" />
              ) : sub !== 'all' ? (
                <EmptyState icon="filter-outline" title="没有符合条件的作品" sub="换个筛选条件试试" />
              ) : (
                <EmptyState title="书架还是空的" sub="点右上角 + 创建第一本书，或先在网页端创建" />
              )
            }
            ListFooterComponent={refreshing ? <ActivityIndicator color={C.gold} style={{ marginTop: 10 }} /> : null}
          />
        )}
      </View>

      {/* 长按书籍卡片：投稿记录 / 归档（恢复） */}
      <SheetModal visible={actionBook !== null} onClose={() => setActionBook(null)} title={actionBook ? `《${actionBook.title}》` : ''}>
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => {
              setSubBook(actionBook);
              setActionBook(null);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 14,
              paddingHorizontal: 14,
              borderRadius: R.m,
              backgroundColor: pressed ? C.card2 : 'transparent',
            })}
          >
            <Ionicons name="mail-unread-outline" size={19} color={C.gold} />
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>投稿记录</Text>
          </Pressable>
          {actionBook && actionBook.status === 'archived' ? (
            <Pressable
              onPress={() => actionBook && doRestore(actionBook)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: R.m,
                backgroundColor: pressed ? C.card2 : 'transparent',
              })}
            >
              <Ionicons name="refresh-outline" size={19} color={C.gold} />
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>恢复到书架</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => actionBook && doArchive(actionBook)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: R.m,
                backgroundColor: pressed ? C.card2 : 'transparent',
              })}
            >
              <Ionicons name="archive-outline" size={19} color={C.seal} />
              <Text style={{ color: C.seal, fontSize: 15, fontWeight: '600' }}>归档</Text>
            </Pressable>
          )}
        </View>
      </SheetModal>

      {subBook ? (
        <SubmissionsSheet
          visible
          onClose={() => setSubBook(null)}
          api={api}
          projectId={subBook.id}
          projectTitle={subBook.title}
          onSaved={() => load(true)}
        />
      ) : null}
    </SafeAreaView>
  );
}
