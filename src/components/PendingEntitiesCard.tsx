import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, useToast } from '@/components/ui';
import type { PendingEntitiesRes, PendingEntityItem } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

/** 四类候选的类型键（与后端 IGNORE_ENTITY_TYPES / pending_* 字段一致） */
const TYPES = [
  { key: 'characters', label: '角色', field: 'pending_characters', ignoredField: 'ignored_characters', icon: 'person-outline' as const },
  { key: 'organizations', label: '组织', field: 'pending_organizations', ignoredField: 'ignored_organizations', icon: 'business-outline' as const },
  { key: 'locations', label: '地点', field: 'pending_locations', ignoredField: 'ignored_locations', icon: 'location-outline' as const },
  { key: 'items', label: '物品', field: 'pending_items', ignoredField: 'ignored_items', icon: 'cube-outline' as const },
] as const;

function EntityRow({
  entity,
  ignored,
  onToggleIgnore,
}: {
  entity: PendingEntityItem;
  ignored: boolean;
  onToggleIgnore: (name: string, ignore: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: ignored ? C.text3 : C.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
            {entity.name}
          </Text>
          {entity.from_chapter ? <Chip label={`第${entity.from_chapter}章`} /> : null}
        </View>
        {entity.description ? (
          <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }} numberOfLines={1}>
            {entity.description}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => onToggleIgnore(entity.name, !ignored)}
        hitSlop={6}
        style={{
          paddingHorizontal: 11,
          height: 28,
          borderRadius: 9,
          backgroundColor: ignored ? C.goldSoft : C.card2,
          borderWidth: 1,
          borderColor: ignored ? 'rgba(229,181,88,0.4)' : C.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: ignored ? C.gold : C.text2, fontSize: 11.5, fontWeight: '600' }}>
          {ignored ? '恢复' : '忽略'}
        </Text>
      </Pressable>
    </View>
  );
}

/** 大纲待补充实体卡片：大纲/章节计划里出现但尚未入库的角色、组织、地点、物品。
 *  支持 AI 按类型补录入库、忽略（生成任务同步跳过）与恢复；挂在大纲 Tab 底部。
 *  total 与 ignored_total 都为 0 时不渲染（大纲不再引用的忽略项服务端自动不返回）。 */
