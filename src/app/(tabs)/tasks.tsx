import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState, ProgressBar, ScreenHeader, SheetModal, Skeleton, useToast } from '@/components/ui';
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

function TaskCard({ task, onPress, onCancel, onRetry }: { task: TaskItem; onPress: () => void; onCancel: (t: TaskItem) => void; onRetry: (t: TaskItem) => void }) {
  const s = statusStyle(task.status);
  const active = task.status === 'running' || task.status === 'pending';
  return (
    <Pressable
      onPress={onPress}
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
      {task.status === 'running' ? <ProgressBar pct={task.progress ?? 0} color={C.blue} /> : task.status === 'pending' ? <ProgressBar pct={task.progress ?? 0} color={C.text3} /> : task.status === 'completed' ? <ProgressBar pct={100} color={C.green} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text3, fontSize: 11, flex: 1 }} numberOfLines={1}>
          {task.created_at ? fmtRelative(task.created_at) : ''}
          {active && task.progress ? ` · ${task.progress}%` : ''}
        </Text>
        {active && !task.cancel_requested ? (
          <Pressable
            onPress={() => onCancel(task)}
            hitSlop={6}
            style={{ paddingHorizontal: 11, height: 30, borderRadius: 10, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600' }}>取消</Text>
          </Pressable>
        ) : null}
        {task.status === 'failed' ? (
          <Pressable
            onPress={() => onRetry(task)}
            hitSlop={6}
            style={{ paddingHorizontal: 11, height: 30, borderRadius: 10, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.4)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>重试</Text>
          </Pressable>
        ) : null}
        <Ionicons name="chevron-forward" size={13} color={C.text3} />
      </View>
    </Pressable>
  );
}

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Text style={{ color: C.text3, fontSize: 12, width: 60, paddingTop: 2 }}>
        {label}
      </Text>
      <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 19, flex: 1 }}>{value}</Text>
    </View>
  );
}

