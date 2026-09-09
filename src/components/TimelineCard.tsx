import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Chip, FieldLabel, Input, SelectField, SheetModal, useConfirm, useToast } from '@/components/ui';
import type { TimelineEvent, TimelineRes } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

/** 事件类型（与后端 TimelineEvent.event_type 一致） */
const EVENT_TYPE_OPTIONS = [
  { value: 'backstory', label: '前史（故事开始前）' },
  { value: 'plot', label: '剧情中（故事进行时）' },
  { value: 'world', label: '世界观历史' },
];
const EVENT_TYPE_LABEL: Record<string, string> = { backstory: '前史', plot: '剧情中', world: '世界观' };

/** 事件来源权威序：manual > outline > backfill > analysis（AI 猜的灰色，一眼可辨） */
const SOURCE_META: Record<string, { label: string; fg: string; bg: string }> = {
  manual: { label: '✦手工', fg: C.gold, bg: C.goldSoft },
  outline: { label: '大纲', fg: C.blue, bg: C.blueSoft },
  backfill: { label: '回填', fg: C.green, bg: C.greenSoft },
  analysis: { label: 'AI提取', fg: C.text2, bg: C.card2 },
};

/** 事件编辑表单（字符串形态，保存时再转后端结构） */
type EventForm = {
  name: string;
  event_type: string;
  time_display: string;
  event_day: string;
  related: string;
  chapter: string;
  description: string;
};

const EMPTY_FORM: EventForm = { name: '', event_type: 'backstory', time_display: '', event_day: '', related: '', chapter: '', description: '' };

function toForm(ev: TimelineEvent): EventForm {
  return {
    name: ev.name,
    event_type: ev.event_type || 'backstory',
    time_display: ev.time_display || '',
    event_day: ev.event_day == null ? '' : String(ev.event_day),
    related: (ev.related_characters || []).join('、'),
    chapter: ev.chapter_number == null ? '' : String(ev.chapter_number),
    description: ev.description || '',
  };
}

/** event_day → 人读（第1章第1天=0；负数=故事开始前） */
function dayLabel(ev: TimelineEvent): string {
  if (ev.time_display) return ev.time_display;
  if (ev.event_day == null) return '时间未知';
  return ev.event_day >= 0 ? `故事第${ev.event_day + 1}天` : `故事开始前${-ev.event_day}天`;
}

