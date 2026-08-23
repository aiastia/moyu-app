import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';

/** key -> dataURL（null = 已确认无图） */
const imageCache = new Map<string, string | null>();

/** 清缓存（封面重新生成后调用；不传 key 则全清） */
export function clearAuthImageCache(key?: string) {
  if (key === undefined) imageCache.clear();
  else imageCache.delete(key);
}

async function fetchAuthImage(url: string, token: string): Promise<string | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error('read failed'));
    fr.readAsDataURL(blob);
  });
}

/**
 * 带鉴权加载服务端图片（封面/立绘），会话内缓存。
 * 返回 undefined=加载中，null=无图，string=dataURL。
 * refreshKey 变化会强制重新拉取（绕过缓存）。
 */
export function useAuthImage(key: string | null, url: string | null, refreshKey = 0): string | null | undefined {
  const { api } = useAuth();
  const cached = imageCache.get(`${key}:${refreshKey}`);
  const [uri, setUri] = useState<string | null | undefined>(cached);

  useEffect(() => {
    if (!key || !url || !api) return;
    const cacheKey = `${key}:${refreshKey}`;
    if (imageCache.has(cacheKey)) {
      setUri(imageCache.get(cacheKey) ?? null);
      return;
    }
    let alive = true;
    setUri(undefined);
    (async () => {
      try {
        const data = await fetchAuthImage(url, api.token);
        imageCache.set(cacheKey, data);
        if (alive) setUri(data);
      } catch {
        imageCache.set(cacheKey, null);
        if (alive) setUri(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, url, api, refreshKey]);

  return uri;
}
