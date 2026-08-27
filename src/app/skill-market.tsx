import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState, ScreenHeader, SegmentedTabs, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { SkillMarketItem, UserSkillItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { fmtRelative } from '@/lib/format';
import { C, R, SP } from '@/lib/theme';

const SHARE_STATUS_LABEL: Record<string, string> = {
  private: '未共享',
  pending: '审核中',
  approved: '已上架',
  rejected: '被拒绝',
};

/** 技能共享广场：浏览/搜索上架技能 + 一键导入副本；我的自定义技能申请/撤回共享。
 *  管理员审核在网页端，不进 App。 */
export default function SkillMarketScreen() {
  const { api, logout } = useAuth();
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [tab, setTab] = useState('market');
  const [search, setSearch] = useState('');
  const [market, setMarket] = useState<SkillMarketItem[] | null>(null);
  const [mine, setMine] = useState<UserSkillItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(0);

  const load = useCallback(
    async (kw = search) => {
      if (!api) return;
      setLoading(true);
      try {
        const [m, s] = await Promise.all([api.listSkillMarket(kw.trim()), api.getUserSkills()]);
        setMarket(m ?? []);
        setMine((s ?? []).filter((x) => x.skill_type === 'custom'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await logout();
          return;
        }
        setMarket([]);
        toast(friendlyError(e));
      } finally {
        setLoading(false);
      }
    },
    [api, search, logout, toast],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉广场与我的技能（异步请求后 setState）
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doImport = (item: SkillMarketItem) => {
    if (!api) return;
    confirm({
      title: '导入技能副本',
      message: `把「${item.display_name}」复制一份到自己名下？与原作者后续更新完全解耦，导入后可在网页端技能页编辑。`,
      confirmText: '导入',
      onConfirm: () => {
        setBusyId(item.id);
        api
          .importSkillMarket(item.id)
          .then((r) => {
            toast(`已导入为「${r.name}」，聊天会话设置里可加载`);
            load();
          })
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setBusyId(0));
      },
    });
  };

  const doShare = (s: UserSkillItem, action: 'request' | 'withdraw') => {
    if (!api) return;
    const shared = s.share_status === 'approved';
    confirm({
      title: action === 'request' ? '申请共享' : '撤回共享',
      message:
        action === 'request'
          ? `把「${s.display_name || s.name}」提交到技能广场？提交后提示词将公开给管理员审核。`
          : shared
            ? `把「${s.display_name || s.name}」从广场下架并撤回共享？已导入的副本不受影响。`
            : `撤回「${s.display_name || s.name}」的共享申请？`,
      confirmText: action === 'request' ? '申请共享' : '撤回',
      destructive: action === 'withdraw',
      onConfirm: () => {
        setBusyId(s.id);
        api
          .skillShareAction(s.id, action)
          .then((r) => {
            toast(r.share_status === 'pending' ? '已提交，等待管理员审核' : '已撤回，技能回到私有状态');
            load();
          })
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setBusyId(0));
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      {confirmNode}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <ScreenHeader title="技能广场" subtitle="共享聊天技能，一键导入副本" onBack={() => router.back()} />

        <SegmentedTabs
          tabs={[
            { key: 'market', label: '广场' },
            { key: 'mine', label: '我的共享' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'market' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={() => load()}
                placeholder="搜索技能名 / 描述"
                placeholderTextColor="#5A6170"
                keyboardAppearance="dark"
                returnKeyType="search"
                style={{ flex: 1, backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, paddingHorizontal: 13, height: 42, color: C.text, fontSize: 14 }}
              />
              <Pressable onPress={() => load()} disabled={loading} style={{ width: 42, height: 42, borderRadius: R.m, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                {loading ? <ActivityIndicator size="small" color={C.gold} /> : <Ionicons name="search" size={17} color={C.gold} />}
              </Pressable>
            </View>

            {market === null ? (
              <Skeleton count={4} height={110} />
            ) : market.length === 0 ? (
              <EmptyState icon="grid-outline" title={search ? '没有匹配的技能' : '广场还没有上架技能'} sub="在自己的技能页申请共享，管理员审核通过后上架" />
            ) : (
              market.map((item) => (
                <View key={item.id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    {item.category ? <Chip label={item.category} /> : null}
                    {item.is_mine ? <Chip label="我的" fg={C.gold} bg={C.goldSoft} /> : null}
                  </View>
                  {item.description ? (
                    <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.s, padding: 9 }}>
                    <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }} numberOfLines={3}>
                      {item.preview || '（无提示词预览）'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="person-outline" size={12} color={C.text3} />
                    <Text style={{ color: C.text3, fontSize: 11.5, flex: 1 }}>
                      {item.author || '匿名'} · {item.prompt_chars} 字 · {fmtRelative(item.shared_at)}
                    </Text>
                    {item.is_mine ? (
                      <Text style={{ color: C.text3, fontSize: 11.5 }}>自己的技能</Text>
                    ) : (
                      <Pressable
                        onPress={() => doImport(item)}
                        disabled={busyId === item.id}
                        style={{ height: 32, paddingHorizontal: 14, borderRadius: 11, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.4)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}
                      >
                        {busyId === item.id ? <ActivityIndicator size="small" color={C.gold} /> : <Ionicons name="download-outline" size={13} color={C.gold} />}
                        <Text style={{ color: C.gold, fontSize: 12.5, fontWeight: '700' }}>导入副本</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <>
            <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }}>
              自定义技能可申请共享到广场（提示词将公开）；审核与管理在网页端。
            </Text>
            {mine === null ? (
              <Skeleton count={3} height={84} />
            ) : mine.length === 0 ? (
              <EmptyState icon="cube-outline" title="还没有自定义技能" sub="在网页端「技能」页创建自定义技能后，可以在这里申请共享" />
            ) : (
              mine.map((s) => {
                const st = s.share_status ?? 'private';
                const chip =
                  st === 'approved'
                    ? { label: '已上架', fg: C.green, bg: C.greenSoft }
                    : st === 'pending'
                      ? { label: '审核中', fg: C.gold, bg: C.goldSoft }
                      : st === 'rejected'
                        ? { label: '被拒绝', fg: C.seal, bg: C.sealSoft }
                        : { label: '未共享', fg: C.text3, bg: C.card2 };
                return (
                  <View key={s.id} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 13, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                        {s.display_name || s.name}
                      </Text>
                      <Chip label={SHARE_STATUS_LABEL[st] ?? st} fg={chip.fg} bg={chip.bg} bold />
                    </View>
                    {s.description ? (
                      <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>
                        {s.description}
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={() => doShare(s, st === 'private' || st === 'rejected' ? 'request' : 'withdraw')}
                      disabled={busyId === s.id}
                      style={{
                        height: 34,
                        paddingHorizontal: 14,
                        borderRadius: 11,
                        alignSelf: 'flex-start',
                        backgroundColor: st === 'private' || st === 'rejected' ? C.goldSoft : C.sealSoft,
                        borderWidth: 1,
                        borderColor: st === 'private' || st === 'rejected' ? 'rgba(229,181,88,0.4)' : 'rgba(214,90,69,0.4)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 5,
                      }}
                    >
                      {busyId === s.id ? (
                        <ActivityIndicator size="small" color={st === 'private' || st === 'rejected' ? C.gold : C.seal} />
                      ) : (
                        <Ionicons name={st === 'private' || st === 'rejected' ? 'share-social-outline' : 'arrow-undo-outline'} size={13} color={st === 'private' || st === 'rejected' ? C.gold : C.seal} />
                      )}
                      <Text style={{ color: st === 'private' || st === 'rejected' ? C.gold : C.seal, fontSize: 12.5, fontWeight: '700' }}>
                        {st === 'private' || st === 'rejected' ? '申请共享' : st === 'pending' ? '撤回申请' : '下架并撤回'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
