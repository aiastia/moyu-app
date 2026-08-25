import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { FieldLabel, Input, SelectField, SheetModal, useToast } from '@/components/ui';
import type { Api, SubmissionRow } from '@/lib/api';
import { friendlyError } from '@/lib/auth';
import { PLATFORM_OPTIONS } from '@/lib/platforms';
import { C, R } from '@/lib/theme';

interface EditRow extends SubmissionRow {
  uid: number;
}

let rowUid = 0;

/** 投稿记录管理弹窗：一条记录 = 一个平台一次投稿（有记录的书在书架显示「已投」）。
 *  被拒后转投他台就加一条新记录；全量保存走 PUT /api/projects/{id}/submissions。 */
export function SubmissionsSheet({
  visible,
  onClose,
  api,
  projectId,
  projectTitle,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  api: Api | null;
  projectId: number;
  projectTitle: string;
  onSaved: () => void;
}) {
  const [toast, toastNode] = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EditRow[]>([]);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const res = await api.getSubmissions(projectId);
      setRows(
        (res.submissions ?? []).map((r) => ({
          uid: ++rowUid,
          platform: r.platform || '',
          date: r.date || '',
          note: r.note || '',
        })),
      );
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [api, projectId, toast]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  // 平台选项 = 全站清单 + 已有记录里的自定义平台（历史手输值保持可选）
  const platformOptions = (() => {
    const extra = rows.map((r) => r.platform.trim()).filter((p) => p && !PLATFORM_OPTIONS.includes(p));
    return [...PLATFORM_OPTIONS, ...extra].map((p) => ({ value: p, label: p }));
  })();

  const patchRow = (uid: number, patch: Partial<EditRow>) => {
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    if (!api || saving) return;
    const list = rows
      .map((r) => ({ platform: r.platform.trim(), date: (r.date || '').trim(), note: (r.note || '').trim() }))
      .filter((r) => r.platform);
    setSaving(true);
    try {
      const res = await api.putSubmissions(projectId, list);
      toast(res.count ? `已保存 ${res.count} 条投稿记录` : '已清空投稿记录');
      onSaved();
      onClose();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title={`投稿记录 ·《${projectTitle}》`}>
      {toastNode}
      <Text style={{ color: C.text3, fontSize: 12, lineHeight: 17, marginBottom: 4 }}>
        一条记录 = 一个平台一次投稿；有记录的书在书架显示「已投」。被拒后转投他台就加一条新记录。
      </Text>

      {loading ? (
        <ActivityIndicator color={C.gold} style={{ paddingVertical: 30 }} />
      ) : (
        <View style={{ gap: 12 }}>
          {rows.length === 0 ? (
            <Text style={{ color: C.text3, fontSize: 13, textAlign: 'center', paddingVertical: 18 }}>
              还没有投稿记录（书架显示为「未投稿」）
            </Text>
          ) : null}

          {rows.map((r) => (
            <View
              key={r.uid}
              style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 12, gap: 9 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ flex: 1 }}>
                  <SelectField
                    label="平台"
                    value={r.platform}
                    options={platformOptions}
                    placeholder="选择平台"
                    onChange={(v) => patchRow(r.uid, { platform: v })}
                  />
                </View>
                <Pressable
                  onPress={() => setRows((rs) => rs.filter((x) => x.uid !== r.uid))}
                  hitSlop={6}
                  style={{ width: 34, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="trash-outline" size={18} color={C.seal} />
                </Pressable>
              </View>
              <View style={{ gap: 7 }}>
                <FieldLabel>投稿日期</FieldLabel>
                <Input
                  value={r.date}
                  onChangeText={(v) => patchRow(r.uid, { date: v })}
                  placeholder="2026-08-25（可空）"
                  autoCapitalize="none"
                />
              </View>
              <View style={{ gap: 7 }}>
                <FieldLabel>备注</FieldLabel>
                <Input
                  value={r.note}
                  onChangeText={(v) => patchRow(r.uid, { note: v })}
                  placeholder="如：三签过稿 / 被拒，准备转投（可空）"
                />
              </View>
            </View>
          ))}

          <Pressable
            onPress={() => setRows((rs) => [...rs, { uid: ++rowUid, platform: '', date: '', note: '' }])}
            style={{
              height: 42,
              borderRadius: R.m,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: C.card2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="add" size={16} color={C.gold} />
            <Text style={{ color: C.gold, fontSize: 13.5, fontWeight: '700' }}>添加一条记录</Text>
          </Pressable>

          <Pressable
            onPress={save}
            disabled={saving}
            style={{
              height: 48,
              borderRadius: R.m,
              backgroundColor: C.gold,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              marginTop: 2,
            }}
          >
            {saving ? <ActivityIndicator size="small" color="#1A1408" /> : null}
            <Text style={{ color: '#1A1408', fontSize: 15, fontWeight: '800' }}>保存</Text>
          </Pressable>
        </View>
      )}
    </SheetModal>
  );
}
