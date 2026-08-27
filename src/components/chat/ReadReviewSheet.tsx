import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Chip, FieldLabel, Input, SheetModal, useToast } from '@/components/ui';
import type { ChatSession, ReadReviewPreview, TaskItem } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R } from '@/lib/theme';

const BATCH_MODES = [
  { value: 'auto', label: '自动', hint: '按上下文窗口自动分批' },
  { value: '10', label: '每 10 章' },
  { value: '20', label: '每 20 章' },
  { value: '50', label: '每 50 章' },
  { value: 'all', label: '全部一次', hint: '范围大时可能超窗口' },
];

/** 可续跑的历史通读任务（被取消/失败且已有完成章） */
interface ResumeCandidate {
  taskId: number;
  lastChapter: number;
  title: string;
}

/** 通读审稿：范围/分批/侧重点表单 → 预览估算 → 确认启动（断点续跑） */
export function ReadReviewSheet({ projectId, session, visible, onClose }: { projectId: number; session: ChatSession | null; visible: boolean; onClose: () => void }) {
  const { api } = useAuth();
  const [toast, toastNode] = useToast();
  const [startCh, setStartCh] = useState('1');
  const [endCh, setEndCh] = useState('');
  const [batchMode, setBatchMode] = useState('auto');
  const [focus, setFocus] = useState('');
  const [preview, setPreview] = useState<ReadReviewPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [resumes, setResumes] = useState<ResumeCandidate[]>([]);
  const [resumeTaskId, setResumeTaskId] = useState(0);

  const doPreview = useCallback(
    async (silent = false) => {
      if (!api) return;
      setPreviewing(true);
      if (!silent) setPreview(null);
      try {
        const p = await api.previewReadReview(projectId, {
          start_chapter: Number(startCh) || 1,
          end_chapter: Number(endCh) || undefined,
          batch_mode: batchMode,
        });
        setPreview(p);
      } catch (e) {
        if (!silent) toast(friendlyError(e));
      } finally {
        setPreviewing(false);
      }
    },
    [api, projectId, startCh, endCh, batchMode, toast],
  );

  /** 打开时：拉一次预览 + 找可续跑的断点任务 */
  useEffect(() => {
    if (!visible || !api) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开面板时重置续跑选择并异步拉预览
    setResumeTaskId(0);
    doPreview(true);
    api
      .getTasks({ projectId, limit: 50 })
      .then((list) => {
        const cands: ResumeCandidate[] = [];
        for (const t of (list ?? []) as TaskItem[]) {
          if (t.task_type !== 'chat_read_review' || (t.status !== 'cancelled' && t.status !== 'failed')) continue;
          const details = (t.progress_details ?? {}) as { last_completed_chapter?: number };
          if (details.last_completed_chapter && details.last_completed_chapter > 0) {
            cands.push({ taskId: t.id, lastChapter: details.last_completed_chapter, title: t.title });
          }
        }
        setResumes(cands);
      })
      .catch(() => setResumes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const start = useCallback(async () => {
    if (!api || !session || starting) return;
    setStarting(true);
    try {
      const r = await api.startReadReview(projectId, {
        session_id: session.id,
        start_chapter: Number(startCh) || 1,
        end_chapter: Number(endCh) || undefined,
        focus: focus.trim(),
        batch_mode: batchMode,
        ...(resumeTaskId ? { resume_task_id: resumeTaskId } : {}),
      });
      toast(`已提交通读审稿（任务 #${r.task_id}），完成后报告发到本会话`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) toast(e.message);
      else toast(friendlyError(e));
    } finally {
      setStarting(false);
    }
  }, [api, session, projectId, startCh, endCh, focus, batchMode, resumeTaskId, starting, toast, onClose]);

  const wordsWan = preview ? (preview.total_words / 10000).toFixed(1) : '0';

  return (
    <>
      {toastNode}
      <SheetModal visible={visible} onClose={() => !previewing && !starting && onClose()} title="通读审稿">
        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }}>
          分批通读全部正文找问题（错字/前后矛盾/设定冲突），产出发现清单与局部修改补丁，审完汇总一份报告发到当前会话。
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 7 }}>
            <FieldLabel>起始章</FieldLabel>
            <Input value={startCh} onChangeText={(v) => setStartCh(v.replace(/[^0-9]/g, ''))} placeholder="1" keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1, gap: 7 }}>
            <FieldLabel>结束章（空=到最新）</FieldLabel>
            <Input value={endCh} onChangeText={(v) => setEndCh(v.replace(/[^0-9]/g, ''))} placeholder="最新" keyboardType="number-pad" />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>分批方式</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {BATCH_MODES.map((m) => {
              const on = batchMode === m.value;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setBatchMode(m.value)}
                  style={{
                    paddingHorizontal: 14,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? C.goldSoft : C.card2,
                    borderWidth: 1,
                    borderColor: on ? 'rgba(229,181,88,0.45)' : C.border,
                  }}
                >
                  <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 7 }}>
          <FieldLabel>审稿侧重点（可选）</FieldLabel>
          <Input value={focus} onChangeText={setFocus} placeholder="如：重点看时间线和人物称谓" multiline height={64} />
        </View>

        <Pressable
          onPress={() => doPreview()}
          disabled={previewing}
          style={{ height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}
        >
          {previewing ? <ActivityIndicator size="small" color={C.gold} /> : <Ionicons name="calculator-outline" size={15} color={C.text2} />}
          <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>{previewing ? '估算中…' : '重新估算'}</Text>
        </Pressable>

        {preview ? (
          <View style={{ backgroundColor: '#0F121B', borderWidth: 1, borderColor: '#242A3B', borderRadius: R.m, padding: 13, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="document-text-outline" size={14} color={C.gold} />
              <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '800', flex: 1 }}>{preview.book_title}</Text>
              <Chip label={preview.range} fg={C.gold} bg={C.goldSoft} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip label={`${preview.chapter_count} 章`} />
              <Chip label={`${wordsWan} 万字`} />
              <Chip label={`${preview.batch_count} 批（${preview.batch_mode}）`} />
              <Chip label={`约 ${preview.est_minutes} 分钟`} />
            </View>
            {preview.message ? <Text style={{ color: C.seal, fontSize: 12, lineHeight: 17 }}>{preview.message}</Text> : null}
          </View>
        ) : previewing ? null : (
          <Text style={{ color: C.text3, fontSize: 11.5, textAlign: 'center' }}>填好范围后点「重新估算」看耗时与批次</Text>
        )}

        {resumes.length > 0 ? (
          <View style={{ gap: 8 }}>
            <FieldLabel>断点续审（可选）</FieldLabel>
            {resumes.map((r) => {
              const on = resumeTaskId === r.taskId;
              return (
                <Pressable
                  key={r.taskId}
                  onPress={() => setResumeTaskId(on ? 0 : r.taskId)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.m, backgroundColor: on ? C.goldSoft : 'transparent', borderWidth: 1, borderColor: on ? 'rgba(229,181,88,0.4)' : 'transparent' }}
                >
                  <View style={{ width: 19, height: 19, borderRadius: 7, borderWidth: 1.5, borderColor: on ? C.gold : '#3A4258', backgroundColor: on ? C.gold : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Ionicons name="checkmark" size={12} color="#1A1206" /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ color: on ? C.gold : C.text, fontSize: 13, fontWeight: on ? '700' : '500' }}>从第 {r.lastChapter} 章后续审（任务 #{r.taskId}）</Text>
                    <Text style={{ color: C.text3, fontSize: 11 }} numberOfLines={1}>{r.title}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Pressable
          onPress={start}
          disabled={starting || !session}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: !session ? 0.5 : 1 }}
        >
          {starting ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>
            {starting ? '提交中…' : resumeTaskId ? '断点续审' : '开始通读审稿'}
          </Text>
        </Pressable>
        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>异步执行不占手机，进度在「任务」页；完成后报告与问题清单发到本会话</Text>
      </SheetModal>
    </>
  );
}
