import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.borderSoft, padding: SP.l, gap: 12 }}>
      {children}
    </View>
  );
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={C.gold} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: C.text3, fontSize: 11 }}>{label}</Text>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {value || '—'}
        </Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { user, baseUrl, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const name = user?.nickname || user?.username || '未登录';
  const initial = name.trim()[0] ?? '墨';

  const doLogout = () => {
    Alert.alert('退出登录', '将清除本机的登录状态，确定退出吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: SP.l, gap: 14, paddingBottom: 40 }}>
        <ScreenHeader title="设置" />

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 18,
                backgroundColor: C.goldSoft,
                borderWidth: 1,
                borderColor: 'rgba(229,181,88,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: C.gold, fontSize: 22, fontWeight: '800' }}>{initial}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>
                {name}
              </Text>
              <Text style={{ color: C.text3, fontSize: 12 }}>
                {user?.username ? `@${user.username}` : ''}
                {user?.is_admin ? ' · 管理员' : ''}
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>服务器</Text>
          <Row icon="server-outline" label="地址" value={baseUrl ?? ''} />
          <Row icon="time-outline" label="登录有效期" value="Token 30 天，过期后重新登录即可" />
        </Card>

        <Card>
          <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>阅读</Text>
          <Row icon="text-outline" label="字号与背景" value="在阅读页右上角「Aa」中调整" />
          <Row icon="bookmark-outline" label="阅读进度" value="自动记录每本书的最近阅读章节" />
        </Card>

        <Card>
          <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>关于</Text>
          <Row icon="information-circle-outline" label="版本" value="墨鱼写作 v1.0.0" />
          <Pressable onPress={() => Linking.openURL('https://github.com/aiastia/moyu-app')} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="logo-github" size={16} color={C.gold} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ color: C.text3, fontSize: 11 }}>源码与 APK</Text>
              <Text style={{ color: C.gold, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                github.com/aiastia/moyu-app
              </Text>
            </View>
            <Ionicons name="open-outline" size={15} color={C.text3} />
          </Pressable>
        </Card>

        <Pressable
          onPress={doLogout}
          disabled={busy}
          style={{
            height: 50,
            borderRadius: R.m,
            backgroundColor: C.sealSoft,
            borderWidth: 1,
            borderColor: 'rgba(214,90,69,0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={C.seal} />
          ) : (
            <Ionicons name="log-out-outline" size={19} color={C.seal} />
          )}
          <Text style={{ color: C.seal, fontSize: 15, fontWeight: '700' }}>退出登录</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
