import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Input, ScreenHeader, StepperRow, Toggle, useToast } from '@/components/ui';
import type { BestofOptions, FinalRoundCacheOptions, OutlineOptions, PromptModules, ThinkingModes } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

function Card({ title, hint, children, busy }: { title: string; hint?: string; children: React.ReactNode; busy?: boolean }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700', flex: 1 }}>{title}</Text>
        {busy ? <ActivityIndicator size="small" color={C.gold} /> : null}
      </View>
      {hint ? <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>{hint}</Text> : null}
      {children}
    </View>
  );
}

const THINKING_MODE_LABEL: Record<string, string> = {
  world: '世界观生成',
  character: '角色生成',
  outline: '大纲生成',
  expand: '大纲展开',
  chapter: '正文生成',
  polish: '润色',
  analysis: '剧情分析',
};

/** 项目设定：把网页端「项目设置」里移动端高频的开关搬过来，改一项存一项 */
export default function ProjectSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const { api, logout } = useAuth();
  const [toast, toastNode] = useToast();

  const [outlineOpts, setOutlineOpts] = useState<OutlineOptions | null>(null);
  const [outlineBatch, setOutlineBatch] = useState<number | null>(null);
  const [bestof, setBestof] = useState<BestofOptions | null>(null);
  const [chapterTarget, setChapterTarget] = useState<number | null>(null);
  const [autoRewrite, setAutoRewrite] = useState<{ auto_rewrite_low_score: boolean; auto_rewrite_threshold: number } | null>(null);
  const [finalRound, setFinalRound] = useState<FinalRoundCacheOptions | null>(null);
  const [modules, setModules] = useState<PromptModules | null>(null);
  const [thinking, setThinking] = useState<ThinkingModes | null>(null);
  const [englishExclude, setEnglishExclude] = useState<string | null>(null);
  const [savingExclude, setSavingExclude] = useState(false);
  const [extraRules, setExtraRules] = useState<string | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [autoRelation, setAutoRelation] = useState<boolean | null>(null);

  const guard = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }
      toast(friendlyError(e));
    },
    [logout, toast],
  );

  const load = useCallback(async () => {
    if (!api || Number.isNaN(projectId)) return;
    const jobs: Promise<void>[] = [
      api.getOutlineOptions(projectId).then((r) => setOutlineOpts(r)).catch((e) => guard(e)),
      api.getOutlineBatchSize(projectId).then((r) => setOutlineBatch(r.outline_batch_size)).catch(() => setOutlineBatch(0)),
      api.getBestof(projectId).then(setBestof).catch(() => undefined),
      api.getChapterTarget(projectId).then((r) => setChapterTarget(r.chapter_target_words)).catch(() => setChapterTarget(0)),
      api.getAutoRewrite(projectId).then(setAutoRewrite).catch(() => undefined),
      api.getFinalRoundCache(projectId).then(setFinalRound).catch(() => undefined),
      api.getPromptModules(projectId).then(setModules).catch(() => undefined),
      api.getThinkingModes(projectId).then((r) => setThinking(r.modes)).catch(() => undefined),
      api.getEnglishExclude(projectId).then((r) => setEnglishExclude(r.english_scan_exclude ?? '')).catch(() => setEnglishExclude('')),
      api.getExtraWritingRules(projectId).then((r) => setExtraRules(r.extra_writing_rules ?? '')).catch(() => setExtraRules('')),
      api.getAutoRelation(projectId).then((r) => setAutoRelation(r.auto_relation_on_create)).catch(() => setAutoRelation(null)),
    ];
    await Promise.all(jobs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, projectId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /** 通用「改一项存一项」：先改本地，PUT 失败再回滚提示 */
  const put = async (apply: () => Promise<unknown>, rollback?: () => void) => {
    if (!api) return;
    try {
      await apply();
    } catch (e) {
      rollback?.();
      await guard(e);
    }
  };

  const saveExclude = () => {
    if (!api || englishExclude === null || savingExclude) return;
    setSavingExclude(true);
    api
      .updateEnglishExclude(projectId, { english_scan_exclude: englishExclude })
      .then(() => toast('已保存'))
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setSavingExclude(false));
  };

  const saveRules = () => {
    if (!api || extraRules === null || savingRules) return;
    setSavingRules(true);
    api
      .updateExtraWritingRules(projectId, extraRules)
      .then(() => toast('已保存'))
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setSavingRules(false));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 12, paddingBottom: 40 }}>
        <ScreenHeader title="项目设定" subtitle="生成行为开关，改一项立即生效" onBack={() => router.back()} />

        <Card title="大纲生成" hint="影响续写大纲与大纲展开时的自动行为">
          {outlineOpts ? (
            <>
              <Toggle
                label="自动填充实体"
                hint="生成大纲时自动带出出场角色与涉及组织"
                value={outlineOpts.auto_fill_entities}
                onChange={(v) => {
                  const prev = outlineOpts;
                  setOutlineOpts({ ...outlineOpts, auto_fill_entities: v });
                  put(
                    () => api!.updateOutlineOptions(projectId, { auto_fill_entities: v, auto_plan_foreshadows: outlineOpts.auto_plan_foreshadows }),
                    () => setOutlineOpts(prev),
                  );
                }}
              />
              <Toggle
                label="自动规划伏笔"
                hint="续写大纲后自动规划本章伏笔"
                value={outlineOpts.auto_plan_foreshadows}
                onChange={(v) => {
                  const prev = outlineOpts;
                  setOutlineOpts({ ...outlineOpts, auto_plan_foreshadows: v });
                  put(
                    () => api!.updateOutlineOptions(projectId, { auto_fill_entities: outlineOpts.auto_fill_entities, auto_plan_foreshadows: v }),
                    () => setOutlineOpts(prev),
                  );
                }}
              />
            </>
          ) : (
            <ActivityIndicator color={C.gold} />
          )}
          {outlineBatch != null ? (
            <StepperRow
              label="大纲续写批量"
              hint="一键连写/续写时每批的大纲章数"
              value={outlineBatch}
              step={1}
              min={1}
              max={10}
              onChange={(v) => {
                setOutlineBatch(v);
                api?.updateOutlineBatchSize(projectId, { outline_batch_size: v }).catch((e) => guard(e));
              }}
            />
          ) : null}
        </Card>

        <Card title="正文生成" hint="多版择优与单章字数目标">
          {bestof ? (
            <>
              <Toggle
                label="黄金三章双版择优"
                hint="第 1–3 章生成两版自动取审稿分高者（耗时约 2 倍）"
                value={bestof.golden3_bestof2}
                onChange={(v) => {
                  const prev = bestof;
                  setBestof({ ...bestof, golden3_bestof2: v });
                  put(
                    () => api!.updateBestof(projectId, { golden3_bestof2: v, climax_bestof2: bestof.climax_bestof2 }),
                    () => setBestof(prev),
                  );
                }}
              />
              <Toggle
                label="高潮章双版择优"
                hint="分篇关键里程碑章也走双版择优"
                value={bestof.climax_bestof2}
                onChange={(v) => {
                  const prev = bestof;
                  setBestof({ ...bestof, golden3_bestof2: bestof.golden3_bestof2, climax_bestof2: v });
                  put(
                    () => api!.updateBestof(projectId, { golden3_bestof2: bestof.golden3_bestof2, climax_bestof2: v }),
                    () => setBestof(prev),
                  );
                }}
              />
            </>
          ) : (
            <ActivityIndicator color={C.gold} />
          )}
          {chapterTarget != null ? (
            <StepperRow
              label="单章目标字数"
              hint="生成正文时的默认字数目标"
              value={chapterTarget}
              step={500}
              min={1000}
              max={8000}
              format={(v) => `${v} 字`}
              onChange={(v) => {
                setChapterTarget(v);
                api?.updateChapterTarget(projectId, { chapter_target_words: v }).catch((e) => guard(e));
              }}
            />
          ) : null}
        </Card>

        <Card title="质量与自动重写" hint="剧情分析后对低分章的自动处理">
          {autoRewrite ? (
            <>
              <Toggle
                label="低分自动重写"
                hint={`评分低于阈值时自动重写（阈值 ${autoRewrite.auto_rewrite_threshold}）`}
                value={autoRewrite.auto_rewrite_low_score}
                onChange={(v) => {
                  const prev = autoRewrite;
                  setAutoRewrite({ ...autoRewrite, auto_rewrite_low_score: v });
                  put(
                    () => api!.updateAutoRewrite(projectId, { auto_rewrite_low_score: v, auto_rewrite_threshold: autoRewrite.auto_rewrite_threshold }),
                    () => setAutoRewrite(prev),
                  );
                }}
              />
              <StepperRow
                label="重写阈值"
                hint="低于该分才触发自动重写"
                value={autoRewrite.auto_rewrite_threshold}
                step={0.5}
                min={6}
                max={9.5}
                format={(v) => `${v.toFixed(1)} 分`}
                onChange={(v) => {
                  setAutoRewrite({ ...autoRewrite, auto_rewrite_threshold: v });
                  api?.updateAutoRewrite(projectId, { auto_rewrite_low_score: autoRewrite.auto_rewrite_low_score, auto_rewrite_threshold: v }).catch((e) => guard(e));
                }}
              />
            </>
          ) : (
            <ActivityIndicator color={C.gold} />
          )}
        </Card>

        {modules?.modules_info && Object.keys(modules.modules_info).length > 0 ? (
          <Card title="提示词模块" hint="按需开关注入正文的写作手法模块">
            {Object.entries(modules.modules_info).map(([key, info]) => (
              <Toggle
                key={key}
                label={info.label ?? key}
                hint={info.desc}
                value={modules.modules[key] ?? false}
                onChange={(v) => {
                  const prev = modules;
                  const next = { ...modules.modules, [key]: v };
                  setModules({ ...modules, modules: next });
                  put(
                    () => api!.updatePromptModules(projectId, next),
                    () => setModules(prev),
                  );
                }}
              />
            ))}
          </Card>
        ) : null}

        {thinking ? (
          <Card title="思考模式" hint="各环节是否启用模型的深度思考（更慢但更稳）">
            {Object.keys(THINKING_MODE_LABEL).map((key) => {
              const m = thinking[key];
              if (!m) return null;
              return (
                <Toggle
                  key={key}
                  label={THINKING_MODE_LABEL[key] ?? key}
                  value={m.enabled}
                  onChange={(v) => {
                    const prev = thinking;
                    const next = { ...thinking, [key]: { ...m, enabled: v } };
                    setThinking(next);
                    put(
                      () => api!.updateThinkingModes(projectId, next),
                      () => setThinking(prev),
                    );
                  }}
                />
              );
            })}
          </Card>
        ) : null}

        {finalRound ? (
          <Card title="终轮稳定性" hint="生成最后一步的工具与格式约束，乱码/跑偏时开">
            <Toggle
              label="终轮保留工具调用"
              hint="最终轮次仍允许调用工具"
              value={finalRound.final_round_keep_tools}
              onChange={(v) => {
                const prev = finalRound;
                setFinalRound({ ...finalRound, final_round_keep_tools: v });
                put(
                  () => api!.updateFinalRoundCache(projectId, { final_round_keep_tools: v, final_round_json_align: finalRound.final_round_json_align }),
                  () => setFinalRound(prev),
                );
              }}
            />
            <Toggle
              label="终轮 JSON 对齐"
              hint="强约束最终输出的 JSON 结构"
              value={finalRound.final_round_json_align}
              onChange={(v) => {
                const prev = finalRound;
                setFinalRound({ ...finalRound, final_round_json_align: v });
                put(
                  () => api!.updateFinalRoundCache(projectId, { final_round_keep_tools: finalRound.final_round_keep_tools, final_round_json_align: v }),
                  () => setFinalRound(prev),
                );
              }}
            />
          </Card>
        ) : null}

        <Card title="写作规则与角色" hint="注入本书生成的附加写作规则，与角色自动关系分析">
          {extraRules !== null ? (
            <>
              <Input value={extraRules} onChangeText={setExtraRules} placeholder={'附加写作规则（多行），如：\n战斗场面多用短句\n避免「竟然」等词'} multiline height={100} />
              <Pressable onPress={saveRules} disabled={savingRules} style={{ height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
                {savingRules ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={16} color="#1A1206" />}
                <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{savingRules ? '保存中…' : '保存规则'}</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={C.gold} />
          )}
          {autoRelation !== null ? (
            <Toggle
              label="新建角色自动关系分析"
              hint="手动建角色/批量生成后，自动分析 TA 与已有角色的关系"
              value={autoRelation}
              onChange={(v) => {
                const prev = autoRelation;
                setAutoRelation(v);
                put(
                  () => api!.updateAutoRelation(projectId, v),
                  () => setAutoRelation(prev),
                );
              }}
            />
          ) : null}
        </Card>

        <Card title="英文排除词" hint="AI 痕迹扫描时忽略的英文词（每行一个，如 API、app）">
          {englishExclude !== null ? (
            <>
              <Input value={englishExclude} onChangeText={setEnglishExclude} placeholder={'API\napp\nOK'} multiline height={100} />
              <Pressable onPress={saveExclude} disabled={savingExclude} style={{ height: 44, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
                {savingExclude ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={16} color="#1A1206" />}
                <Text style={{ color: '#1A1206', fontSize: 14.5, fontWeight: '800' }}>{savingExclude ? '保存中…' : '保存'}</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={C.gold} />
          )}
        </Card>

        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>同人设定、AI 模型等低频配置请在网页端管理</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
