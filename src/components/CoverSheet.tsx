import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { Chip, FieldLabel, Input, SheetModal, useConfirm, useToast } from '@/components/ui';
import type { CoverGalleryEntry, CoverPromptItem } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { clearAuthImageCache, useAuthImage } from '@/lib/image';
import { pollTask } from '@/lib/tasks';
import { C, R } from '@/lib/theme';

const SIZES = [
  { key: '1024x1536', label: '竖版 2:3' },
  { key: '864x1536', label: '竖版 9:16' },
  { key: '1024x1024', label: '方形 1:1' },
  { key: '1536x864', label: '横版 16:9' },
];

/** 清晰度档位：空串=走接口默认（dall-e 系列不认该参数，服务端白名单外不传） */
const QUALITIES = [
  { key: '', label: '默认' },
  { key: 'low', label: '低' },
  { key: 'medium', label: '中' },
  { key: 'high', label: '高' },
];

const GALLERY_MAX = 5;

/** 画廊缩略图：带鉴权拉画廊图片（走 useAuthImage 缓存） */
function GalleryThumb({ url, onPress, onLongPress }: { url: string | null; onPress: () => void; onLongPress: () => void }) {
  const uri = useAuthImage(url, url);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        width: 62,
        height: 88,
        borderRadius: 10,
        backgroundColor: C.card2,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: 62, height: 88 }} resizeMode="cover" />
      ) : uri === null ? (
        <Ionicons name="image-outline" size={20} color={C.text3} />
      ) : (
        <ActivityIndicator size="small" color={C.gold} />
      )}
    </Pressable>
  );
}

