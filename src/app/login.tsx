import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
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
import { useAuth } from '@/lib/auth';
import { C, R, SP } from '@/lib/theme';

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
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const doLogin = async () => {
    if (busy) return;
    setError('');
    if (!url.trim() || !username.trim() || !password) {
      setError('请填写服务器地址、用户名和密码');
      return;
    }
    setBusy(true);
    try {
      await login(url, username, password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请重试');
    } finally {
      setBusy(false);
    }
  };

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
              <Field icon="server-outline" label="服务器地址" value={url} onChangeText={setUrl} placeholder="https://your-server.com" />
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
