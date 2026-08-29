import { LinearGradient } from 'expo-linear-gradient';
import { Image, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useAuthImage } from '@/lib/image';
import { C, COVER_GRADIENTS } from '@/lib/theme';

/**
 * 封面图：remoteUrl 是外链封面（http(s)，直连不带鉴权）时直接加载；
 * 否则从服务端拉取（带 Bearer，会话内缓存），thumb=true 走 320px 缩略图端点（列表用省流量）。
 * 都没有时退回首字鎏金渐变卡。refreshKey 变化会强制重新拉取（封面重新生成后传新值）。
 */
export function CoverArt({
  projectId,
  title,
  width = 72,
  height = 100,
  radius = 10,
  refreshKey = 0,
  remoteUrl,
  thumb = false,
}: {
  projectId: number;
  title: string;
  width?: number;
  height?: number;
  radius?: number;
  refreshKey?: number;
  /** 项目的外链封面地址（book.cover / project.cover_url），http(s) 才生效 */
  remoteUrl?: string | null;
  /** 用缩略图端点（bookshelf 列表；大图详情页不要开） */
  thumb?: boolean;
}) {
  const { api } = useAuth();
  const isExternal = !!remoteUrl && /^https?:\/\//i.test(remoteUrl);
  // hook 无条件调用（外链只是参数为 null，不跳过执行）
  const authUri = useAuthImage(
    api ? `cover${thumb ? '-thumb' : ''}:${projectId}` : null,
    api && !isExternal ? (thumb && api.coverThumbUrl ? api.coverThumbUrl(projectId) : api.coverUrl(projectId)) : null,
    refreshKey,
  );
  const uri = isExternal ? remoteUrl! : authUri;

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
