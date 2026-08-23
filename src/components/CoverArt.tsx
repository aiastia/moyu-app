import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { C, COVER_GRADIENTS } from '@/lib/theme';

/** 会话内封面缓存：projectId -> dataURL（null = 无封面） */
const coverCache = new Map<number, string | null>();

/**
 * 封面图：优先从服务端拉取（带 Bearer），失败则退回首字鎏金渐变卡。
 */
export function CoverArt({
  projectId,
  title,
  width = 72,
  height = 100,
  radius = 10,
}: {
  projectId: number;
  title: string;
  width?: number;
  height?: number;
  radius?: number;
}) {
  const { api } = useAuth();
  const cached = coverCache.get(projectId);
  const [uri, setUri] = useState<string | null | undefined>(cached);

  useEffect(() => {
    if (coverCache.has(projectId) || !api) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(api.coverUrl(projectId), {
          headers: { Authorization: `Bearer ${api.token}` },
        });
        if (!res.ok) {
          coverCache.set(projectId, null);
          if (alive) setUri(null);
          return;
        }
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result as string);
          fr.onerror = () => reject(fr.error ?? new Error('read failed'));
          fr.readAsDataURL(blob);
        });
        coverCache.set(projectId, dataUrl);
        if (alive) setUri(dataUrl);
      } catch {
        coverCache.set(projectId, null);
        if (alive) setUri(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, api]);

  if (uri) {
    return <Image source={{ uri }} style={{ width, height, borderRadius: radius, backgroundColor: C.card2 }} />;
  }

  const [g1, g2] = COVER_GRADIENTS[Math.abs(projectId) % COVER_GRADIENTS.length];
  const first = title?.trim()?.[0] ?? '书';
  return (
    <LinearGradient
      colors={[g1, g2]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width, height, borderRadius: radius, alignItems: 'center', justifyContent: 'center', backgroundColor: uri === null ? undefined : C.card2 }}
    >
      <Text style={{ color: 'rgba(239,234,224,0.92)', fontSize: Math.round(width * 0.42), fontWeight: '600' }}>{first}</Text>
      <View style={{ position: 'absolute', right: 6, bottom: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: C.seal, opacity: 0.8 }} />
    </LinearGradient>
  );
}
