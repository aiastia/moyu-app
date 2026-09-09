import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { C, R } from '@/lib/theme';

/** 后端 /api/auth/captcha-config 下发的 provider（off 在登录页就被拦掉，不进本组件） */
export type CaptchaProvider = 'recaptcha' | 'turnstile';

/**
 * 登录人机验证 widget（reCAPTCHA v2 复选框 / Cloudflare Turnstile）。
 *
 * RN 没有 DOM/SDK 生态，用 WebView 装一个极小本地页 explicit 渲染 widget，
 * token 经 postMessage 回传。几个关键点（对齐网页端 useCaptcha 语义）：
 * - token 一次性（siteverify 会消费）：登录失败后父组件 bump resetKey，
 *   这里注入 JS 调 grecaptcha.reset()/turnstile.reset() 重验，否则重试必撞
 *   timeout-or-duplicate；
 * - reCAPTCHA 的图片挑战弹层是页面里的 fixed 覆盖层，固定矮高度的 WebView
 *   会把它裁掉——页内 MutationObserver 检测挑战 iframe 出现，通知 RN 把
 *   WebView 临时撑高（挑战关掉再回落），全程同一个实例不重挂载、状态不丢；
 * - SDK 加载失败（如 reCAPTCHA 在部分网络不可达）遮罩提示 + 重试按钮，重试
 *   换 key 重挂载整页重来。
 */
function buildWidgetHtml(provider: CaptchaProvider, siteKey: string): string {
  const sdkSrc =
    provider === 'recaptcha'
      ? 'https://www.google.com/recaptcha/api.js?render=explicit&hl=zh-CN&onload=__cbReady'
      : 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__cbReady';
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  #box { display: flex; flex-direction: column; align-items: center; min-height: 40px; padding: 4px 0; }
</style>
</head>
<body>
<div id="box"></div>
<script>
(function () {
  var PROVIDER = ${JSON.stringify(provider)}, SITEKEY = ${JSON.stringify(siteKey)};
  function send(o) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o));
  }
  window.__cbReady = function () {
    try {
      var el = document.getElementById('box');
      if (PROVIDER === 'recaptcha') {
        window.__widget = grecaptcha.render(el, {
          sitekey: SITEKEY, theme: 'dark',
          callback: function (t) { send({ type: 'token', token: t }); },
          'expired-callback': function () { send({ type: 'expired' }); }
        });
      } else {
        window.__widget = turnstile.render(el, {
          sitekey: SITEKEY, theme: 'dark', language: 'zh-cn',
          callback: function (t) { send({ type: 'token', token: t }); },
          'expired-callback': function () { send({ type: 'expired' }); }
        });
      }
      send({ type: 'ready' });
    } catch (e) {
      send({ type: 'load-error' });
    }
  };
  window.__reset = function () {
    try {
      if (window.__widget == null) return;
      if (PROVIDER === 'recaptcha') grecaptcha.reset(window.__widget);
      else turnstile.reset(window.__widget);
    } catch (e) { /* widget 未就绪等场景忽略 */ }
  };
  // 高度回报：widget 渲染完成/自伸缩（Turnstile 挑战态会变高）时同步 RN 侧高度
  function report() {
    send({ type: 'size', height: Math.ceil(document.body.scrollHeight) });
  }
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
  // reCAPTCHA 图片挑战：挑战 iframe 挂进/移出 DOM 时通知 RN 撑高/回落（fixed 覆盖层在矮 WebView 里会被裁掉）
  new MutationObserver(function () {
    var open = !!document.querySelector('iframe[title^="recaptcha challenge"]');
    send({ type: 'challenge', open: open });
    setTimeout(report, 100);
  }).observe(document.body, { childList: true, subtree: true });
  var s = document.createElement('script');
  s.src = ${JSON.stringify(sdkSrc)};
  s.async = true;
  s.onerror = function () { send({ type: 'load-error' }); };
  document.head.appendChild(s);
})();
</script>
</body>
</html>`;
}

export function CaptchaBox({
  provider,
  siteKey,
  origin,
  onToken,
  onExpire,
  resetKey,
}: {
  provider: CaptchaProvider;
  siteKey: string;
  /** 服务器 origin（如 https://mybook.example.com）：作为 WebView baseUrl，
   *  让 widget 的 document.location 落在站点钥注册的域名上（Turnstile/reCAPTCHA
   *  都按 hostname 校验站点钥，about:blank 会被拒）。页面本身不发任何请求到它。 */
  origin: string;
  /** 拿到 token（勾选完成；重验后也会再触发，token 已换新） */
  onToken: (token: string) => void;
  onExpire?: () => void;
  /** 变化即重置 widget（token 一次性：一次提交失败后必须重验） */
  resetKey: number;
}) {
  const webRef = useRef<WebView>(null);
  const { height: winH } = useWindowDimensions();
  // reCAPTCHA 复选框高 78、Turnstile 65；常规高度以页内回报为准，挑战态临时撑到 ~72% 屏高
  const baseH = provider === 'recaptcha' ? 88 : 76;
  const lastSize = useRef(baseH);
  const [height, setHeight] = useState(baseH);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const html = React.useMemo(() => buildWidgetHtml(provider, siteKey), [provider, siteKey]);

  useEffect(() => {
    if (resetKey <= 0) return;
    webRef.current?.injectJavaScript('window.__reset && window.__reset(); true;');
  }, [resetKey]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type?: string; token?: string; height?: number; open?: boolean };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ready':
        setLoadError(false);
        break;
      case 'token':
        if (msg.token) onToken(msg.token);
        break;
      case 'expired':
        onExpire?.();
        break;
      case 'size': {
        if (typeof msg.height !== 'number' || msg.height < 40) break;
        const h = Math.min(640, Math.max(60, msg.height + 8));
        lastSize.current = h;
        if (!challengeOpen) setHeight(h);
        break;
      }
      case 'challenge':
        if (msg.open) {
          setChallengeOpen(true);
          setHeight(Math.min(600, Math.max(lastSize.current, Math.round(winH * 0.72))));
        } else {
          setChallengeOpen(false);
          setHeight(lastSize.current);
        }
        break;
      case 'load-error':
        setLoadError(true);
        break;
    }
  };

  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600', marginLeft: 2 }}>人机验证</Text>
      <View
        style={{
          backgroundColor: '#0F121B',
          borderWidth: 1,
          borderColor: loadError ? '#5A3A3A' : '#242A3B',
          borderRadius: R.m,
          height,
          overflow: 'hidden',
        }}
      >
        <WebView
          ref={webRef}
          key={loadError ? 'retry' : 'first'}
          source={origin ? { html, baseUrl: `${origin}/` } : { html }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          style={{ flex: 1, backgroundColor: 'transparent' }}
        />
        {loadError ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0F121B', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="cloud-offline-outline" size={18} color={C.text3} />
            <Text style={{ color: C.text2, fontSize: 12 }}>验证组件加载失败（验证服务不可达）</Text>
            <Pressable
              onPress={() => setLoadError(false)}
              style={{ paddingHorizontal: 14, height: 30, borderRadius: 8, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: C.gold, fontSize: 12.5, fontWeight: '700' }}>重试</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}