function TaskDetailSheet({
  task,
  onClose,
  onCancel,
  onRetry,
  onDelete,
}: {
  task: TaskItem | null;
  onClose: () => void;
  onCancel: (t: TaskItem) => void;
  onRetry: (t: TaskItem) => void;
  onDelete: (t: TaskItem) => void;
}) {
  if (!task) return null;
  const s = statusStyle(task.status);
  const active = task.status === 'running' || task.status === 'pending';
  return (
    <SheetModal visible onClose={onClose} title={`任务 #${task.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={2}>
          {task.title || task.task_type}
        </Text>
        <Chip label={STATUS_LABEL[task.status] ?? task.status} fg={s.fg} bg={s.bg} bold />
      </View>

      {active ? (
        <View style={{ gap: 7 }}>
          <ProgressBar pct={task.progress ?? 0} color={task.status === 'running' ? C.blue : C.text3} />
          <Text style={{ color: C.text3, fontSize: 11 }}>
            {task.status === 'running' ? `${task.progress ?? 0}%` : task.queue_position ? `排队中 · 第 ${task.queue_position} 位` : '排队中'}
          </Text>
        </View>
      ) : null}

      <InfoLine label="阶段" value={task.stage} />
      <InfoLine label="状态说明" value={task.status_message} />
      {task.error ? (
        <View style={{ backgroundColor: C.sealSoft, borderRadius: 10, padding: 11, gap: 4 }}>
          <Text style={{ color: C.seal, fontSize: 11, fontWeight: '700' }}>错误信息</Text>
          <Text style={{ color: C.seal, fontSize: 12, lineHeight: 18 }}>{task.error}</Text>
        </View>
      ) : null}
      <InfoLine label="创建" value={task.created_at ? fmtRelative(task.created_at) : undefined} />
      <InfoLine label="开始" value={task.started_at ? fmtRelative(task.started_at) : undefined} />
      <InfoLine label="完成" value={task.completed_at ? fmtRelative(task.completed_at) : undefined} />
      <InfoLine label="重试次数" value={task.retry_count != null && task.max_retries != null ? `${task.retry_count}/${task.max_retries}` : undefined} />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
        {active && !task.cancel_requested ? (
          <Pressable
            onPress={() => onCancel(task)}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>取消任务</Text>
          </Pressable>
        ) : null}
        {task.status === 'failed' ? (
          <Pressable
            onPress={() => onRetry(task)}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.goldSoft, borderWidth: 1, borderColor: 'rgba(229,181,88,0.4)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>重试</Text>
          </Pressable>
        ) : null}
        {task.project_id ? (
          <Pressable
            onPress={() => {
              onClose();
              router.push({ pathname: '/project/[id]', params: { id: String(task.project_id) } });
            }}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>去项目</Text>
          </Pressable>
        ) : null}
        {!active ? (
          <Pressable
            onPress={() => onDelete(task)}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.seal, fontSize: 13, fontWeight: '700' }}>删除记录</Text>
          </Pressable>
        ) : null}
      </View>
    </SheetModal>
  );
}

export default function TasksScreen() {
  const { api, logout } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [filter, setFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, toastNode] = useToast();
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!api) return;
      if (!silent) setError('');
      try {
        const list = await api.getTasks(filter ? { status: filter } : undefined);
        setTasks(list ?? []);
        // 详情弹层打开时同步刷新其中的任务
        setDetailTask((prev) => (prev ? (list ?? []).find((t) => t.id === prev.id) ?? prev : null));
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

  const doCancel = (t: TaskItem) => {
    if (!api) return;
    Alert.alert('取消任务', `确定取消「${t.title || t.task_type}」？正在进行的 AI 调用会跑完当前步骤后停止。`, [
      { text: '返回', style: 'cancel' },
      {
        text: '取消任务',
        style: 'destructive',
        onPress: () =>
          api
            .cancelTask(t.id)
            .then(() => {
              toast('已请求取消');
              load(true);
            })
            .catch((e) => toast(friendlyError(e))),
      },
    ]);
  };

  const doRetry = (t: TaskItem) => {
    if (!api) return;
    api
      .retryTask(t.id)
      .then((r) => {
        toast(`已重新提交（新任务 #${r.task_id}）`);
        load(true);
      })
      .catch((e) => toast(friendlyError(e)));
  };

  const doDelete = (t: TaskItem) => {
    if (!api) return;
    Alert.alert('删除记录', '只删除这条任务记录，不影响已生成的正文。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () =>
          api
            .deleteTask(t.id)
            .then(() => load(true))
            .catch((e) => toast(friendlyError(e))),
      },
    ]);
  };

  const doClearCompleted = () => {
    if (!api) return;
    Alert.alert('清空已完成', '删除所有已完成/已取消/失败的任务记录？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () =>
          api
            .clearCompletedTasks()
            .then((r) => {
              toast(`已清理 ${r.deleted} 条`);
              load(true);
            })
            .catch((e) => toast(friendlyError(e))),
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      <TaskDetailSheet task={detailTask} onClose={() => setDetailTask(null)} onCancel={doCancel} onRetry={doRetry} onDelete={doDelete} />
      <View style={{ paddingHorizontal: SP.l, paddingTop: 10, gap: 14, flex: 1 }}>
        <ScreenHeader
          title="任务"
          subtitle="AI 生成任务的实时进度"
          right={
            <Pressable
              onPress={doClearCompleted}
              hitSlop={6}
              style={{ paddingHorizontal: 13, height: 34, borderRadius: 11, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600' }}>清空已完成</Text>
            </Pressable>
          }
        />

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
              tasks.map((t) => (
                <TaskCard key={t.id} task={t} onPress={() => setDetailTask(t)} onCancel={doCancel} onRetry={doRetry} />
              ))
            ) : (
              <EmptyState icon="flash-outline" title="暂无任务" sub="在网页端发起章节生成、润色等操作后，可以在这里盯进度" />
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
