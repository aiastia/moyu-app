import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import icon from '../../assets/images/icon.png';
import { CaptchaBox } from '@/components/CaptchaBox';
import { fetchCaptchaConfig, normalizeBaseUrl, type CaptchaConfig } from '@/lib/api';
import { friendlyError, loadSavedLoginInfo, useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

/** 默认服务器地址：构建期注入（CI 走 repo secret，本地开发放 .env.local），源码/仓库不落明文；
 *  未注入时为空串，登录页保持完全手填（公开仓库构建的 APK 不携带任何默认地址） */
const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_DEFAULT_SERVER_URL ?? '';

/** 归一化后比较两个服务器地址是否同一台（尾斜杠/末尾 /api/缺协议视为等价） */
function sameServer(a: string, b: string): boolean {
  try {
    return normalizeBaseUrl(a) === normalizeBaseUrl(b);
  } catch {
    return false;
  }
}

function Field({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  toggle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  toggle?: () => void;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600', marginLeft: 2 }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: '#0F121B',
          borderWidth: 1,
          borderColor: '#242A3B',
          borderRadius: R.m,
          paddingHorizontal: 14,
          height: 50,
        }}
      >
        <Ionicons name={icon} size={17} color={C.text3} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#5A6170"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure}
          keyboardAppearance="dark"
          style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 0 }}
        />
        {toggle ? (
          <Pressable onPress={toggle} hitSlop={8}>
            <Ionicons name={secure ? 'eye-outline' : 'eye-off-outline'} size={19} color={C.text3} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const { login } = useAuth();
  const hasDefault = !!DEFAULT_SERVER_URL;
  const [url, setUrl] = useState('');
  // 自定义服务器勾选：无内置默认地址（未注入 secret 的构建）时恒展开地址栏，保持全手填
  const [customServer, setCustomServer] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  // 人机验证：公开配置在预填就绪后拉一次，服务器地址改动后防抖重拉（off/失败不渲染 widget）
  const [captchaCfg, setCaptchaCfg] = useState<CaptchaConfig>({ provider: 'off', site_key: '' });
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);

  // 预填上次登录信息（token 过期被登出时，通常只需点一下登录）。
  // 上次连的是内置默认服务器 → 不勾自定义、走默认地址；连过其他服务器 → 自动勾选并回填。
  useEffect(() => {
    loadSavedLoginInfo().then((info) => {
      const saved = info.baseUrl.trim();
      const useCustom = !!saved && (!hasDefault || !sameServer(saved, DEFAULT_SERVER_URL));
      setCustomServer(!hasDefault || useCustom);
      setUrl(useCustom ? saved : DEFAULT_SERVER_URL);
      setUsername(info.username);
      setPassword(info.password);
      setRemember(info.remember);
      setReady(true);
    });
  }, [hasDefault]);

  // 取消自定义 → 地址栏回到内置默认；勾上 → 保留当前地址作为修改起点
  const toggleCustomServer = () => {
    const next = !customServer;
    setCustomServer(next);
    if (!next) setUrl(DEFAULT_SERVER_URL);
  };

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const timer = setTimeout(async () => {
      let cfg: CaptchaConfig = { provider: 'off', site_key: '' };
      try {
        cfg = await fetchCaptchaConfig(normalizeBaseUrl(url));
      } catch {
        // 地址空/非法或旧版本后端：按 off 处理
      }
      if (!alive) return;
      setCaptchaCfg(cfg);
      setCaptchaToken('');
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url, ready]);

  const needCaptcha = captchaCfg.provider !== 'off' && !!captchaCfg.site_key;
  // widget 按域名校验站点钥：用服务器 origin 作为 WebView baseUrl（地址没填完时先不带）
  let captchaOrigin = '';
  if (needCaptcha) {
    try {
      captchaOrigin = normalizeBaseUrl(url);
    } catch {
      /* 地址空/非法：先渲染无 baseUrl 的 widget，提交校验会拦 */
    }
  }

  const doLogin = async () => {
    if (busy || !ready) return;
    setError('');
    const missing: string[] = [];
    if (!url.trim()) missing.push('服务器地址');
    if (!username.trim()) missing.push('用户名');
    if (!password) missing.push('密码');
    if (missing.length) {
      setError(`请填写${missing.join('、')}`);
      return;
    }
    if (needCaptcha && !captchaToken) {
      setError('请先完成人机验证');
      return;
    }
    setBusy(true);
    try {
      await login(url, username, password, remember, needCaptcha ? captchaToken : '');
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请重试');
      // token 一次性（siteverify 已消费）：失败后必须重验，否则重试永远撞重复
      if (needCaptcha) {
        setCaptchaToken('');
        setCaptchaReset((v) => v + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  // 预填未就绪时不渲染表单，避免先空白后填充的闪烁
  if (!ready) return null;

  return (
    <LinearGradient colors={['#151A2C', '#0B0D13', '#171106']} locations={[0, 0.5, 1]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SP.xl }} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: 'center', gap: 14, marginBottom: 34 }}>
              <Image
                source={icon}
                style={{ width: 92, height: 92, borderRadius: 26, borderWidth: 1, borderColor: 'rgba(229,181,88,0.35)' }}
              />
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Text style={{ color: C.text, fontSize: 30, fontWeight: '800', letterSpacing: 2 }}>墨鱼写作</Text>
                <Text style={{ color: C.text2, fontSize: 13 }}>连接你自部署的墨鱼写作服务器</Text>
              </View>
            </View>

            <View style={{ backgroundColor: 'rgba(21,25,38,0.88)', borderRadius: R.xl, borderWidth: 1, borderColor: '#262C3F', padding: SP.l, gap: 16 }}>
              {!hasDefault || customServer ? (
                <Field icon="server-outline" label="服务器地址" value={url} onChangeText={setUrl} placeholder="https://your-server.com" />
              ) : null}
              <Field icon="person-outline" label="用户名" value={username} onChangeText={setUsername} placeholder="用户名" />
              <Field
                icon="lock-closed-outline"
                label="密码"
                value={password}
                onChangeText={setPassword}
                placeholder="密码"
                secure={!showPwd}
                toggle={() => setShowPwd((v) => !v)}
              />

              {hasDefault ? (
                <Pressable onPress={toggleCustomServer} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 }}>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      borderWidth: 1.5,
                      borderColor: customServer ? C.gold : '#3A4154',
                      backgroundColor: customServer ? C.gold : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {customServer ? <Ionicons name="checkmark" size={13} color="#1A1206" /> : null}
                  </View>
                  <Text style={{ color: C.text2, fontSize: 13 }}>自定义服务器地址</Text>
                </Pressable>
              ) : null}

              {needCaptcha ? (
                <CaptchaBox
                  key={`${captchaCfg.provider}:${captchaCfg.site_key}`}
                  provider={captchaCfg.provider as 'recaptcha' | 'turnstile'}
                  siteKey={captchaCfg.site_key}
                  origin={captchaOrigin}
                  resetKey={captchaReset}
                  onToken={setCaptchaToken}
                  onExpire={() => setCaptchaToken('')}
                />
              ) : null}

              <Pressable onPress={() => setRemember((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: remember ? C.gold : '#3A4154',
                    backgroundColor: remember ? C.gold : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {remember ? <Ionicons name="checkmark" size={13} color="#1A1206" /> : null}
                </View>
                <Text style={{ color: C.text2, fontSize: 13 }}>记住密码（仅保存在本机）</Text>
              </Pressable>

              {error ? (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: C.sealSoft, borderRadius: 10, padding: 10 }}>
                  <Ionicons name="alert-circle" size={15} color={C.seal} />
                  <Text style={{ color: C.seal, fontSize: 12.5, lineHeight: 17, flex: 1 }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={doLogin}
                disabled={busy}
                style={({ pressed }) => ({
                  height: 50,
                  borderRadius: R.m,
                  backgroundColor: busy ? '#B99447' : C.gold,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#1A1206" />
                ) : (
                  <Ionicons name="log-in-outline" size={19} color="#1A1206" />
                )}
                <Text style={{ color: '#1A1206', fontSize: 16, fontWeight: '800' }}>{busy ? '正在连接…' : '登录'}</Text>
              </Pressable>
            </View>

            <Text style={{ color: C.text3, fontSize: 11.5, textAlign: 'center', marginTop: 26, lineHeight: 17 }}>
              支持墨鱼写作系统自部署服务端{'\n'}登录后可随时在「设置」中切换服务器
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
