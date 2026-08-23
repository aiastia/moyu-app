import { LinearGradient } from 'expo-linear-gradient';
import { Image, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useAuthImage } from '@/lib/image';
import { C, COVER_GRADIENTS } from '@/lib/theme';

/**
 * 封面图：优先从服务端拉取（带 Bearer，会话内缓存），失败退回首字鎏金渐变卡。
 * refreshKey 变化会强制重新拉取（封面重新生成后传新值）。
 */
export function CoverArt({
  projectId,
  title,
  width = 72,
  height = 100,
  radius = 10,
  refreshKey = 0,
}: {
  projectId: number;
  title: string;
  width?: number;
  height?: number;
  radius?: number;
  refreshKey?: number;
}) {
  const { api } = useAuth();
  const uri = useAuthImage(api ? `cover:${projectId}` : null, api ? api.coverUrl(projectId) : null, refreshKey);

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
