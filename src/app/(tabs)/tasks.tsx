import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState, ProgressBar, ScreenHeader, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
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

/** memo：页面每 10s 轮询刷新列表，无变化的卡片跳过重渲（回调必须传稳定引用）
 *  child=子任务：缩进 + 左侧 hairline 连接线，嵌套在父任务下（一键连写轮次的归属可见化） */
const TaskCard = memo(function TaskCard({ task, child, onOpen, onCancel, onRetry }: { task: TaskItem; child?: boolean; onOpen: (t: TaskItem) => void; onCancel: (t: TaskItem) => void; onRetry: (t: TaskItem) => void }) {
  const s = statusStyle(task.status);
  const active = task.status === 'running' || task.status === 'pending';
  return (
    <Pressable
      onPress={() => onOpen(task)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? C.card2 : C.card,
        borderRadius: R.l,
        borderWidth: 1,
        borderColor: child ? 'transparent' : C.borderSoft,
        marginLeft: child ? 18 : 0,
        borderLeftWidth: child ? 2 : 1,
        borderLeftColor: child ? 'rgba(229,181,88,0.35)' : C.borderSoft,
        padding: child ? 11 : 14,
        gap: 9,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {active ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: task.status === 'running' ? C.blue : C.text3 }} /> : null}
          {child ? <Ionicons name="arrow-redo-outline" size={12} color={C.text3} /> : null}
          <Text style={{ color: C.text, fontSize: child ? 13 : 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
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
});

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
      <InfoLine label="归属" value={task.parent_task_id ? `任务 #${task.parent_task_id} 的子任务` : undefined} />
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
  const [confirm, confirmNode] = useConfirm();
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

  /** 按 parent_task_id 分组成展示行：子任务紧跟父任务之后缩进渲染
   *  （一键连写等编排任务的轮次子任务归属可见化）。父行不在当前列表
   *  （被清理/状态筛选滤掉）时子行回落为根级平铺，不丢行——与网页端一致。 */
  const rows = useMemo(() => {
    const list = tasks ?? [];
    const byId = new Map(list.map((t) => [t.id, t]));
    const childrenOf = new Map<number, TaskItem[]>();
    for (const t of list) {
      if (t.parent_task_id && byId.has(t.parent_task_id)) {
        childrenOf.set(t.parent_task_id, [...(childrenOf.get(t.parent_task_id) ?? []), t]);
      }
    }
    const out: { task: TaskItem; child: boolean }[] = [];
    for (const t of list) {
      if (t.parent_task_id && byId.has(t.parent_task_id)) continue;
      out.push({ task: t, child: false });
      for (const c of childrenOf.get(t.id) ?? []) out.push({ task: c, child: true });
    }
    return out;
  }, [tasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const doCancel = useCallback(
    (t: TaskItem) => {
      if (!api) return;
      confirm({
        title: '取消任务',
        message: `确定取消「${t.title || t.task_type}」？正在进行的 AI 调用会跑完当前步骤后停止。`,
        confirmText: '取消任务',
        destructive: true,
        onConfirm: () =>
          api
            .cancelTask(t.id)
            .then(() => {
              toast('已请求取消');
              load(true);
            })
            .catch((e) => toast(friendlyError(e))),
      });
    },
    [api, confirm, load, toast],
  );

  const doRetry = useCallback(
    (t: TaskItem) => {
      if (!api) return;
      api
        .retryTask(t.id)
        .then((r) => {
          toast(`已重新提交（新任务 #${r.task_id}）`);
          load(true);
        })
        .catch((e) => toast(friendlyError(e)));
    },
    [api, load, toast],
  );

  const doDelete = useCallback(
    (t: TaskItem) => {
      if (!api) return;
      confirm({
        title: '删除记录',
        message: '只删除这条任务记录，不影响已生成的正文。',
        confirmText: '删除',
        destructive: true,
        onConfirm: () =>
          api
            .deleteTask(t.id)
            .then(() => load(true))
            .catch((e) => toast(friendlyError(e))),
      });
    },
    [api, confirm, load, toast],
  );

  const doClearCompleted = useCallback(() => {
    if (!api) return;
    confirm({
      title: '清空已完成',
      message: '删除所有已完成/已取消/失败的任务记录？',
      confirmText: '清空',
      destructive: true,
      onConfirm: () =>
        api
          .clearCompletedTasks()
          .then((r) => {
            toast(`已清理 ${r.deleted} 条`);
            load(true);
          })
          .catch((e) => toast(friendlyError(e))),
    });
  }, [api, confirm, load, toast]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      {confirmNode}
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

        {/* 筛选条必须是普通 View：RN ScrollView 自带 flexGrow:1，若这里用横向 ScrollView，
            会和下方任务列表平分页面剩余空间，筛选条被撑到数百像素高、把卡片推到屏幕中部
            （2026-08-24 模拟器原生层实测：横向 ScrollView 内容 84px 却占 586px 高，
            此前 v1.4.2/v1.6.0 两次"短内容居中"误诊的真凶）。 */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
        </View>

        {tasks === null && !error ? (
          <View style={{ flex: 1 }}>
            <Skeleton count={4} height={110} />
          </View>
        ) : error && !tasks ? (
          <EmptyState icon="cloud-offline-outline" title="任务加载失败" sub={error} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => String(r.task.id)}
            renderItem={({ item }) => <TaskCard task={item.task} child={item.child} onOpen={setDetailTask} onCancel={doCancel} onRetry={doRetry} />}
            contentContainerStyle={{ flexGrow: tasks?.length ? 0 : 1, justifyContent: tasks?.length ? undefined : 'center', gap: 12, paddingBottom: 28 }}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.gold} colors={[C.gold]} onRefresh={onRefresh} />}
            ListEmptyComponent={<EmptyState icon="flash-outline" title="暂无任务" sub="在网页端发起章节生成、润色等操作后，可以在这里盯进度" />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
