import { DarkTheme, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.card, text: C.text, border: C.border, primary: C.gold },
};

function Root() {
  const { ready } = useAuth();
  // 字体用系统字体（国产 ROM 默认字体已很好，省 14.8MB 包体；阅读器宋体选项跟随设备字体）

  // 只等登录态读取（AsyncStorage，几十毫秒），避免闪登录页
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
          animation: 'slide_from_right',
          animationDuration: 220,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="create-book" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="project-settings" />
        <Stack.Screen name="styles" />
        <Stack.Screen name="reader" options={{ animation: 'slide_from_bottom', animationDuration: 260 }} />
        <Stack.Screen name="editor" />
      </Stack>
    </>
  );
}

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