/** 封面生成：AI 提示词（≤5 条列表留档）→ 出图（可一键链式），支持保留画廊/上传/外链 */
export function CoverSheet({ projectId, initialPrompt, onCoverChanged }: { projectId: number; initialPrompt?: string | null; onCoverChanged: () => void }) {
  const { api } = useAuth();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1536');
  const [quality, setQuality] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();
  // 提示词列表（服务端 cover_prompts，末位=最新）与保留画廊；打开面板时拉一次项目详情
  const [promptItems, setPromptItems] = useState<CoverPromptItem[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [gallery, setGallery] = useState<CoverGalleryEntry[]>([]);

  /** 拉项目详情同步提示词列表与画廊；items 非空时默认选中最新一条 */
  const syncProject = async () => {
    if (!api) return null;
    const proj = await api.getProject(projectId);
    const items = proj.cover_prompts ?? [];
    setPromptItems(items);
    setGallery(proj.cover_gallery ?? []);
    return { proj, items };
  };

  const openSheet = () => {
    setPrompt(initialPrompt ?? '');
    setPhase('');
    setSelectedPromptId(null);
    setOpen(true);
    // 面板已开再异步拉详情：有留档提示词时切到最新一条（cover_prompt 兼容字段=最旧一条，不读它）
    syncProject()
      .then((r) => {
        if (!r || !r.items.length) return;
        const latest = r.items[r.items.length - 1];
        setSelectedPromptId(latest.id);
        setPrompt(latest.content);
      })
      .catch(() => {});
  };

  const refreshAfterImage = () => {
    clearAuthImageCache();
    onCoverChanged();
    syncProject().catch(() => {});
  };

  const genPrompt = async () => {
    if (!api || busy) return;
    setBusy(true);
    setPhase('提示词生成中…');
    try {
      const r = await api.coverPromptAsync(projectId);
      await pollTask(api, r.task_id, { onTick: (t) => setPhase(`提示词 ${t.progress ?? 0}%`) });
      const { items } = (await syncProject()) ?? { items: [] };
      if (items.length) {
        const latest = items[items.length - 1];
        setSelectedPromptId(latest.id);
        setPrompt(latest.content);
      }
      setPhase('');
      toast('提示词已生成并留档，可直接出图或修改后再出');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const genImage = async () => {
    if (!api || busy) return;
    if (!prompt.trim()) {
      toast('先让 AI 写提示词，或自己填一段');
      return;
    }
    setBusy(true);
    setPhase('封面出图中…');
    try {
      const r = await api.coverImageAsync(projectId, prompt.trim(), size, quality);
      await pollTask(api, r.task_id, { onTick: (t) => setPhase(`出图 ${t.progress ?? 0}%`) });
      refreshAfterImage();
      setOpen(false);
      toast('封面已生成');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const oneTap = async () => {
    if (!api || busy) return;
    setBusy(true);
    setPhase('提示词生成中…');
    try {
      const p = await api.coverPromptAsync(projectId);
      await pollTask(api, p.task_id, { onTick: (t) => setPhase(`提示词 ${t.progress ?? 0}%`) });
      const { items } = (await syncProject()) ?? { items: [] };
      const finalPrompt = items.length ? items[items.length - 1].content : '';
      setPrompt(finalPrompt);
      if (items.length) setSelectedPromptId(items[items.length - 1].id);
      if (!finalPrompt.trim()) throw new Error('提示词生成结果为空');
      setPhase('封面出图中…');
      const img = await api.coverImageAsync(projectId, finalPrompt, size, quality);
      await pollTask(api, img.task_id, { onTick: (t) => setPhase(`出图 ${t.progress ?? 0}%`) });
      refreshAfterImage();
      setOpen(false);
      toast('封面已生成');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  /** 把编辑过的提示词保存回选中的留档条目（列表制没有新建口，生成新词才会追加） */
  const savePrompt = async () => {
    if (!api || busy) return;
    if (!selectedPromptId) {
      toast('先在上方选中一条留档提示词再保存');
      return;
    }
    if (!prompt.trim()) {
      toast('提示词内容不能为空');
      return;
    }
    setBusy(true);
    try {
      const r = await api.updateCoverPromptItem(projectId, selectedPromptId, { content: prompt.trim() });
      setPromptItems(r.cover_prompts ?? []);
      toast('提示词已保存');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const deletePromptItem = (item: CoverPromptItem) => {
    if (!api || busy) return;
    confirm({
      title: '删除提示词',
      message: '删除后腾出名额，可再生成新的。确定删除这条留档提示词？',
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api
          .deleteCoverPromptItem(projectId, item.id)
          .then((r) => {
            setPromptItems(r.cover_prompts ?? []);
            if (selectedPromptId === item.id) setSelectedPromptId(null);
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  /** 保留当前封面进画廊（主图复制独立文件，与当前提示词成对存档；≤5 张） */
  const keepToGallery = async () => {
    if (!api || busy) return;
    setBusy(true);
    try {
      const r = await api.keepCoverGallery(projectId, prompt.trim());
      setGallery(r.cover_gallery ?? []);
      toast('已保留当前封面进画廊');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const activateGalleryItem = (entry: CoverGalleryEntry) => {
    if (!api || busy) return;
    confirm({
      title: '设为封面',
      message: '把这张保留的图设为当前封面？书架/投稿/导出会随之切换。',
      confirmText: '设为封面',
      onConfirm: () => {
        api
          .activateCoverGalleryItem(projectId, entry.id)
          .then(() => {
            clearAuthImageCache();
            onCoverChanged();
            toast('已设为封面');
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const deleteGalleryItem = (entry: CoverGalleryEntry) => {
    if (!api || busy) return;
    confirm({
      title: '删除保留封面',
      message: '图片文件一并删除，不可恢复。若是当前封面会同时清空封面引用。',
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api
          .deleteCoverGalleryItem(projectId, entry.id)
          .then((r) => {
            setGallery(r.cover_gallery ?? []);
            clearAuthImageCache();
            onCoverChanged();
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  /** 从手机相册选一张图上传当封面（服务端转存 PNG 覆盖式保存，≤15MB）。
   *  库选择器走系统 UI，无需预先申请相册权限（v57 文档明确）。 */
  const pickAndUpload = async () => {
    if (!api || busy) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: false,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (a.fileSize && a.fileSize > 15 * 1024 * 1024) {
      toast('图片超过 15MB 上限');
      return;
    }
    setBusy(true);
    setPhase('上传封面中…');
    try {
      const r = await api.uploadCover(projectId, {
        uri: a.uri,
        name: a.fileName ?? `cover.${a.mimeType === 'image/png' ? 'png' : 'jpg'}`,
        type: a.mimeType || 'image/jpeg',
      });
      clearAuthImageCache();
      onCoverChanged();
      setOpen(false);
      toast(`封面已上传（${r.size || `${a.width}x${a.height}`}）`);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  /** 外链封面地址（Input 受控值） */
  const [url, setUrl] = useState('');

  /** 直接把外部图床地址设为封面（不落盘本地，http(s) 开头） */
  const applyUrl = async () => {
    if (!api || busy) return;
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      toast('请填写 http(s) 开头的图片地址');
      return;
    }
    setBusy(true);
    setPhase('设置外链封面…');
    try {
      await api.setCoverUrl(projectId, url.trim());
      clearAuthImageCache();
      onCoverChanged();
      setOpen(false);
      setUrl('');
      toast('封面已更新（外链）');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  return (
    <View>
      {toastNode}
      {confirmNode}
      <Pressable
        onPress={openSheet}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          height: 44,
          borderRadius: R.m,
          backgroundColor: pressed ? '#3A2F16' : C.goldSoft,
          borderWidth: 1,
          borderColor: 'rgba(229,181,88,0.4)',
        })}
      >
        <Ionicons name="image-outline" size={16} color={C.gold} />
        <Text style={{ color: C.gold, fontSize: 14, fontWeight: '700' }}>封面</Text>
      </Pressable>

      <SheetModal visible={open} onClose={() => !busy && setOpen(false)} title="AI 生成封面">
        <View style={{ gap: 9 }}>
          <FieldLabel>尺寸</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {SIZES.map((s) => {
              const on = size === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setSize(s.key)}
                  style={{
                    paddingHorizontal: 15,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? C.goldSoft : C.card,
                    borderWidth: 1,
                    borderColor: on ? 'rgba(229,181,88,0.4)' : C.borderSoft,
                  }}
                >
                  <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <FieldLabel>清晰度</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {QUALITIES.map((q) => {
              const on = quality === q.key;
              return (
                <Pressable
                  key={q.key}
                  onPress={() => setQuality(q.key)}
                  style={{
                    paddingHorizontal: 15,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? C.goldSoft : C.card,
                    borderWidth: 1,
                    borderColor: on ? 'rgba(229,181,88,0.4)' : C.borderSoft,
                  }}
                >
                  <Text style={{ color: on ? C.gold : C.text2, fontSize: 12.5, fontWeight: on ? '700' : '500' }}>{q.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {promptItems.length > 0 ? (
          <View style={{ gap: 7 }}>
            <FieldLabel>留档提示词（{promptItems.length}/{GALLERY_MAX}，点选切换 · 长按删除）</FieldLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7 }}>
              {[...promptItems].reverse().map((item) => {
                const on = selectedPromptId === item.id;
                const title = item.content.length > 12 ? `${item.content.slice(0, 12)}…` : item.content;
                return (
                  <Pressable key={item.id} onPress={() => { setSelectedPromptId(item.id); setPrompt(item.content); }} onLongPress={() => deletePromptItem(item)} delayLongPress={350}>
                    <Chip label={item.rating ? `${title} ★${item.rating}` : title} fg={on ? C.gold : C.text2} bg={on ? C.goldSoft : C.card2} bold={on} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <FieldLabel>封面提示词（可编辑）</FieldLabel>
            <View style={{ flex: 1 }} />
            {selectedPromptId ? (
              <Pressable onPress={savePrompt} disabled={busy} hitSlop={6}>
                <Text style={{ color: C.blue, fontSize: 12, fontWeight: '700' }}>保存到留档</Text>
              </Pressable>
            ) : null}
          </View>
          <Input value={prompt} onChangeText={setPrompt} placeholder="点「AI 写提示词」自动生成，或自己描述画面" multiline height={130} />
        </View>

        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <FieldLabel>保留画廊（{gallery.length}/{GALLERY_MAX}）</FieldLabel>
            <View style={{ flex: 1 }} />
            <Pressable onPress={keepToGallery} disabled={busy} hitSlop={6}>
              <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700' }}>＋保留当前封面</Text>
            </Pressable>
          </View>
          {gallery.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
              {gallery.map((entry) => (
                <GalleryThumb
                  key={entry.id}
                  url={api ? api.coverGalleryImageUrl(projectId, entry.id) : null}
                  onPress={() => activateGalleryItem(entry)}
                  onLongPress={() => deleteGalleryItem(entry)}
                />
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>
              重新出图/上传会覆盖当前封面；点「保留」先把满意的版本存进画廊（与提示词成对留档），随时可设回封面。
            </Text>
          )}
        </View>

        {phase ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
            <ActivityIndicator size="small" color={C.gold} />
            <Text style={{ color: C.text2, fontSize: 12.5 }}>{phase}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={oneTap}
          disabled={busy}
          style={{ height: 46, borderRadius: R.m, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
        >
          {busy ? <ActivityIndicator size="small" color="#1A1206" /> : <Ionicons name="sparkles" size={16} color="#1A1206" />}
          <Text style={{ color: '#1A1206', fontSize: 15, fontWeight: '800' }}>一键生成（提示词 + 出图）</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={genPrompt}
            disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>只要提示词</Text>
          </Pressable>
          <Pressable
            onPress={genImage}
            disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>用当前提示词出图</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <View style={{ height: 1, flex: 1, backgroundColor: C.borderSoft }} />
          <Text style={{ color: C.text3, fontSize: 11 }}>或</Text>
          <View style={{ height: 1, flex: 1, backgroundColor: C.borderSoft }} />
        </View>
        <Pressable
          onPress={pickAndUpload}
          disabled={busy}
          style={{ height: 44, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={C.text2} />
          <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>上传本地封面（自己做的图）</Text>
        </Pressable>

        <View style={{ gap: 7 }}>
          <FieldLabel>或用外链封面（图床地址）</FieldLabel>
          <Input value={url} onChangeText={setUrl} placeholder="https://…（http(s) 图片地址）" autoCapitalize="none" autoCorrect={false} />
          <Pressable
            onPress={applyUrl}
            disabled={busy}
            style={{ height: 40, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>设为封面</Text>
          </Pressable>
        </View>

        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
          AI 出图需要在服务端配置图像生成 API；上传本地封面支持 PNG/JPG/WebP（≤15MB）
        </Text>
      </SheetModal>
    </View>
  );
}
