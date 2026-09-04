import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { Chip, FieldLabel, Input, SheetModal, useConfirm, useToast } from '@/components/ui';
import type { PortraitEntity, PortraitGalleryEntry, PortraitKind, PortraitPromptItem } from '@/lib/api';
import { friendlyError, useAuth } from '@/lib/auth';
import { clearAuthImageCache, useAuthImage } from '@/lib/image';
import { pollTask } from '@/lib/tasks';
import { C, R } from '@/lib/theme';

const STYLES = [
  { key: 'auto', label: '自动·按题材' },
  { key: 'game_cg', label: '游戏CG' },
  { key: 'anime', label: '日系动漫' },
  { key: 'guofeng', label: '新国风' },
  { key: 'ghibli', label: '吉卜力' },
  { key: 'healing', label: '治愈水彩' },
  { key: 'ink', label: '水墨' },
  { key: 'film', label: '写实胶片' },
  { key: 'photo', label: '纪实摄影' },
];

const VIEWS = [
  { key: 'single', label: '正面立绘' },
  { key: 'turnaround', label: '多视图设定' },
];

const PROMPTS_MAX = 5;
const GALLERY_MAX = 5; // 每视角本地条目上限（外链不计额）

/** 各实体的标题/出图尺寸/预览宽高 */
const KIND_META: Record<PortraitKind, { title: string; size: string; w: number; h: number; icon: keyof typeof Ionicons.glyphMap }> = {
  character: { title: '立绘', size: 'portrait', w: 190, h: 285, icon: 'person-circle-outline' },
  item: { title: '道具立绘', size: 'square', w: 210, h: 210, icon: 'cube-outline' },
  location: { title: '场景图', size: 'landscape', w: 280, h: 175, icon: 'map-outline' },
};

const viewLabel = (v?: string) => (v === 'turnaround' ? '多视图' : '单视角');

/** 画廊角标：出自版本N / 已删除 / 外链 / 上传 / 已保留 */
function galleryTag(entry: PortraitGalleryEntry, prompts: PortraitPromptItem[]): string {
  const pid = entry.prompt_id ?? '';
  if (pid) {
    const idx = prompts.findIndex((p) => p.id === pid);
    return idx >= 0 ? `版本${idx + 1}` : '已删除';
  }
  if ((entry.image ?? '').startsWith('http')) return '外链';
  if (entry.prompt === '（用户上传）') return '上传';
  return '已保留';
}

/** 画廊缩略图：带鉴权拉画廊图片（走 useAuthImage 缓存），右下角来源角标 */
function GalleryThumb({
  url,
  tag,
  onPress,
  onLongPress,
}: {
  url: string | null;
  tag: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
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
      <View
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.62)',
          borderTopLeftRadius: 8,
          paddingHorizontal: 5,
          paddingVertical: 2,
        }}
      >
        <Text style={{ color: '#E8E3D8', fontSize: 9, fontWeight: '600' }}>{tag}</Text>
      </View>
    </Pressable>
  );
}