/** 事件行 */
function EventRow({ ev, onPress, onLongPress }: { ev: TimelineEvent; onPress: () => void; onLongPress: () => void }) {
  const src = SOURCE_META[ev.source] ?? { label: ev.source || '?', fg: C.text2, bg: C.card2 };
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 12, gap: 5 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {ev.name}
        </Text>
        <Chip label={EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type} />
        <Chip label={src.label} fg={src.fg} bg={src.bg} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="time-outline" size={11} color={C.text3} />
          <Text style={{ color: C.text3, fontSize: 11 }}>{dayLabel(ev)}</Text>
        </View>
        {ev.chapter_number ? <Chip label={`第${ev.chapter_number}章`} /> : null}
        {ev.related_characters?.length ? (
          <Text style={{ color: C.text3, fontSize: 11, flex: 1 }} numberOfLines={1}>
            {ev.related_characters.join('、')}
          </Text>
        ) : null}
      </View>
      {ev.description ? (
        <Text style={{ color: C.text2, fontSize: 11.5, lineHeight: 16 }} numberOfLines={2}>
          {ev.description}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * 故事时间线卡（后端 timeline_ledger 能力模块的网页入口同款）：
 * 大事年表（AI 提取/回填的事件在这里纠错，手工录入=最高权威）+ 一致性警告
 * + 锚点覆盖统计 + 存量回填任务提交。挂在项目设定页。
 */
export function TimelineCard({ projectId }: { projectId: number }) {
  const { api, logout } = useAuth();
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [data, setData] = useState<TimelineRes | null>(null);
  const [busy, setBusy] = useState(false);
  /** null=关闭；{id: null}=新增；{id: N, form}=编辑 */
  const [editing, setEditing] = useState<{ id: number | null; form: EventForm } | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setData(await api.getTimeline(projectId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        return;
      }
      setData(null);
    }
  }, [api, projectId, logout]);

  // async 边界包裹：load 的 setState 都在异步续延里，直接调用会被 set-state-in-effect 规则判为同步写
  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  if (!api) return null;

  /** 手工保存的事件自动升 manual 最高权威（后端语义） */
  const saveEvent = async () => {
    if (!editing || busy) return;
    const f = editing.form;
    if (!f.name.trim()) {
      toast('事件名不能为空');
      return;
    }
    const parseNum = (s: string): number | null => {
      const t = s.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? Math.round(n) : null;
    };
    const body = {
      name: f.name.trim(),
      event_type: f.event_type,
      time_display: f.time_display.trim(),
      description: f.description.trim(),
      event_day: parseNum(f.event_day),
      related_characters: f.related.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean),
      chapter_number: parseNum(f.chapter),
    };
    setBusy(true);
    try {
      if (editing.id == null) await api.createTimelineEvent(projectId, body);
      else await api.updateTimelineEvent(projectId, editing.id, body);
      toast(editing.id == null ? '已录入（手工=最高权威）' : '已保存（自动升为手工权威）');
      setEditing(null);
      await load();
    } catch (e) {
      toast('保存失败：' + friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteEvent = (ev: TimelineEvent) => {
    confirm({
      title: '删除年表事件？',
      message: `「${ev.name}」将被删除，正文时间换算不再引用它。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: async () => {
        if (!api) return;
        try {
          await api.deleteTimelineEvent(projectId, ev.id);
          toast('已删除');
          await load();
        } catch (e) {
          toast('删除失败：' + friendlyError(e));
        }
      },
    });
  };

  const submitBackfill = async () => {
    if (!api || busy) return;
    setBusy(true);
    try {
      const r = await api.backfillTimeline(projectId);
      toast(`已提交回填任务 #${r.task_id}，进度看「任务」页`);
      await load();
    } catch (e) {
      toast('提交失败：' + friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  // event_day 升序（null 沉底）：翻年表即按故事内时间读
  const events = [...(data?.events ?? [])].sort((a, b) => (a.event_day ?? Infinity) - (b.event_day ?? Infinity));

  return (
    <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 10 }}>
      {toastNode}
      {confirmNode}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700', flex: 1 }}>故事时间线</Text>
        {busy ? <ActivityIndicator size="small" color={C.gold} /> : null}
      </View>
      <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>
        「X年前」换算的权威账本：大纲锚点 + 大事年表，正文生成时按需注入。AI 猜的事件在这里改（改过自动升手工最高权威）。
      </Text>

      {data ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: R.m, paddingVertical: 8, alignItems: 'center', gap: 2 }}>
            <Text style={{ color: C.gold, fontSize: 15, fontWeight: '800' }}>
              {data.anchored_count}/{data.chapter_count}
            </Text>
            <Text style={{ color: C.text3, fontSize: 10.5 }}>大纲锚点</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: R.m, paddingVertical: 8, alignItems: 'center', gap: 2 }}>
            <Text style={{ color: C.gold, fontSize: 15, fontWeight: '800' }}>{events.length}</Text>
            <Text style={{ color: C.text3, fontSize: 10.5 }}>年表事件</Text>
          </View>
        </View>
      ) : (
        <View style={{ height: 52, justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={C.text3} />
        </View>
      )}

      {data?.warnings?.length ? (
        <View style={{ backgroundColor: 'rgba(214,166,69,0.1)', borderWidth: 1, borderColor: 'rgba(214,166,69,0.35)', borderRadius: R.m, padding: 10, gap: 4 }}>
          {data.warnings.map((w, i) => (
            <Text key={i} style={{ color: '#D6A645', fontSize: 11.5, lineHeight: 16 }}>
              ⚠ {w}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setEditing({ id: null, form: EMPTY_FORM })}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 38,
            borderRadius: R.m,
            backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
            borderWidth: 1,
            borderColor: 'rgba(229,181,88,0.4)',
          })}
        >
          <Ionicons name="add" size={15} color={C.gold} />
          <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>录入事件</Text>
        </Pressable>
        <Pressable
          onPress={submitBackfill}
          disabled={!data || data.chapter_count === 0}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 38,
            borderRadius: R.m,
            backgroundColor: pressed ? '#20304A' : C.blueSoft,
            borderWidth: 1,
            borderColor: 'rgba(106,166,232,0.4)',
            opacity: !data || data.chapter_count === 0 ? 0.5 : 1,
          })}
        >
          <Ionicons name="sparkles" size={14} color={C.blue} />
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: '700' }}>AI 补锚点/年表</Text>
        </Pressable>
      </View>

      {events.length > 0 ? (
        <ScrollView style={{ flexGrow: 0 }} nestedScrollEnabled contentContainerStyle={{ gap: 7 }}>
          {events.map((ev) => (
            <EventRow key={ev.id} ev={ev} onPress={() => setEditing({ id: ev.id, form: toForm(ev) })} onLongPress={() => deleteEvent(ev)} />
          ))}
        </ScrollView>
      ) : (
        <Text style={{ color: C.text3, fontSize: 11.5, textAlign: 'center', paddingVertical: 6 }}>
          还没有年表事件：点「AI 补锚点/年表」从已有大纲回填，或手工录入
        </Text>
      )}

      <SheetModal visible={!!editing} onClose={() => (busy ? undefined : setEditing(null))} title={editing?.id == null ? '录入年表事件' : '编辑年表事件'}>
        {editing ? (
          <View style={{ gap: 12 }}>
            <View style={{ gap: 7 }}>
              <FieldLabel>事件名（必填）</FieldLabel>
              <Input
                value={editing.form.name}
                onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, name: v } })}
                placeholder="如：沈家灭门"
              />
            </View>
            <SelectField
              label="类型"
              value={editing.form.event_type}
              options={EVENT_TYPE_OPTIONS}
              onChange={(v) => setEditing({ ...editing, form: { ...editing.form, event_type: v } })}
            />
            <View style={{ gap: 7 }}>
              <FieldLabel>人读时间（如「七年前」）</FieldLabel>
              <Input
                value={editing.form.time_display}
                onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, time_display: v } })}
                placeholder="七年前 / 当夜 / 立朝三十七年"
              />
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>故事内天坐标（第1章第1天=0，开始前为负；不确定留空）</FieldLabel>
              <Input
                value={editing.form.event_day}
                onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, event_day: v.replace(/[^-\d]/g, '') } })}
                placeholder="如 0 / -2555"
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 7 }}>
                <FieldLabel>关联角色（顿号分隔）</FieldLabel>
                <Input
                  value={editing.form.related}
                  onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, related: v } })}
                  placeholder="沈青梧、沈母"
                />
              </View>
              <View style={{ width: 96, gap: 7 }}>
                <FieldLabel>首次提及章</FieldLabel>
                <Input
                  value={editing.form.chapter}
                  onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, chapter: v.replace(/\D/g, '') } })}
                  placeholder="如 12"
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <View style={{ gap: 7 }}>
              <FieldLabel>说明</FieldLabel>
              <Input
                value={editing.form.description}
                onChangeText={(v) => setEditing({ ...editing, form: { ...editing.form, description: v } })}
                placeholder="事件经过 / 对主线的意义"
                multiline
                height={88}
              />
            </View>
            <Pressable
              onPress={saveEvent}
              disabled={busy}
              style={({ pressed }) => ({
                height: 46,
                borderRadius: R.m,
                backgroundColor: busy ? '#B99447' : C.gold,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{busy ? '保存中…' : '保存'}</Text>
            </Pressable>
            {editing.id != null ? (
              <Pressable
                onPress={() => {
                  const target = events.find((e) => e.id === editing.id);
                  if (target) {
                    setEditing(null);
                    deleteEvent(target);
                  }
                }}
                style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: C.seal, fontSize: 13.5, fontWeight: '600' }}>删除这个事件</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </SheetModal>
    </View>
  );
}
