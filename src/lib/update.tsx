import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { requireNativeModule } from 'expo-modules-core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { ProgressBar, SheetModal } from '@/components/ui';

import { useAuth } from './auth';
import { fmtRelative } from './format';
import { C, R } from './theme';

/** GitHub 仓库与 API 入口可用环境变量覆盖（fork 后自建 releases 时不用改源码；本地联调用假 API） */
const GITHUB_REPO = process.env.EXPO_PUBLIC_GITHUB_REPO || 'aiastia/moyu-app';
const API_BASE = process.env.EXPO_PUBLIC_UPDATE_API_BASE || 'https://api.github.com';

/** 安装包固定落 cache 目录同名文件：重下覆盖旧包，也能识别「上次已下载」免重下 */
const APK_NAME = 'moyu-update.apk';
const KEY_LAST_CHECK = 'moyu.update.lastAutoCheckAt';
const KEY_DISMISSED = 'moyu.update.dismissedTag';
const AUTO_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

interface InstallerModule {
  canRequestInstall(): boolean;
  openInstallPermissionSettings(): Promise<boolean>;
  installApk(path: string): Promise<boolean>;
}

/** 兜底 try/catch：模块没链进包里时降级为「无更新功能」，绝不能让根布局导入即崩（v2.6.0 闪退教训） */
const Installer: InstallerModule | null = (() => {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<InstallerModule>('MoyuInstaller');
  } catch {
    return null;
  }
})();

export const isUpdateSupported = Installer != null;

export interface ReleaseInfo {
  /** "v2.6.0" */
  tagName: string;
  /** "2.6.0" */
  versionName: string;
  apkUrl: string;
  apkName: string;
  apkSize: number;
  notes: string;
  htmlUrl: string;
  publishedAt: string | null;
}

export type UpdatePhase =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'uptodate'; versionName: string }
  | { phase: 'available'; info: ReleaseInfo }
  | { phase: 'downloading'; info: ReleaseInfo; received: number; total: number }
  | { phase: 'downloaded'; info: ReleaseInfo; path: string }
  | { phase: 'error'; message: string };

interface GhAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GhRelease {
  tag_name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  assets?: GhAsset[];
}

/** "v2.6.0" → [2, 6, 0]；每段非数字兜底 0 */
function parseVersion(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((x) => Number(x) || 0);
}

/** 语义化版本逐段比较：remote 是否比 local 新（比对依据用 versionName 而非 versionCode——
 *  release 资产里查不到 code，而 tag 与 app.json version 一直同步递增） */