/** 立绘面板（角色/道具/场景三实体共用）：AI 提示词（≤5 条版本留档）→ 出图（自动入画廊）、上传/外链、版本管理 */
export function PortraitSheet({
  projectId,
  kind,
  entity,
  visible,
  onClose,
  onUpdated,
}: {
  projectId: number;
  kind: PortraitKind;
  entity: PortraitEntity | null;
  visible: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { api } = useAuth();
  const meta = KIND_META[kind];
  const [style, setStyle] = useState('auto');
  const [view, setView] = useState('single');
  const [extra, setExtra] = useState('');
  const [outfit, setOutfit] = useState('');
  // 状态初始化即同步实体当前值：父组件给本组件按实体 id 加 key，换实体/重开即整组件重挂载（无 effect 重置）
  const [prompt, setPrompt] = useState(entity?.reference_prompt ?? '');
  const [prompts, setPrompts] = useState<PortraitPromptItem[]>(entity?.portrait_prompts ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gallery, setGallery] = useState<PortraitGalleryEntry[]>(entity?.portrait_gallery ?? []);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [imgVersion, setImgVersion] = useState(0);
  const [url, setUrl] = useState('');
  const [toast, toastNode] = useToast();
  const [confirm, confirmNode] = useConfirm();

  const hasImage = !!entity?.reference_image && entity.reference_image !== 'manual';
  const portraitUri = useAuthImage(
    visible && hasImage && api ? `portrait:${kind}:${entity!.id}` : null,
    api && entity ? api.portraitUrl(kind, entity.id) : null,
    imgVersion,
  );

  const outfitNames = (kind === 'character' ? (entity?.outfits ?? []) : []).map((o) => o.name).filter(Boolean);
  const selected = prompts.find((p) => p.id === selectedId) ?? null;
  // 归档视角以选中版本的标注为权威，无标注回退视角下拉值（与网页端 effectiveView 同口径）
  const effectiveView = selected?.view || view;

  /** 重拉实体同步版本列表/画廊/工作字段（不覆盖编辑框——编辑框只在生成/载入版本时动） */
  const refreshEntity = async (): Promise<PortraitEntity | null> => {
    if (!api || !entity) return null;
    const list =
      kind === 'character'
        ? await api.getCharacters(projectId)
        : kind === 'item'
          ? await api.getItems(projectId)
          : await api.getLocations(projectId);
    const fresh = (list as PortraitEntity[]).find((x) => x.id === entity.id) ?? null;
    if (fresh) {
      setPrompts(fresh.portrait_prompts ?? []);
      setGallery(fresh.portrait_gallery ?? []);
    }
    return fresh;
  };

  const bumpImage = () => {
    setImgVersion((v) => v + 1);
    clearAuthImageCache();
  };

  /** AI 写提示词；选中版本时带 replace_prompt_id=覆盖该版本内容（不新增） */
  const genPrompt = async () => {
    if (!api || !entity || busy) return;
    setBusy(true);
    setPhase('提示词生成中…');
    try {
      const r = await api.portraitPromptAsync(projectId, kind, entity.id, {
        style,
        view,
        extra_requirements: extra,
        outfit,
        replace_prompt_id: selectedId ?? '',
      });
      await pollTask(api, r.task_id, { onTick: (t) => setPhase(`提示词 ${t.progress ?? 0}%`) });
      const fresh = await refreshEntity();
      const next = (fresh?.reference_prompt ?? '').trim();
      if (next) setPrompt(next);
      onUpdated();
      setPhase('');
      toast(selectedId ? '提示词已重新生成（覆盖该版本）' : '提示词已生成，可编辑后出图');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  /** 保存：选中版本=覆盖该版本内容；未选中=存为新版本（同内容去重，满 5 条只更新工作字段） */
  const savePrompt = async () => {
    if (!api || !entity || busy) return;
    if (!prompt.trim()) {
      toast('提示词内容不能为空');
      return;
    }
    setBusy(true);
    try {
      if (selectedId) {
        const r = await api.updatePortraitPromptItem(projectId, kind, entity.id, selectedId, { content: prompt.trim() });
        setPrompts(r.portrait_prompts ?? []);
        if (r.portrait_gallery) setGallery(r.portrait_gallery);
        onUpdated();
        toast('已保存修改到该版本');
      } else {
        const r = await api.savePortraitPrompt(projectId, kind, entity.id, prompt.trim());
        setPrompts(r.portrait_prompts ?? []);
        onUpdated();
        toast(r.appended ? '已保存，并存为新版本' : '已保存（版本已满5条，本条未入列表）');
      }
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const genImage = async () => {
    if (!api || !entity || busy) return;
    if (!prompt.trim()) {
      toast('先让 AI 写提示词，或自己填一段');
      return;
    }
    setBusy(true);
    setPhase('立绘出图中…');
    try {
      const r = await api.portraitImageAsync(projectId, kind, entity.id, prompt.trim(), {
        size: meta.size,
        view: effectiveView,
        prompt_id: selectedId ?? '',
      });
      await pollTask(api, r.task_id, { onTick: (t) => setPhase(`出图 ${t.progress ?? 0}%`) });
      bumpImage();
      await refreshEntity();
      onUpdated();
      setPhase('');
      toast('立绘已生成（已自动存入画廊）');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const oneTap = async () => {
    if (!api || !entity || busy) return;
    setBusy(true);
    setPhase('提示词生成中…');
    try {
      const p = await api.portraitPromptAsync(projectId, kind, entity.id, {
        style,
        view,
        extra_requirements: extra,
        outfit,
        replace_prompt_id: selectedId ?? '',
      });
      await pollTask(api, p.task_id, { onTick: (t) => setPhase(`提示词 ${t.progress ?? 0}%`) });
      const fresh = await refreshEntity();
      const finalPrompt = (fresh?.reference_prompt ?? '').trim();
      setPrompt(finalPrompt);
      if (!finalPrompt) throw new Error('提示词生成结果为空');
      setPhase('立绘出图中…');
      const img = await api.portraitImageAsync(projectId, kind, entity.id, finalPrompt, {
        size: meta.size,
        view: effectiveView,
        prompt_id: selectedId ?? '',
      });
      await pollTask(api, img.task_id, { onTick: (t) => setPhase(`出图 ${t.progress ?? 0}%`) });
      bumpImage();
      await refreshEntity();
      onUpdated();
      setPhase('');
      toast('立绘已生成（已自动存入画廊）');
    } catch (e) {
      setPhase('');
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  /** 版本点选：载入编辑框+选中；再点同一条=取消选中（编辑框内容保留） */
  const selectPrompt = (p: PortraitPromptItem) => {
    if (selectedId === p.id) {
      setSelectedId(null);
    } else {
      setSelectedId(p.id);
      setPrompt(p.content);
    }
  };

  /** 选中版本移到另一视角组（关联画廊条目服务端同步移组） */
  const moveGroup = async () => {
    if (!api || !entity || !selected || busy) return;
    const target = selected.view === 'turnaround' ? 'single' : 'turnaround';
    setBusy(true);
    try {
      const r = await api.updatePortraitPromptItem(projectId, kind, entity.id, selected.id, { view: target });
      setPrompts(r.portrait_prompts ?? []);
      if (r.portrait_gallery) setGallery(r.portrait_gallery);
      toast(`已移到${viewLabel(target)}组`);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const deletePromptItem = (p: PortraitPromptItem) => {
    if (!api || !entity || busy) return;
    const linked = gallery.filter((g) => (g.prompt_id ?? '') === p.id).length;
    confirm({
      title: '删除提示词版本',
      message: linked
        ? `画廊里有 ${linked} 张图出自这个版本，删除后图片保留、角标变为「已删除」。确定删除？`
        : '删除后腾出名额，可再生成新的。确定删除这个版本？',
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api
          .deletePortraitPromptItem(projectId, kind, entity.id, p.id)
          .then((r) => {
            setPrompts(r.portrait_prompts ?? []);
            if (selectedId === p.id) setSelectedId(null);
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const activateGalleryItem = (entry: PortraitGalleryEntry) => {
    if (!api || !entity || busy) return;
    confirm({
      title: '设为主图',
      message: '把这张画廊图设为当前立绘主图？（出图/上传不再自动覆盖它，直到你显式换图）',
      confirmText: '设为主图',
      onConfirm: () => {
        api
          .activatePortraitGalleryItem(projectId, kind, entity.id, entry.id)
          .then((r) => {
            setGallery(r.portrait_gallery ?? []);
            setPrompt(r.reference_prompt || prompt);
            bumpImage();
            onUpdated();
            toast('已设为主图');
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  const deleteGalleryItem = (entry: PortraitGalleryEntry) => {
    if (!api || !entity || busy) return;
    confirm({
      title: '删除画廊图',
      message: '图片文件一并删除，不可恢复。若是当前主图会同时清空主图引用。',
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api
          .deletePortraitGalleryItem(projectId, kind, entity.id, entry.id)
          .then((r) => {
            setGallery(r.portrait_gallery ?? []);
            bumpImage();
            onUpdated();
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  /** 从相册上传立绘图（转存 PNG 主图 + 自动入画廊，带当前视角与选中版本关联） */
  const pickAndUpload = async () => {
    if (!api || !entity || busy) return;
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
    setPhase('上传立绘中…');
    try {
      const r = await api.uploadPortrait(
        projectId,
        kind,
        entity.id,
        {
          uri: a.uri,
          name: a.fileName ?? `portrait.${a.mimeType === 'image/png' ? 'png' : 'jpg'}`,
          type: a.mimeType || 'image/jpeg',
        },
        { prompt: prompt.trim(), view: effectiveView, prompt_id: selectedId ?? '' },
      );
      setGallery(r.portrait_gallery ?? []);
      bumpImage();
      onUpdated();
      setPhase('');
      toast(r.notice ? `立绘已上传（${r.notice}）` : '立绘已上传');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  /** 外链图床直设立绘（不落盘本地，自动入画廊不计额） */
  const applyUrl = async () => {
    if (!api || !entity || busy) return;
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      toast('请填写 http(s) 开头的图片地址');
      return;
    }
    setBusy(true);
    setPhase('设置外链立绘…');
    try {
      const r = await api.setPortraitUrl(projectId, kind, entity.id, {
        url: url.trim(),
        prompt: prompt.trim(),
        view: effectiveView,
        prompt_id: selectedId ?? '',
      });
      setGallery(r.portrait_gallery ?? []);
      bumpImage();
      onUpdated();
      setUrl('');
      setPhase('');
      toast(r.notice ? `立绘已更新（${r.notice}）` : '立绘已更新（外链）');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  const removeImage = () => {
    if (!api || !entity) return;
    confirm({
      title: '删除立绘',
      message: `删除「${entity.name}」的立绘主图？（提示词与画廊保留，可重新出图）`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        api
          .deletePortraitImage(projectId, kind, entity.id)
          .then(() => {
            bumpImage();
            onUpdated();
            toast('已删除');
          })
          .catch((e) => toast(friendlyError(e)));
      },
    });
  };

  if (!entity) {
    return (
      <>
        {toastNode}
        {confirmNode}
      </>
    );
  }

  const groups: { key: 'single' | 'turnaround'; items: { p: PortraitPromptItem; no: number }[] }[] = (['single', 'turnaround'] as const).map(
    (g) => ({
      key: g,
      items: prompts.map((p, i) => ({ p, no: i + 1 })).filter(({ p }) => (p.view === 'turnaround') === (g === 'turnaround')),
    }),
  );
  const galleryGroups = (['single', 'turnaround'] as const).map((g) => ({
    key: g,
    items: gallery.filter((e) => (e.view === 'turnaround') === (g === 'turnaround')),
    localCount: gallery.filter((e) => (e.view === 'turnaround') === (g === 'turnaround') && (e.image ?? '').startsWith('/data/covers/')).length,
  }));

  return (
    <>
      {toastNode}
      {confirmNode}
      <SheetModal
        visible={visible}
        onClose={() => {
          if (!busy) onClose();
        }}
        title={`${meta.title} · ${entity.name}`}
      >
        {/* 主图预览 */}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: meta.w,
              height: meta.h,
              borderRadius: 16,
              backgroundColor: C.card2,
              borderWidth: 1,
              borderColor: C.border,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {portraitUri ? (
              <Image source={{ uri: portraitUri }} style={{ width: meta.w, height: meta.h }} resizeMode="cover" />
            ) : portraitUri === null ? (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Ionicons name={meta.icon} size={44} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 12 }}>还没有{meta.title}</Text>
              </View>
            ) : (
              <ActivityIndicator color={C.gold} />
            )}
          </View>
          {hasImage ? (
            <Pressable onPress={removeImage} hitSlop={6}>
              <Text style={{ color: C.seal, fontSize: 12 }}>删除主图</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>画风</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7 }}>
            {STYLES.map((s) => (
              <Pressable key={s.key} onPress={() => setStyle(s.key)}>
                <Chip label={s.label} fg={style === s.key ? C.gold : C.text2} bg={style === s.key ? C.goldSoft : C.card2} bold={style === s.key} />
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>视角</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {VIEWS.map((v) => (
              <Pressable key={v.key} onPress={() => setView(v.key)}>
                <Chip label={v.label} fg={view === v.key ? C.gold : C.text2} bg={view === v.key ? C.goldSoft : C.card2} bold={view === v.key} />
              </Pressable>
            ))}
          </View>
        </View>

        {outfitNames.length > 0 ? (
          <View style={{ gap: 8 }}>
            <FieldLabel>装扮</FieldLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7 }}>
              {['', ...outfitNames].map((name) => (
                <Pressable key={name || '__profile__'} onPress={() => setOutfit(name)}>
                  <Chip label={name || '按档案外貌'} fg={outfit === name ? C.gold : C.text2} bg={outfit === name ? C.goldSoft : C.card2} bold={outfit === name} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ gap: 7 }}>
          <FieldLabel>补充要求（可选）</FieldLabel>
          <Input value={extra} onChangeText={setExtra} placeholder="如：穿第二章后的黑斗篷 / 呈现剑身裂纹 / 夜晚雪景" height={40} />
        </View>

        {/* 提示词版本条：按视角分组，点选载入/选中，长按删除 */}
        {prompts.length > 0 ? (
          <View style={{ gap: 7 }}>
            <FieldLabel>提示词版本（{prompts.length}/{PROMPTS_MAX} · 点选载入 · 长按删除）</FieldLabel>
            {groups.map((g) =>
              g.items.length ? (
                <View key={g.key} style={{ gap: 6 }}>
                  <Text style={{ color: C.text3, fontSize: 11 }}>
                    {viewLabel(g.key)}（{g.items.length}）
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7 }}>
                    {g.items.map(({ p, no }) => {
                      const on = selectedId === p.id;
                      return (
                        <Pressable key={p.id} onPress={() => selectPrompt(p)} onLongPress={() => deletePromptItem(p)} delayLongPress={350}>
                          <Chip label={`版本${no}${p.rating ? ` ★${p.rating}` : ''}`} fg={on ? C.gold : C.text2} bg={on ? C.goldSoft : C.card2} bold={on} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null,
            )}
            {selected ? (
              <Pressable onPress={moveGroup} disabled={busy} hitSlop={6}>
                <Text style={{ color: C.blue, fontSize: 12, fontWeight: '700' }}>
                  {selected.view === 'turnaround' ? '↔ 移到单视角组' : '↔ 移到多视图组'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <FieldLabel>{meta.title}提示词（可编辑）</FieldLabel>
            <View style={{ flex: 1 }} />
            <Pressable onPress={savePrompt} disabled={busy} hitSlop={6}>
              <Text style={{ color: C.blue, fontSize: 12, fontWeight: '700' }}>{selected ? '保存修改到这个版本' : '只存提示词（不出图）'}</Text>
            </Pressable>
          </View>
          <Input value={prompt} onChangeText={setPrompt} placeholder="点「AI 写提示词」自动生成" multiline height={110} />
          {selectedId ? (
            <Text style={{ color: C.text3, fontSize: 11 }}>已选中一个版本：出图会关联到它；「AI 写提示词」会覆盖这个版本</Text>
          ) : null}
        </View>

        {/* 画廊：出图/上传/外链自动存档，点按设为主图、长按删除 */}
        <View style={{ gap: 7 }}>
          <FieldLabel>画廊（{gallery.length} 条 · 出图/上传自动存档）</FieldLabel>
          {galleryGroups.map((g) =>
            g.items.length ? (
              <View key={g.key} style={{ gap: 6 }}>
                <Text style={{ color: C.text3, fontSize: 11 }}>
                  {viewLabel(g.key)}（本地 {g.localCount}/{GALLERY_MAX}
                  {g.localCount >= GALLERY_MAX ? '，再出新图会自动替换最早一张' : ''}）
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
                  {g.items.map((entry) => (
                    <GalleryThumb
                      key={entry.id}
                      url={api ? api.portraitGalleryImageUrl(kind, entity.id, entry.id) : null}
                      tag={galleryTag(entry, prompts)}
                      onPress={() => activateGalleryItem(entry)}
                      onLongPress={() => deleteGalleryItem(entry)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null,
          )}
          {gallery.length === 0 ? (
            <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>
              出图、上传、外链都会自动存进画廊（每个视角最多留 5 张本地图，满额自动替换最早的）；点缩略图设为主图、长按删除。
            </Text>
          ) : null}
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
          <Text style={{ color: C.text3, fontSize: 11 }}>或用自己的图</Text>
          <View style={{ height: 1, flex: 1, backgroundColor: C.borderSoft }} />
        </View>
        <Pressable
          onPress={pickAndUpload}
          disabled={busy}
          style={{ height: 44, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={C.text2} />
          <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>上传本地{meta.title}（自己做的图）</Text>
        </Pressable>

        <View style={{ gap: 7 }}>
          <FieldLabel>或用外链图片（图床地址）</FieldLabel>
          <Input value={url} onChangeText={setUrl} placeholder="https://…（http(s) 图片地址）" autoCapitalize="none" autoCorrect={false} />
          <Pressable
            onPress={applyUrl}
            disabled={busy}
            style={{ height: 40, borderRadius: R.m, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>设为{meta.title}</Text>
          </Pressable>
        </View>

        <Text style={{ color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
          AI 出图需要在服务端配置图像生成 API；上传支持 PNG/JPG/WebP（≤15MB）
        </Text>
      </SheetModal>
    </>
  );
}
