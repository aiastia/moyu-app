import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader, Toggle, useToast } from '@/components/ui';
import type { ThinkingModes } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

const MODE_GROUPS: { title: string; items: { key: string; label: string; hint: string }[] }[] = [
  {
    title: '设定生成',
    items: [
      { key: 'world', label: '世界观生成', hint: '核心世界观与详细设定' },
      { key: 'character', label: '角色生成', hint: '角色档案与批量生成' },
      { key: 'organization', label: '组织生成', hint: '宗门/家族/商会等势力' },
      { key: 'item', label: '物品生成', hint: '装备/关键道具等' },
      { key: 'location', label: '地点生成', hint: '城市/秘境/建筑等' },
    ],
  },
  {
    title: '大纲与正文',
    items: [
      { key: 'outline', label: '大纲生成', hint: '续写大纲与结构规划' },
      { key: 'expand', label: '大纲展开', hint: '1→N 卷章展开' },
      { key: 'chapter', label: '正文生成', hint: '章节正文（默认关：思考挤占输出预算易写不满字数）' },
      { key: 'polish', label: '润色', hint: '去 AI 味/人化重写' },
    ],
  },
  {
    title: '分析与工具',
    items: [
      { key: 'analysis', label: '剧情分析', hint: '审稿评分与一致性检查' },
      { key: 'inspire', label: '灵感方案', hint: '书名/简介/题材方案' },
      { key: 'title', label: 'AI 换名', hint: '成书后的改名候选' },
      { key: 'brainstorm', label: '脑洞抽卡', hint: '抽卡/反常识题/设定升级' },
      { key: 'timeline', label: '时间线回填', hint: '章节时间锚点定标' },
      { key: 'cover', label: '封面提示词', hint: '封面两段式生成（后端已默认降档 low）' },
    ],
  },
];

/** 思考模式（全账号一份，20260928 后端从项目级提升）：各环节是否启用模型深度思考 */
export default function ThinkingModesScreen() {
  const { api, logout } = useAuth();
  const [toast, toastNode] = useToast();
  const [modes, setModes] = useState<ThinkingModes | null>(null);

  useEffect(() => {
    if (!api) return;
    api
      .getUserThinkingModes()
      .then((r) => setModes(r.modes))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          void logout();
          router.replace('/login');
          return;
        }
        toast(friendlyError(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const toggle = (key: string) => {
    if (!api || !modes) return;
    const m = modes[key];
    if (!m) return;
    const prev = modes;
    const next = { ...modes, [key]: { ...m, enabled: !m.enabled } };
    setModes(next);
    api.updateUserThinkingModes(next).catch((e) => {
      setModes(prev);
      toast(friendlyError(e));
    });
  };

  const groupCount = useCallback((items: { key: string }[]) => {
    if (!modes) return '';
    const on = items.filter((i) => modes[i.key]?.enabled).length;
    return on ? `${on}/${items.length} 开` : '';
  }, [modes]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 12, paddingBottom: 40 }}>
        <ScreenHeader title="思考模式" subtitle="全账号生效，对所有书统一适用" onBack={() => router.back()} />
        {!modes ? (
          <ActivityIndicator color={C.gold} style={{ paddingVertical: 40 }} />
        ) : (
          <>
            <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 17 }}>
              开启后该环节的 AI 会先深度思考再作答（更慢更稳，消耗更多 token）。全部关闭 = 一律按模型通道里的思考参数跑。
            </Text>
            {MODE_GROUPS.map((g) => (
              <View key={g.title} style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700', flex: 1 }}>{g.title}</Text>
                  {groupCount(g.items) ? <Text style={{ color: C.text3, fontSize: 11 }}>{groupCount(g.items)}</Text> : null}
                </View>
                {g.items.map((it) => {
                  const m = modes[it.key];
                  if (!m) return null;
                  return <Toggle key={it.key} label={it.label} hint={it.hint} value={m.enabled} onChange={() => toggle(it.key)} />;
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
