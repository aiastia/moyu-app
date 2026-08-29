import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FieldLabel, Input, ScreenHeader, SelectField, useToast } from '@/components/ui';
import { friendlyError, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

const EMBED_MODE_OPTIONS = [
  { value: 'local_first', label: '本地优先', hint: '本地服务可用就不走 API' },
  { value: 'api_first', label: 'API 优先', hint: '优先走 API，失败回落本地' },
  { value: 'api_only', label: '仅 API', hint: '只用 API 通道' },
];

/** 单个通道的表单态（apiKey 空串=未改动；保存时按已配置与否决定传「•••••」保留） */
interface ChannelForm {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled?: boolean;
}

function CardShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 12 }}>
      <View style={{ gap: 3 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>{title}</Text>
        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }}>{sub}</Text>
      </View>
      {children}
    </View>
  );
}

export default function ModelChannelsScreen() {
  const { api } = useAuth();
  const [toast, toastNode] = useToast();

  const [loading, setLoading] = useState(true);
  const [emb, setEmb] = useState<ChannelForm & { mode: string }>({ baseUrl: '', apiKey: '', model: '', mode: 'local_first' });
  const [embKeyed, setEmbKeyed] = useState(false);
  const [rewrite, setRewrite] = useState<ChannelForm>({ baseUrl: '', apiKey: '', model: '' });
  const [rewriteKeyed, setRewriteKeyed] = useState(false);
  const [image, setImage] = useState<ChannelForm>({ baseUrl: '', apiKey: '', model: '', enabled: true });
  const [imageKeyed, setImageKeyed] = useState(false);
  /** 各通道远端模型候选（拉不到就是空数组，模型字段回退手输） */
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState('');
  /** 重建进度 */
  const [rebuild, setRebuild] = useState<{ running: boolean; done?: number; total?: number; failed?: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadModels = useCallback(
    (channel: 'rewrite' | 'image' | 'embedding') => {
      if (!api) return;
      api
        .getSceneRemoteModels(channel)
        .then((r) => setModels((m) => ({ ...m, [channel]: r.models ?? [] })))
        .catch(() => undefined);
    },
    [api],
  );

  useEffect(() => {
    if (!api) return;
    // 首载拉三通道配置；setState 均在 await 之后（异步回调），非同步级联
    (async () => {
      try {
        const [e, r, i] = await Promise.all([
          api.getEmbeddingConfig().catch(() => null),
          api.getSceneChannelConfig('rewrite').catch(() => null),
          api.getSceneChannelConfig('image').catch(() => null),
        ]);
        if (e) {
          setEmb({ baseUrl: e.base_url ?? '', apiKey: '', model: e.model ?? '', mode: e.mode || 'local_first' });
          setEmbKeyed(e.api_key_configured);
        }
        if (r) {
          setRewrite({ baseUrl: r.base_url ?? '', apiKey: '', model: r.model ?? '' });
          setRewriteKeyed(r.api_key_configured);
        }
        if (i) {
          setImage({ baseUrl: i.base_url ?? '', apiKey: '', model: i.model ?? '', enabled: i.enabled ?? true });
          setImageKeyed(i.api_key_configured);
        }
      } finally {
        setLoading(false);
      }
      loadModels('embedding');
      loadModels('rewrite');
      loadModels('image');
    })();
  }, [api, loadModels]);

  // 重建期间轮询进度（2s），结束自停
  useEffect(() => {
    if (!rebuild?.running) return;
    pollRef.current = setInterval(() => {
      api
        ?.getEmbeddingRebuildStatus()
        .then((s) => setRebuild({ running: !!s.running, done: s.done, total: s.total, failed: s.failed }))
        .catch(() => undefined);
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [rebuild?.running, api]);

  /** PUT 通道。keyed=服务端已存过 key 且用户没输入新的 → 传「•••••」保留 */
  const save = (channel: 'embedding' | 'rewrite' | 'image') => {
    if (!api || saving) return;
    setSaving(channel);
    const body =
      channel === 'embedding'
        ? { model: emb.model.trim(), base_url: emb.baseUrl.trim(), api_key: emb.apiKey || (embKeyed ? '•••••' : ''), mode: emb.mode }
        : (() => {
            const f = channel === 'rewrite' ? rewrite : image;
            const keyed = channel === 'rewrite' ? rewriteKeyed : imageKeyed;
            return {
              base_url: f.baseUrl.trim(),
              api_key: f.apiKey || (keyed ? '•••••' : ''),
              model: f.model.trim(),
              ...(channel === 'image' ? { enabled: image.enabled ?? true } : {}),
            };
          })();
    const call = channel === 'embedding' ? api.updateEmbeddingConfig(body as never) : api.updateSceneChannelConfig(channel, body);
    call
      .then(() => {
        if (channel === 'embedding') setEmbKeyed(true);
        else if (channel === 'rewrite') setRewriteKeyed(true);
        else setImageKeyed(true);
        toast('已保存');
      })
      .catch((e) => toast(friendlyError(e)))
      .finally(() => setSaving(''));
  };

  const testEmbedding = () => {
    if (!api) return;
    api
      .testEmbedding({ use_saved: true })
      .then((r) => {
        const dims = (r as { dimensions?: number }).dimensions;
        toast(dims ? `连通正常（向量维度 ${dims}）` : '连通正常');
      })
      .catch((e) => toast(friendlyError(e)));
  };

  const startRebuild = () => {
    if (!api) return;
    api
      .rebuildEmbeddingIndex()
      .then((r) => {
        if (r.ok) {
          toast(r.message ?? '重建已启动');
          setRebuild({ running: true, done: 0, total: 0, failed: 0 });
        } else {
          toast(r.message ?? '已有重建任务在跑');
        }
      })
      .catch((e) => toast(friendlyError(e)));
  };

  const refreshModels = (channel: 'rewrite' | 'image' | 'embedding') => {
    if (!api) return;
    api
      .refreshSceneModels(channel)
      .then((r) => {
        setModels((m) => ({ ...m, [channel]: r.models ?? [] }));
        toast('模型列表已刷新');
      })
      .catch((e) => toast(friendlyError(e)));
  };

  const modelField = (channel: 'rewrite' | 'image' | 'embedding', value: string, onChange: (v: string) => void) =>
    (models[channel]?.length ?? 0) > 0 ? (
      <SelectField
        label="模型"
        value={value}
        options={models[channel].map((m) => ({ value: m, label: m }))}
        onChange={onChange}
      />
    ) : (
      <View style={{ gap: 6 }}>
        <FieldLabel>模型</FieldLabel>
        <Input value={value} onChangeText={onChange} placeholder="模型名（未配置凭据时手输）" autoCapitalize="none" />
      </View>
    );

  const keyPlaceholder = (keyed: boolean) => (keyed ? '已配置（留空保留原 Key）' : 'API Key');

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        {toastNode}
        <ScreenHeader title="模型通道" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.gold} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {toastNode}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SP.l, gap: 14, paddingBottom: 40 }}>
        <ScreenHeader title="模型通道" subtitle="按场景给不同服务商配独立通道" onBack={() => router.back()} />

        <CardShell title="记忆向量（Embedding）" sub="记忆检索的向量化通道；换模型后记得重建索引">
          <View style={{ gap: 6 }}>
            <FieldLabel>接口地址</FieldLabel>
            <Input value={emb.baseUrl} onChangeText={(v) => setEmb((f) => ({ ...f, baseUrl: v }))} placeholder="https://…（OpenAI 兼容）" autoCapitalize="none" />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>API Key</FieldLabel>
            <Input value={emb.apiKey} onChangeText={(v) => setEmb((f) => ({ ...f, apiKey: v }))} placeholder={keyPlaceholder(embKeyed)} secureTextEntry autoCapitalize="none" />
          </View>
          {modelField('embedding', emb.model, (v) => setEmb((f) => ({ ...f, model: v })))}
          <SelectField label="模式" value={emb.mode} options={EMBED_MODE_OPTIONS} onChange={(v) => setEmb((f) => ({ ...f, mode: v }))} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => save('embedding')}
              disabled={saving === 'embedding'}
              style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: saving === 'embedding' ? 0.7 : 1 }}
            >
              {saving === 'embedding' ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={15} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 14, fontWeight: '800' }}>保存</Text>
            </Pressable>
            <Pressable onPress={testEmbedding} style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>测试连通</Text>
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: C.borderSoft }} />
          <Pressable onPress={startRebuild} disabled={rebuild?.running} style={{ height: 42, borderRadius: R.m, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: 'rgba(106,166,232,0.4)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: rebuild?.running ? 0.6 : 1 }}>
            <Ionicons name="sync-outline" size={15} color={C.blue} />
            <Text style={{ color: C.blue, fontSize: 13.5, fontWeight: '700' }}>{rebuild?.running ? '重建中…' : '重建记忆向量索引'}</Text>
          </Pressable>
          {rebuild ? (
            <Text style={{ color: C.text3, fontSize: 11.5, textAlign: 'center' }}>
              {rebuild.running ? `进行中 ${rebuild.done ?? 0}/${rebuild.total ?? 0}${rebuild.failed ? ` · 失败 ${rebuild.failed}` : ''}` : '空闲'}
            </Text>
          ) : null}
        </CardShell>

        <CardShell title="润色通道" sub="整章/段级润色与去 AI 味走这条通道；不配置则回落主接口">
          <View style={{ gap: 6 }}>
            <FieldLabel>接口地址</FieldLabel>
            <Input value={rewrite.baseUrl} onChangeText={(v) => setRewrite((f) => ({ ...f, baseUrl: v }))} placeholder="https://…（留空用主接口）" autoCapitalize="none" />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>API Key</FieldLabel>
            <Input value={rewrite.apiKey} onChangeText={(v) => setRewrite((f) => ({ ...f, apiKey: v }))} placeholder={keyPlaceholder(rewriteKeyed)} secureTextEntry autoCapitalize="none" />
          </View>
          {modelField('rewrite', rewrite.model, (v) => setRewrite((f) => ({ ...f, model: v })))}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => save('rewrite')}
              disabled={saving === 'rewrite'}
              style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: saving === 'rewrite' ? 0.7 : 1 }}
            >
              {saving === 'rewrite' ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={15} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 14, fontWeight: '800' }}>保存</Text>
            </Pressable>
            <Pressable onPress={() => refreshModels('rewrite')} style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>刷新模型列表</Text>
            </Pressable>
          </View>
        </CardShell>

        <CardShell title="图像通道" sub="封面/立绘出图通道；不配置则回落主接口">
          <View style={{ gap: 6 }}>
            <FieldLabel>接口地址</FieldLabel>
            <Input value={image.baseUrl} onChangeText={(v) => setImage((f) => ({ ...f, baseUrl: v }))} placeholder="https://…（留空用主接口）" autoCapitalize="none" />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>API Key</FieldLabel>
            <Input value={image.apiKey} onChangeText={(v) => setImage((f) => ({ ...f, apiKey: v }))} placeholder={keyPlaceholder(imageKeyed)} secureTextEntry autoCapitalize="none" />
          </View>
          {modelField('image', image.model, (v) => setImage((f) => ({ ...f, model: v })))}
          <Pressable onPress={() => setImage((f) => ({ ...f, enabled: !(f.enabled ?? true) }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 7,
                borderWidth: 1,
                borderColor: image.enabled ? 'rgba(229,181,88,0.55)' : C.border,
                backgroundColor: image.enabled ? C.goldSoft : C.card2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {image.enabled ? <Ionicons name="checkmark" size={13} color={C.gold} /> : null}
            </View>
            <Text style={{ color: C.text2, fontSize: 12.5 }}>启用独立图像通道（关闭走主接口）</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => save('image')}
              disabled={saving === 'image'}
              style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, opacity: saving === 'image' ? 0.7 : 1 }}
            >
              {saving === 'image' ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="checkmark" size={15} color="#1A1206" />}
              <Text style={{ color: '#1A1206', fontSize: 14, fontWeight: '800' }}>保存</Text>
            </Pressable>
            <Pressable onPress={() => refreshModels('image')} style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>刷新模型列表</Text>
            </Pressable>
          </View>
        </CardShell>

        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
          Key 只存服务端、不会回显；留空保存即保留原值
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
