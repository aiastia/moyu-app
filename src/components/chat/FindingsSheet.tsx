import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { Chip, EmptyState, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { ApplyFindingsRes, ChatReviewFinding, ChatSession, FindingDraftRes } from '@/lib/api';
import { FINDING_SEVERITY_LABEL, FINDING_STATUS_LABEL, FINDING_TYPE_LABEL } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { fmtRelative } from '@/lib/format';
import { C, R } from '@/lib/theme';

const STATUS_FILTERS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'applied', label: '已应用' },
  { key: 'stale', label: '已过期' },
  { key: 'dismissed', label: '已忽略' },
];

const SEVERITY_STYLE: Record<string, { fg: string; bg: string }> = {
  high: { fg: C.seal, bg: C.sealSoft },
  medium: { fg: C.gold, bg: C.goldSoft },
  low: { fg: C.text2, bg: C.card2 },
};

function scopeLabel(f: ChatReviewFinding): string {
  if (f.scope === 'book') return '全书';
  if (f.scope === 'cross_chapter') return `跨${f.related_chapters?.length ?? 2}章`;
  return '';
}

/** 审稿发现清单：状态筛选 / 补丁与修改稿 / 勾选批量应用 / 忽略与恢复 / 清空待处理 */
export function FindingsSheet({
  projectId,
  session,
  visible,
  onClose,
  onRefreshMessages,
}: {
  projectId: number;
  session: ChatSession | null;
  visible: boolean;
  onClose: () => void;
  onRefreshMessages: () => void;
}) {
  const { api } = useAuth();
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [filter, setFilter] = useState('');
  const [list, setList] = useState<ChatReviewFinding[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  /** 正在生成补丁/修改稿（SSE）的发现 id */
  const [busyId, setBusyId] = useState(0);
  const [busyPhase, setBusyPhase] = useState('');
  const [applying, setApplying] = useState(false);
  /** 最近一次批量应用的结果分组（展示 stale/failed 原因） */
  const [applyResult, setApplyResult] = useState<ApplyFindingsRes | null>(null);
  const [draftSheet, setDraftSheet] = useState<(FindingDraftRes & { editing: boolean; saving: boolean; draftText: string }) | null>(null);
  const { height: winH } = useWindowDimensions();

  const load = useCallback(
    async (status = filter) => {
      if (!api || !session) return;
      try {
        setList(await api.listChatFindings(projectId, session.id, status));
      } catch (e) {
        setList([]);
        toast(friendlyError(e));
      }
    },
    [api, projectId, session, filter, toast],
  );

  useEffect(() => {
    if (visible && session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开面板/切筛选时重置并异步拉清单
      setList(null);
      setSelected([]);
      setApplyResult(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, filter]);

  const pendingList = useMemo(() => (list ?? []).filter((f) => f.status === 'pending'), [list]);

  const toggleSelect = (id: number) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  /** 单条应用（勾选框外的快捷应用） */
  const applyOne = async (id: number) => {
    if (!api || !session) return;
    setApplying(true);
    try {
      const r = await api.applyChatFindings(projectId, session.id, [id]);
      describeApply(r, 1);
      await load();
      onRefreshMessages();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setApplying(false);
    }
  };

  const applySelected = async () => {
    if (!api || !session || selected.length === 0) return;
    setApplying(true);
    try {
      const r = await api.applyChatFindings(projectId, session.id, selected);
      describeApply(r, selected.length);
      setSelected([]);
      await load();
      onRefreshMessages();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setApplying(false);
    }
  };

  const describeApply = (r: ApplyFindingsRes, total: number) => {
    setApplyResult(r);
    const parts = [`应用 ${r.applied.length}`];
    if (r.stale.length) parts.push(`过期 ${r.stale.length}`);
    if (r.failed.length) parts.push(`失败 ${r.failed.length}`);
    if (r.skipped_no_chapter.length) parts.push(`无章节锚点 ${r.skipped_no_chapter.length}`);
    toast(`${total} 条：${parts.join(' · ')}`);
  };

  const genPatch = async (f: ChatReviewFinding) => {
    if (!api || busyId) return;
    setBusyId(f.id);
    setBusyPhase('生成局部补丁…');
    try {
      const r = await api.findingPatchSSE(projectId, f.id, (ev) => {
        if (ev.type === 'status' && typeof ev.brief === 'string') setBusyPhase(ev.brief);
      });
      if (r.error) toast(`补丁生成失败：${r.error}`);
      else toast('补丁已生成，勾选后可应用');
      await load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusyId(0);
      setBusyPhase('');
    }
  };

  const genDraft = async (f: ChatReviewFinding, force = false) => {
    if (!api || busyId) return;
    setBusyId(f.id);
    setBusyPhase(force ? '重新生成整章修改稿…' : '生成整章修改稿…');
    try {
      const r = await api.findingDraftSSE(projectId, f.id, force, (ev) => {
        if (ev.type === 'status' && typeof ev.brief === 'string') setBusyPhase(ev.brief);
      });
      if (r.error) toast(`修改稿生成失败：${r.error}`);
      else {
        toast('修改稿已生成');
        await load();
        viewDraft(f);
      }
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusyId(0);
      setBusyPhase('');
    }
  };

  const viewDraft = async (f: ChatReviewFinding) => {
    if (!api) return;
    try {
      const d = await api.getChatFindingDraft(projectId, f.id);
      setDraftSheet({ ...d, editing: false, saving: false, draftText: d.draft_content });
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  const saveDraft = async () => {
    if (!api || !draftSheet) return;
    const text = draftSheet.draftText.trim();
    if (text.length < 50) {
      toast('修改稿内容过短（至少 50 字）');
      return;
    }
    setDraftSheet({ ...draftSheet, saving: true });
    try {
      await api.saveChatFindingDraft(projectId, draftSheet.finding_id, text);
      toast('修改稿已保存（以当前正文刷新基准）');
      setDraftSheet({ ...draftSheet, saving: false, draft_content: text, editing: false });
    } catch (e) {
      setDraftSheet({ ...draftSheet, saving: false });
      toast(friendlyError(e));
    }
  };

  const setStatus = async (f: ChatReviewFinding, status: string) => {
    if (!api) return;
    try {
      await api.setChatFindingStatus(projectId, f.id, status);
      toast(status === 'dismissed' ? '已忽略' : '已恢复待处理');
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  const clearPending = () => {
    if (!api || !session) return;
    confirm({
      title: '清空待处理发现',
      message: `丢弃本会话全部 ${pendingList.length} 条待处理发现？觉得这轮审得不好时整批丢弃。`,
      confirmText: '清空',
      destructive: true,
      onConfirm: () => {
        api
          .clearPendingChatFindings(projectId, session.id)
          .then(async (r) => {
            toast(`已丢弃 ${r.removed} 条`);
            setSelected([]);
            await load();
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const pendingCountText = pendingList.length ? `（${pendingList.length}）` : '';

  return (
    <>
      {toastNode}
      {confirmNode}

      <SheetModal visible={visible && !!session} onClose={onClose} title="发现清单">
        {/* 状态筛选（横向 ScrollView 必须 flexGrow:0） */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {STATUS_FILTERS.map((s) => {
            const on = filter === s.key;
            const label = s.key === 'pending' ? `待处理${pendingCountText}` : s.label;
            return (
              <Pressable
                key={s.key}
                onPress={() => setFilter(s.key)}
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
                <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {busyPhase ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
            <ActivityIndicator size="small" color={C.gold} />
            <Text style={{ color: C.text2, fontSize: 12.5, flex: 1 }} numberOfLines={1}>{busyPhase}</Text>
          </View>
        ) : null}

        {applyResult ? (
          <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 11, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-done-outline" size={13} color={C.gold} />
              <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700', flex: 1 }}>最近一次应用结果</Text>
              <Pressable onPress={() => setApplyResult(null)} hitSlop={6}>
                <Ionicons name="close" size={14} color={C.text3} />
              </Pressable>
            </View>
            <Text style={{ color: C.text2, fontSize: 11.5, lineHeight: 17 }}>
              应用 {applyResult.applied.length} · 过期 {applyResult.stale.length} · 失败 {applyResult.failed.length} · 无锚点 {applyResult.skipped_no_chapter.length}
            </Text>
            {[...applyResult.stale.slice(0, 3).map((s) => `过期 #${s.id}：${s.reason ?? '正文已改'}`), ...applyResult.failed.slice(0, 3).map((s) => `失败 #${s.id}：${s.reason ?? ''}`)]
              .filter(Boolean)
              .map((line, i) => (
                <Text key={i} style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>· {line}</Text>
              ))}
          </View>
        ) : null}

        {list === null ? (
          <Skeleton count={4} height={96} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title={filter === '' ? '还没有发现' : '该状态下没有发现'}
            sub="通读审稿完成后，问题清单出现在这里；也可以在对话里让 AI 记录问题"
          />
        ) : (
          list.map((f) => {
            const sev = SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.low;
            const isPending = f.status === 'pending';
            const checked = selected.includes(f.id);
            return (
              <View
                key={f.id}
                style={{
                  backgroundColor: C.card,
                  borderWidth: 1,
                  borderColor: checked ? 'rgba(229,181,88,0.4)' : C.borderSoft,
                  borderRadius: R.m,
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {isPending ? (
                    <Pressable onPress={() => toggleSelect(f.id)} hitSlop={6} style={{ width: 20, height: 20, borderRadius: 7, borderWidth: 1.5, borderColor: checked ? C.gold : '#3A4258', backgroundColor: checked ? C.gold : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {checked ? <Ionicons name="checkmark" size={13} color="#1A1206" /> : null}
                    </Pressable>
                  ) : null}
                  <Chip label={FINDING_SEVERITY_LABEL[f.severity] ?? f.severity} fg={sev.fg} bg={sev.bg} bold />
                  <Chip label={FINDING_TYPE_LABEL[f.finding_type] ?? f.finding_type} />
                  {f.chapter_number ? <Chip label={`第${f.chapter_number}章`} fg={C.blue} bg={C.blueSoft} /> : null}
                  {scopeLabel(f) ? <Chip label={scopeLabel(f)} fg={C.purple} bg={C.purpleSoft} /> : null}
                  {!isPending ? (
                    <Chip
                      label={FINDING_STATUS_LABEL[f.status] ?? f.status}
                      fg={f.status === 'applied' ? C.green : f.status === 'stale' ? C.seal : C.text3}
                      bg={f.status === 'applied' ? C.greenSoft : f.status === 'stale' ? C.sealSoft : C.card2}
                    />
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: C.text3, fontSize: 10.5 }}>{fmtRelative(f.created_at)}</Text>
                </View>

                {f.quote ? (
                  <View style={{ backgroundColor: '#0F121B', borderLeftWidth: 2, borderLeftColor: sev.fg, borderRadius: R.s, paddingVertical: 7, paddingHorizontal: 10 }}>
                    <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 19 }}>{f.quote}</Text>
                  </View>
                ) : null}
                {f.suggestion ? (
                  <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 19 }}>{f.suggestion}</Text>
                ) : null}
                {f.finding_type === 'typo' && f.replacement ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <Text style={{ color: C.text3, fontSize: 12 }}>改为</Text>
                    <Text style={{ color: C.green, fontSize: 12.5, flex: 1, lineHeight: 18 }}>{f.replacement}</Text>
                  </View>
                ) : null}
                {f.has_patch && f.patch_quote ? (
                  <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.s, padding: 9, gap: 4 }}>
                    <Text style={{ color: C.text3, fontSize: 10.5, fontWeight: '700' }}>局部补丁</Text>
                    <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>{f.patch_quote}</Text>
                    <Text style={{ color: C.green, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>→ {f.patch_replacement}</Text>
                  </View>
                ) : null}

                {isPending ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 1 }}>
                    {!f.has_patch && !f.has_draft && !f.replacement ? (
                      <SmallBtn icon="bandage-outline" label={busyId === f.id ? '生成中' : '生成补丁'} busy={busyId === f.id} onPress={() => genPatch(f)} />
                    ) : null}
                    {f.has_draft ? (
                      <SmallBtn icon="document-text-outline" label="查看修改稿" onPress={() => viewDraft(f)} />
                    ) : f.finding_type !== 'typo' && !f.has_patch ? (
                      <SmallBtn icon="create-outline" label={busyId === f.id ? '生成中' : '生成修改稿'} busy={busyId === f.id} onPress={() => genDraft(f)} />
                    ) : null}
                    <SmallBtn icon="checkmark-done-outline" label={applying ? '应用中' : '应用'} busy={applying} onPress={() => applyOne(f.id)} gold />
                    <SmallBtn icon="close-circle-outline" label="忽略" onPress={() => setStatus(f, 'dismissed')} />
                  </View>
                ) : f.status === 'dismissed' || f.status === 'stale' ? (
                  <View style={{ flexDirection: 'row', gap: 7, marginTop: 1 }}>
                    <SmallBtn icon="refresh-outline" label="恢复待处理" onPress={() => setStatus(f, 'pending')} />
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {/* 底部批量操作 */}
        {pendingList.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <Pressable
              onPress={() => setSelected(selected.length === pendingList.length ? [] : pendingList.map((f) => f.id))}
              style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>{selected.length === pendingList.length ? '取消全选' : '全选待处理'}</Text>
            </Pressable>
            <Pressable
              onPress={applySelected}
              disabled={selected.length === 0 || applying}
              style={{ flex: 1.4, height: 42, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: selected.length === 0 ? 0.45 : 1 }}
            >
              {applying ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark-done" size={15} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 13.5, fontWeight: '800' }}>{applying ? '应用中…' : `应用选中 ${selected.length} 条`}</Text>
            </Pressable>
            <Pressable
              onPress={clearPending}
              style={{ width: 42, height: 42, borderRadius: R.m, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="trash-outline" size={16} color={C.seal} />
            </Pressable>
          </View>
        ) : null}
      </SheetModal>

      {/* 修改稿查看/编辑（嵌套弹层） */}
      <SheetModal visible={draftSheet !== null} onClose={() => !draftSheet?.saving && setDraftSheet(null)} title={draftSheet ? `修改稿 · 第${draftSheet.chapter_number ?? '?'}章${draftSheet.is_chapter_level ? '（同章共享稿）' : ''}` : ''}>
        {draftSheet ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: C.text3, fontSize: 11.5, flex: 1 }}>应用时整章替换（先与当前正文对照确认）</Text>
              <Pressable onPress={() => setDraftSheet({ ...draftSheet, editing: !draftSheet.editing, draftText: draftSheet.draft_content })} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name={draftSheet.editing ? 'eye-outline' : 'create-outline'} size={13} color={C.gold} />
                <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>{draftSheet.editing ? '查看' : '编辑'}</Text>
              </Pressable>
            </View>
            <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>修改稿（{draftSheet.draftText.length} 字）</Text>
            {draftSheet.editing ? (
              <TextInput
                value={draftSheet.draftText}
                onChangeText={(v) => setDraftSheet({ ...draftSheet, draftText: v })}
                multiline
                keyboardAppearance="dark"
                style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 12, color: C.text, fontSize: 13, lineHeight: 21, height: Math.round(winH * 0.34), textAlignVertical: 'top' }}
              />
            ) : (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: 'rgba(95,191,143,0.3)', borderRadius: R.m, padding: 12 }}>
                <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 20 }}>{draftSheet.draftText}</Text>
              </View>
            )}
            <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>当前正文（{draftSheet.chapter_content.length} 字，开头）</Text>
            <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 12 }}>
              <Text style={{ color: C.text3, fontSize: 12.5, lineHeight: 20 }} numberOfLines={8}>{draftSheet.chapter_content || '（空）'}</Text>
            </View>
            {draftSheet.editing ? (
              <Pressable onPress={saveDraft} disabled={draftSheet.saving} style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                {draftSheet.saving ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={16} color="#1A1206" />}
                <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{draftSheet.saving ? '保存中…' : '保存修改稿'}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  const fid = draftSheet.finding_id;
                  setDraftSheet(null);
                  applyOne(fid);
                }}
                disabled={applying}
                style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
              >
                {applying ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark-done" size={16} color="#1A1206" />}
                <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>{applying ? '应用中…' : '应用此修改稿'}</Text>
              </Pressable>
            )}
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>同章的其他待处理问题会随整章稿一并标记应用</Text>
          </>
        ) : null}
      </SheetModal>
    </>
  );
}

function SmallBtn({ icon, label, onPress, busy, gold }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; busy?: boolean; gold?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 31,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: gold ? C.goldSoft : C.card2,
        borderWidth: 1,
        borderColor: gold ? 'rgba(229,181,88,0.4)' : C.border,
        opacity: busy ? 0.55 : 1,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={gold ? C.gold : C.text2} /> : <Ionicons name={icon} size={13} color={gold ? C.gold : C.text2} />}
      <Text style={{ color: gold ? C.gold : C.text2, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
