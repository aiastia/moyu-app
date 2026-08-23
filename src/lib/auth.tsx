import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Api, ApiError, loginRequest, normalizeBaseUrl, type LoginUser } from './api';
import { DEFAULT_READER_PREFS, type ReaderPrefs } from './theme';

const KEY_BASE = 'moyu.baseUrl';
const KEY_TOKEN = 'moyu.token';
const KEY_USER = 'moyu.user';
const KEY_REMEMBER = 'moyu.rememberPwd';
const KEY_PASSWORD = 'moyu.savedPassword';

interface AuthState {
  ready: boolean;
  baseUrl: string | null;
  token: string | null;
  user: LoginUser | null;
}

interface AuthContextValue extends AuthState {
  api: Api | null;
  login: (rawUrl: string, username: string, password: string, remember?: boolean) => Promise<void>;
  /** keepConfig=true（默认）：只清 token，保留服务器地址/账号/记住的密码——用于 401 过期等场景；显式退出登录用 keepConfig=false 全清 */
  logout: (opts?: { keepConfig?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: false, baseUrl: null, token: null, user: null });

  useEffect(() => {
    (async () => {
      try {
        const [[, b], [, t], [, u]] = await AsyncStorage.multiGet([KEY_BASE, KEY_TOKEN, KEY_USER]);
        setState({
          ready: true,
          baseUrl: b ?? null,
          token: t ?? null,
          user: u ? (JSON.parse(u) as LoginUser) : null,
        });
      } catch {
        setState((s) => ({ ...s, ready: true }));
      }
    })();
  }, []);

  const login = useCallback(async (rawUrl: string, username: string, password: string, remember = false) => {
    const base = normalizeBaseUrl(rawUrl);
    const { access_token, user } = await loginRequest(base, username.trim(), password);
    const pairs: [string, string][] = [
      [KEY_BASE, base],
      [KEY_TOKEN, access_token],
      [KEY_USER, JSON.stringify(user)],
      [KEY_REMEMBER, remember ? '1' : '0'],
    ];
    if (remember) pairs.push([KEY_PASSWORD, password]);
    await AsyncStorage.multiSet(pairs);
    if (!remember) await AsyncStorage.removeItem(KEY_PASSWORD).catch(() => undefined);
    setState({ ready: true, baseUrl: base, token: access_token, user });
  }, []);

  const logout = useCallback(async (opts?: { keepConfig?: boolean }) => {
    const keepConfig = opts?.keepConfig !== false;
    const keys = keepConfig ? [KEY_TOKEN] : [KEY_BASE, KEY_TOKEN, KEY_USER, KEY_REMEMBER, KEY_PASSWORD];
    await AsyncStorage.multiRemove(keys).catch(() => undefined);
    setState((s) => (keepConfig ? { ...s, token: null } : { ...s, baseUrl: null, token: null, user: null }));
  }, []);

  const api = useMemo(
    () => (state.baseUrl && state.token ? new Api(state.baseUrl, state.token) : null),
    [state.baseUrl, state.token],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, api, login, logout }),
    [state, api, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** 登录页预填：读取上次用的服务器地址/账号/记住的密码（401 过期后只需重输或一键登录） */
export async function loadSavedLoginInfo(): Promise<{ baseUrl: string; username: string; password: string; remember: boolean }> {
  try {
    const [[, b], [, u], [, p], [, r]] = await AsyncStorage.multiGet([KEY_BASE, KEY_USER, KEY_PASSWORD, KEY_REMEMBER]);
    const user = u ? (JSON.parse(u) as LoginUser) : null;
    return {
      baseUrl: b ?? '',
      username: user?.username ?? '',
      password: p ?? '',
      remember: r === '1',
    };
  } catch {
    return { baseUrl: '', username: '', password: '', remember: false };
  }
}

/** 网络错误转用户友好文案；401 自动登出由调用方处理 */
export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return '无法连接服务器，请检查网络或服务器地址';
  if (e instanceof Error && e.message) return e.message;
  return '出错了，请稍后再试';
}

/** 阅读偏好与“上次阅读”存取 */
const KEY_PREFS = 'moyu.readerPrefs';

export async function loadReaderPrefs(): Promise<ReaderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFS);
    if (raw) return { ...DEFAULT_READER_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_READER_PREFS;
}

export async function saveReaderPrefs(prefs: ReaderPrefs) {
  try {
    await AsyncStorage.setItem(KEY_PREFS, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export function lastReadKey(projectId: number) {
  return `moyu.lastRead.${projectId}`;
}

export async function saveLastRead(projectId: number, chapterId: number) {
  try {
    await AsyncStorage.setItem(lastReadKey(projectId), String(chapterId));
  } catch { /* ignore */ }
}

export async function loadLastRead(projectId: number): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(lastReadKey(projectId));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
