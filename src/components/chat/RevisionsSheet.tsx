import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, EmptyState, SheetModal, Skeleton, useConfirm, useToast } from '@/components/ui';
import type { ChatRevision } from '@/lib/api';
import { REVISION_SOURCE_LABEL } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { fmtRelative } from '@/lib/format';
import { C, R } from '@/lib/theme';

/** 修改记录（版本账本）：所有 AI 侧正文写入的快照，old/new 对照查看，撤销=写反向记录 */
export function RevisionsSheet({ projectId, visible, onClose }: { projectId: number; visible: boolean; onClose: () => void }) {
  const { api } = useAuth();
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [list, setList] = useState<ChatRevision[] | null>(null);
  const [detail, setDetail] = useState<ChatRevision | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [oldOpen, setOldOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setList(await api.listChatRevisions(projectId, { limit: 100 }));
    } catch (e) {
      setList([]);
      toast(friendlyError(e));
    }
  }, [api, projectId, toast]);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开面板时重置并异步拉修订列表
      setList(null);
      setDetail(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const openDetail = (id: number) => {
    if (!api) return;
    setDetailLoading(true);
    setOldOpen(false);
    setNewOpen(false);
    api
      .getChatRevision(projectId, id)
      .then(setDetail)
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setDetailLoading(false));
  };

  const doRevert = (rev: ChatRevision) => {
    if (!api) return;
    confirm({
      title: '撤销这次修改',
      message: `把第 ${rev.chapter_number ?? '?'} 章正文恢复为修改前的版本？撤销也会记录在账本里，撤错了可以再撤销回来。`,
      confirmText: '撤销',
      onConfirm: () => {
        setReverting(true);
        api
          .revertChatRevision(projectId, rev.id)
          .then(() => {
            toast('已撤销，正文恢复为修改前版本');
            setDetail(null);
            load();
          })
          .catch((e) => toast(friendlyError(e)))
          .finally(() => setReverting(false));
      },
    });
  };

  return (
    <>
      {toastNode}
      {confirmNode}

      <SheetModal visible={visible} onClose={() => !detailLoading && !reverting && onClose()} title="修改记录">
        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }}>
          AI 侧对正文的所有写入都在这里留底（应用发现/直改/撤销），可对照前后版本并撤销。
        </Text>
        {list === null ? (
          <Skeleton count={4} height={84} />
        ) : list.length === 0 ? (
          <EmptyState icon="time-outline" title="还没有修改记录" sub="在聊天里让 AI 改正文、或应用审稿发现后，这里会出现记录" />
        ) : (
          list.map((rev) => (
            <Pressable
              key={rev.id}
              onPress={() => openDetail(rev.id)}
              style={({ pressed }) => ({ backgroundColor: pressed ? C.card2 : C.card, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.m, padding: 12, gap: 7 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {rev.chapter_number ? <Chip label={`第${rev.chapter_number}章`} fg={C.gold} bg={C.goldSoft} bold /> : null}
                <Chip label={REVISION_SOURCE_LABEL[rev.source] ?? rev.source} />
                <View style={{ flex: 1 }} />
                <Text style={{ color: C.text3, fontSize: 11 }}>{fmtRelative(rev.created_at)}</Text>
              </View>
              {rev.summary ? (
                <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 18 }} numberOfLines={2}>
                  {rev.summary}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chevron-forward" size={12} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 11 }}>查看前后对照</Text>
              </View>
            </Pressable>
          ))
        )}
      </SheetModal>

      {/* 修订详情：old/new 对照 + 撤销 */}
      <SheetModal visible={detail !== null} onClose={() => !reverting && setDetail(null)} title={detail ? `修订 #${detail.id} · 第${detail.chapter_number ?? '?'}章` : ''}>
        {detailLoading || !detail ? (
          <ActivityIndicator color={C.gold} style={{ paddingVertical: 30 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip label={REVISION_SOURCE_LABEL[detail.source] ?? detail.source} />
              <Chip label={fmtRelative(detail.created_at)} />
              {detail.finding_ids?.length ? <Chip label={`关联发现 ${detail.finding_ids.length} 条`} /> : null}
            </View>
            {detail.summary ? (
              <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 12 }}>
                <Text style={{ color: C.text, fontSize: 13, lineHeight: 19 }}>{detail.summary}</Text>
              </View>
            ) : null}

            {[
              { label: `修改前（${(detail.old_content ?? '').length} 字）`, content: detail.old_content ?? '', open: oldOpen, setOpen: setOldOpen, color: C.seal },
              { label: `修改后（${(detail.new_content ?? '').length} 字）`, content: detail.new_content ?? '', open: newOpen, setOpen: setNewOpen, color: C.green },
            ].map((blk) => (
              <View key={blk.label} style={{ gap: 6 }}>
                <Pressable onPress={() => blk.setOpen(!blk.open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={blk.open ? 'chevron-down' : 'chevron-forward'} size={13} color={C.text3} />
                  <Text style={{ color: blk.color, fontSize: 12.5, fontWeight: '700' }}>{blk.label}</Text>
                  <Text style={{ color: C.text3, fontSize: 11 }}>{blk.open ? '' : '（点击展开全文）'}</Text>
                </Pressable>
                <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 12 }}>
                  <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 20 }} numberOfLines={blk.open ? undefined : 8}>
                    {blk.content || '（空）'}
                  </Text>
                </View>
              </View>
            ))}

            <Pressable
              onPress={() => doRevert(detail)}
              disabled={reverting}
              style={{ height: 46, borderRadius: R.m, backgroundColor: C.sealSoft, borderWidth: 1, borderColor: 'rgba(214,90,69,0.4)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
            >
              {reverting ? <ActivityIndicator size="small" color={C.seal} /> : <Ionicons name="arrow-undo-outline" size={16} color={C.seal} />}
              <Text style={{ color: C.seal, fontSize: 15, fontWeight: '800' }}>{reverting ? '撤销中…' : '撤销这次修改'}</Text>
            </Pressable>
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>撤销 = 恢复为「修改前」的内容，同样写入账本</Text>
          </>
        )}
      </SheetModal>
    </>
  );
}
