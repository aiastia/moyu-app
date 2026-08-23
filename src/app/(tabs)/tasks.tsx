import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState, ProgressBar, ScreenHeader, Skeleton } from '@/components/ui';
import type { TaskItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { fmtRelative, STATUS_LABEL } from '@/lib/format';
import { C, R, SP } from '@/lib/theme';

const FILTERS = [
  { key: '', label: '全部' },
  { key: 'running', label: '运行中' },
  { key: 'pending', label: '排队中' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '失败' },
] as const;

function statusStyle(status: string): { fg: string; bg: string } {
  switch (status) {
    case 'running':
      return { fg: C.blue, bg: C.blueSoft };
    case 'pending':
      return { fg: C.text2, bg: C.card2 };
    case 'completed':
      return { fg: C.green, bg: C.greenSoft };
    case 'failed':
      return { fg: C.seal, bg: C.sealSoft };
    default:
      return { fg: C.text3, bg: C.card2 };
  }
}

function TaskCard({ task }: { task: TaskItem }) {
  const s = statusStyle(task.status);
  const active = task.status === 'running' || task.status === 'pending';
  return (
    <Pressable
      onPress={task.project_id ? () => router.push({ pathname: '/project/[id]', params: { id: String(task.project_id) } }) : undefined}
      style={({ pressed }) => ({
        backgroundColor: pressed ? C.card2 : C.card,
        borderRadius: R.l,
        borderWidth: 1,
        borderColor: C.borderSoft,
        padding: 14,
        gap: 9,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {active ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: task.status === 'running' ? C.blue : C.text3 }} /> : null}
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
            {task.title || task.task_type}
          </Text>
          <Chip label={STATUS_LABEL[task.status] ?? task.status} fg={s.fg} bg={s.bg} bold />
        </View>
      </View>
      {task.status_message ? (
        <Text style={{ color: C.text2, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
          {task.status_message}
        </Text>
      ) : null}
      {task.status === 'failed' && task.error ? (
        <Text style={{ color: C.seal, fontSize: 11.5, lineHeight: 16 }} numberOfLines={2}>
          {task.error}
        </Text>
      ) : null}
      {active ? <ProgressBar pct={task.progress ?? 0} color={C.blue} /> : task.status === 'completed' ? <ProgressBar pct={100} color={C.green} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text3, fontSize: 11, flex: 1 }} numberOfLines={1}>
          {task.created_at ? fmtRelative(task.created_at) : ''}
          {active && task.progress ? ` · ${task.progress}%` : ''}
        </Text>
        {task.project_id ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ color: C.gold, fontSize: 11 }}>查看项目</Text>
            <Ionicons name="chevron-forward" size={11} color={C.gold} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function TasksScreen() {
  const { api, logout } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [filter, setFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!api) return;
      if (!silent) setError('');
      try {
        const list = await api.getTasks(filter ? { status: filter } : undefined);
        setTasks(list ?? []);
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
    [api, filter, logout],
  );

  useEffect(() => {
    setTasks(null);
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(true);
      timer.current = setInterval(() => load(true), 10000);
      return () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: SP.l, paddingTop: 10, gap: 14, flex: 1 }}>
        <ScreenHeader title="任务" subtitle="AI 生成任务的实时进度" />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  paddingHorizontal: 14,
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
        </ScrollView>

        {tasks === null && !error ? (
          <View style={{ flex: 1 }}>
            <Skeleton count={4} height={110} />
          </View>
        ) : error && !tasks ? (
          <EmptyState icon="cloud-offline-outline" title="任务加载失败" sub={error} />
        ) : (
          <ScrollView
            contentContainerStyle={{ gap: 12, paddingBottom: 28 }}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.gold} colors={[C.gold]} onRefresh={onRefresh} />}
          >
            {tasks?.length ? (
              tasks.map((t) => <TaskCard key={t.id} task={t} />)
            ) : (
              <EmptyState icon="flash-outline" title="暂无任务" sub="在网页端发起章节生成、润色等操作后，可以在这里盯进度" />
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