function isNewer(remote: string, local: string): boolean {
  if (!remote || !local) return false;
  const a = parseVersion(remote);
  const b = parseVersion(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

async function fetchLatestRelease(signal: AbortSignal): Promise<ReleaseInfo | null> {
  const res = await fetch(`${API_BASE}/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = (await res.json()) as GhRelease;
  const assets = (data.assets ?? []).filter((a) => a.name.toLowerCase().endsWith('.apk'));
  // CI 只产 arm64-v8a 单包（apply-signing 拆分）；兜底取第一个 .apk 资产
  const apk = assets.find((a) => a.name.includes('arm64')) ?? assets[0];
  if (!data.tag_name || !apk) return null;
  return {
    tagName: data.tag_name,
    versionName: data.tag_name.replace(/^v/i, ''),
    apkUrl: apk.browser_download_url,
    apkName: apk.name,
    apkSize: apk.size ?? 0,
    notes: (data.body ?? '').trim(),
    htmlUrl: data.html_url ?? `https://github.com/${GITHUB_REPO}/releases`,
    publishedAt: data.published_at ?? null,
  };
}

function fmtBytes(n: number): string {
  if (!n) return '';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.round(n / 1024)}KB`;
}

interface UpdateContextValue {
  state: UpdatePhase;
  sheetOpen: boolean;
  /** manual=用户点按钮触发：失败/已是最新返回 toast 文案；发现新版时自动弹 Sheet 返回 null */
  check: (manual?: boolean) => Promise<string | null>;
  download: () => void;
  cancelDownload: () => void;
  install: () => Promise<void>;
  closeSheet: () => void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function useUpdate(): UpdateContextValue {
  const v = useContext(UpdateContext);
  if (!v) throw new Error('useUpdate must be used within UpdateProvider');
  return v;
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  const [state, setState] = useState<UpdatePhase>({ phase: 'idle' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastPctRef = useRef(0);

  const check = useCallback(async (manual = false): Promise<string | null> => {
    if (!Installer) return null;
    if (abortRef.current) return '正在下载更新，请稍候';
    setState({ phase: 'checking' });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    try {
      const info = await fetchLatestRelease(ac.signal);
      if (!info) {
        setState({ phase: 'error', message: '仓库最新发布里没有可安装的 APK' });
        return '没有找到可安装的新版本';
      }
      const cur = Constants.expoConfig?.version ?? '';
      if (!isNewer(info.versionName, cur)) {
        setState({ phase: 'uptodate', versionName: info.versionName });
        return `已是最新版本 v${info.versionName}`;
      }
      // 同版本安装包已在 cache（上次下过/装到一半退出）→ 直接进已下载态，免重下
      const dest = new File(Paths.cache, APK_NAME);
      if (dest.exists) {
        setState({ phase: 'downloaded', info, path: dest.uri });
        setSheetOpen(true);
        return null;
      }
      setState({ phase: 'available', info });
      const dismissed = await AsyncStorage.getItem(KEY_DISMISSED);
      // 自动检查：用户上次关掉过同版本弹窗就不再打扰；手动检查必弹
      if (manual || dismissed !== info.tagName) setSheetOpen(true);
      return null;
    } catch (e) {
      const aborted = ac.signal.aborted;
      if (manual) {
        setState({ phase: 'error', message: aborted ? '检查超时' : (e instanceof Error ? e.message : String(e)) });
        return aborted ? '检查超时，请稍后再试' : '检查更新失败，请稍后再试';
      }
      // 自动检查失败保持安静，归位 idle 即可
      setState({ phase: 'idle' });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const download = useCallback(() => {
    if (state.phase !== 'available' || !Installer) return;
    const info = state.info;
    const ac = new AbortController();
    abortRef.current = ac;
    lastPctRef.current = 0;
    setState({ phase: 'downloading', info, received: 0, total: info.apkSize });
    void (async () => {
      try {
        const file = await File.downloadFileAsync(info.apkUrl, new File(Paths.cache, APK_NAME), {
          idempotent: true,
          signal: ac.signal,
          onProgress: ({ bytesWritten, totalBytes }) => {
            const total = totalBytes > 0 ? totalBytes : info.apkSize;
            const pct = total > 0 ? Math.floor((bytesWritten / total) * 100) : 0;
            // 每涨 1% 才刷一次 UI，避免 46MB 包的进度回调把界面刷爆
            if (pct >= 100 || pct - lastPctRef.current >= 1) {
              lastPctRef.current = pct;
              setState((s) => (s.phase === 'downloading' ? { ...s, received: bytesWritten, total } : s));
            }
          },
        });
        if (ac.signal.aborted) return;
        setState({ phase: 'downloaded', info, path: file.uri });
      } catch {
        if (ac.signal.aborted) return;
        setState({ phase: 'error', message: '下载失败，请检查网络后重试' });
      } finally {
        abortRef.current = null;
      }
    })();
  }, [state]);

  const cancelDownload = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => (s.phase === 'downloading' ? { phase: 'available', info: s.info } : s));
  }, []);

  const install = useCallback(async () => {
    if (state.phase !== 'downloaded' || !Installer) return;
    try {
      if (!Installer.canRequestInstall()) {
        // 跳系统「安装未知应用」授权页，授权回来后用户再点一次安装
        await Installer.openInstallPermissionSettings();
        return;
      }
      await Installer.installApk(state.path);
    } catch {
      setState({ phase: 'error', message: '安装包已失效（可能被系统清理），请重新下载' });
    }
  }, [state]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    if (state.phase === 'available') {
      AsyncStorage.setItem(KEY_DISMISSED, state.info.tagName).catch(() => undefined);
    }
  }, [state]);

  // 启动后做一次节流自动检查（24h 一次），有新版且未被用户关掉过才弹窗
  useEffect(() => {
    if (!ready) return;
    void (async () => {
      try {
        const last = Number((await AsyncStorage.getItem(KEY_LAST_CHECK)) ?? 0);
        if (Date.now() - last < AUTO_CHECK_INTERVAL) return;
        await AsyncStorage.setItem(KEY_LAST_CHECK, String(Date.now()));
        await check(false);
      } catch {
        // 节流时间戳读不出就当过期重查；检查失败在 check 内部保持安静
      }
    })();
  }, [ready, check]);

  const value = useMemo(
    () => ({ state, sheetOpen, check, download, cancelDownload, install, closeSheet }),
    [state, sheetOpen, check, download, cancelDownload, install, closeSheet]
  );

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <UpdateSheet />
    </UpdateContext.Provider>
  );
}

const BTN = {
  primary: {
    height: 46,
    borderRadius: R.m,
    backgroundColor: C.gold,
    borderWidth: 1,
    borderColor: 'rgba(229,181,88,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  secondary: {
    height: 46,
    borderRadius: R.m,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
} as const;

/** 全局更新弹层：available 展示新版说明/下载，downloading 进度条，downloaded 一键跳系统安装器 */
function UpdateSheet() {
  const { state, sheetOpen, closeSheet, download, cancelDownload, install, check } = useUpdate();
  const info =
    state.phase === 'available' || state.phase === 'downloading' || state.phase === 'downloaded'
      ? state.info
      : null;
  const visible = sheetOpen && (info != null || state.phase === 'error');
  const cur = Constants.expoConfig?.version ?? '';

  return (
    <SheetModal visible={visible} onClose={closeSheet} title="发现新版本">
      {info ? (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                backgroundColor: C.goldSoft,
                borderWidth: 1,
                borderColor: 'rgba(229,181,88,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="cloud-download-outline" size={20} color={C.gold} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>
                v{info.versionName}
                {cur ? <Text style={{ color: C.text3, fontSize: 12, fontWeight: '500' }}>{`（当前 v${cur}）`}</Text> : null}
              </Text>
              <Text style={{ color: C.text3, fontSize: 12 }}>
                {[fmtBytes(info.apkSize), info.publishedAt ? `${fmtRelative(info.publishedAt)}发布` : ''].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>

          {state.phase === 'downloading' ? (
            <View style={{ gap: 8 }}>
              <ProgressBar pct={state.total > 0 ? Math.min(100, Math.round((state.received / state.total) * 100)) : 0} />
              <Text style={{ color: C.text3, fontSize: 12, textAlign: 'center' }}>
                {fmtBytes(state.received) || '0KB'} / {fmtBytes(state.total)}
                {state.total > 0 ? `（${Math.round((state.received / state.total) * 100)}%）` : ''}
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: C.card2, borderRadius: R.m, padding: 12 }}>
              <Text style={{ color: C.text2, fontSize: 12, lineHeight: 19 }} numberOfLines={14}>
                {info.notes || '暂无更新说明'}
              </Text>
            </View>
          )}

          {state.phase === 'downloaded' ? (
            <Text style={{ color: C.text3, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
              首次安装需允许「安装未知应用」：点安装后按系统提示授权，回来再点一次即可
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {state.phase === 'available' ? (
              <>
                <Pressable onPress={closeSheet} style={BTN.secondary}>
                  <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>不再提醒</Text>
                </Pressable>
                <Pressable onPress={download} style={BTN.primary}>
                  <Text style={{ color: '#1A1206', fontSize: 14, fontWeight: '800' }}>
                    {`下载更新${info.apkSize ? `（${fmtBytes(info.apkSize)}）` : ''}`}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {state.phase === 'downloading' ? (
              <Pressable onPress={cancelDownload} style={BTN.secondary}>
                <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>取消下载</Text>
              </Pressable>
            ) : null}
            {state.phase === 'downloaded' ? (
              <>
                <Pressable onPress={closeSheet} style={BTN.secondary}>
                  <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>稍后再说</Text>
                </Pressable>
                <Pressable onPress={() => void install()} style={BTN.primary}>
                  <Text style={{ color: '#1A1206', fontSize: 14, fontWeight: '800' }}>立即安装</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          <Pressable onPress={() => void Linking.openURL(info.htmlUrl)} style={{ alignSelf: 'center', padding: 2 }}>
            <Text style={{ color: C.gold, fontSize: 12 }}>在 GitHub 查看完整更新说明</Text>
          </Pressable>
        </View>
      ) : state.phase === 'error' ? (
        <View style={{ gap: 14 }}>
          <Text style={{ color: C.text2, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>{state.message}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={closeSheet} style={BTN.secondary}>
              <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>关闭</Text>
            </Pressable>
            <Pressable onPress={() => void check(true)} style={BTN.primary}>
              <Text style={{ color: '#1A1206', fontSize: 14, fontWeight: '800' }}>重新检查</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SheetModal>
  );
}