export function PendingEntitiesCard({ projectId }: { projectId: number }) {
  const { api } = useAuth();
  const [toast, toastNode] = useToast();
  const [data, setData] = useState<PendingEntitiesRes | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const res = await api.getPendingEntities(projectId);
      setData(res);
    } catch {
      setData(null);
    }
  }, [api, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data || (data.total === 0 && data.ignored_total === 0)) return toastNode ?? null;

  const setIgnored = async (entityType: string, names: string[], ignore: boolean) => {
    if (!api || busy) return;
    setBusy(true);
    try {
      await (ignore ? api.ignorePendingEntities(projectId, entityType, names) : api.unignorePendingEntities(projectId, entityType, names));
      toast(ignore ? '已忽略，生成时将跳过' : '已恢复为待补充');
      await load();
    } catch (e) {
      toast('操作失败：' + friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const generate = async (entityType: string) => {
    if (!api || busy) return;
    setBusy(true);
    try {
      await api.generatePendingEntities(projectId, entityType);
      toast('已提交生成任务，可在「任务」页查看进度');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const generateAll = async () => {
    if (!api || busy) return;
    const withData = TYPES.filter((t) => (data[t.field]?.length ?? 0) > 0);
    if (!withData.length) {
      toast('当前没有需要补充的实体');
      return;
    }
    setBusy(true);
    try {
      for (const t of withData) await api.generatePendingEntities(projectId, t.key);
      toast(`已提交 ${withData.length} 个生成任务，可在「任务」页查看进度`);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ backgroundColor: C.card, borderRadius: R.m, borderWidth: 1, borderColor: C.borderSoft, padding: 13, gap: 9 }}>
      {toastNode}
      <Pressable onPress={() => setExpanded(!expanded)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="clipboard-outline" size={15} color={C.gold} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>
          待补充实体
          {data.total > 0 ? (
            <Text style={{ color: C.gold }}> {data.total} 项待入库</Text>
          ) : null}
          {data.ignored_total > 0 ? (
            <Text style={{ color: C.text3 }}> · 已忽略 {data.ignored_total}</Text>
          ) : null}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.text3} />
      </Pressable>

      {expanded ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }}>
            大纲里出现但还没建档的实体。可 AI 一键补录入库；不会写进正文的用「忽略」排除（生成时自动跳过）。
          </Text>

          {TYPES.map((t) => {
            const list = data[t.field] ?? [];
            const ignoredList = data[t.ignoredField] ?? [];
            return (
              <View key={t.key} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Ionicons name={t.icon} size={13} color={C.text2} />
                  <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
                    {t.label} <Text style={{ color: C.text3, fontWeight: '500' }}>{list.length ? `${list.length} 项` : '无'}</Text>
                  </Text>
                  <Pressable
                    onPress={() => list.length && generate(t.key)}
                    disabled={!list.length || busy}
                    style={{
                      paddingHorizontal: 11,
                      height: 28,
                      borderRadius: 9,
                      backgroundColor: list.length ? C.goldSoft : C.card2,
                      borderWidth: 1,
                      borderColor: list.length ? 'rgba(229,181,88,0.4)' : C.borderSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 4,
                      opacity: list.length ? 1 : 0.5,
                    }}
                  >
                    {busy ? <ActivityIndicator size="small" color={C.gold} /> : <Ionicons name="sparkles" size={11} color={C.gold} />}
                    <Text style={{ color: list.length ? C.gold : C.text3, fontSize: 11.5, fontWeight: '700' }}>生成</Text>
                  </Pressable>
                </View>
                {list.length ? (
                  <View style={{ marginLeft: 2, borderLeftWidth: 1, borderColor: C.borderSoft, paddingLeft: 9 }}>
                    {list.slice(0, 8).map((e) => (
                      <EntityRow key={e.name} entity={e} ignored={false} onToggleIgnore={(name, ig) => setIgnored(t.key, [name], ig)} />
                    ))}
                    {list.length > 8 ? (
                      <Text style={{ color: C.text3, fontSize: 11, paddingVertical: 4 }}>…共 {list.length} 项，其余生成时一并处理</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {data.ignored_total > 0 ? (
            <View style={{ borderTopWidth: 1, borderColor: C.borderSoft, paddingTop: 8, gap: 4 }}>
              <Pressable onPress={() => setShowIgnored(!showIgnored)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={showIgnored ? 'chevron-up' : 'chevron-down'} size={12} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 12, fontWeight: '600' }}>已忽略（{data.ignored_total}）</Text>
              </Pressable>
              {showIgnored ? (
                <View style={{ marginLeft: 2, borderLeftWidth: 1, borderColor: C.borderSoft, paddingLeft: 9 }}>
                  {TYPES.filter((t) => (data[t.ignoredField]?.length ?? 0) > 0).map((t) =>
                    (data[t.ignoredField] ?? []).map((e) => (
                      <EntityRow key={`${t.key}-${e.name}`} entity={e} ignored onToggleIgnore={(name, ig) => setIgnored(t.key, [name], ig)} />
                    )),
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            onPress={generateAll}
            disabled={busy || data.total === 0}
            style={({ pressed }) => ({
              height: 38,
              borderRadius: R.m,
              backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
              borderWidth: 1,
              borderColor: 'rgba(229,181,88,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 7,
              opacity: data.total === 0 ? 0.5 : 1,
            })}
          >
            <Ionicons name="sparkles" size={14} color={C.gold} />
            <Text style={{ color: C.gold, fontSize: 13, fontWeight: '700' }}>全部生成（{data.total}）</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
