import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { C, R } from '@/lib/theme';

/** 轻提示 Toast（useToast 的展示件） */
function ToastView({ message }: { message: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', zIndex: 99 }}>
      <View style={{ backgroundColor: 'rgba(22,26,40,0.97)', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, maxWidth: 320 }}>
        <Text style={{ color: C.text, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>{message}</Text>
      </View>
    </View>
  );
}

/** 返回 [show函数, 挂载节点]；节点放在屏幕根 View 内 */
export function useToast(): [(msg: string) => void, ReactNode] {
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2400);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [show, msg ? <ToastView message={msg} /> : null];
}

/** 小标签 */
export function Chip({ label, fg = C.text2, bg = C.card2, bold = false }: { label: string; fg?: string; bg?: string; bold?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: bold ? '700' : '500' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** 空状态 */
export function EmptyState({ icon = 'library-outline', title, sub }: { icon?: keyof typeof Ionicons.glyphMap; title: string; sub?: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 72, paddingHorizontal: 40, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderSoft }}>
        <Ionicons name={icon} size={30} color={C.gold} />
      </View>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      {sub ? <Text style={{ color: C.text3, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{sub}</Text> : null}
    </View>
  );
}

/** 加载骨架（呼吸脉冲） */
export function Skeleton({ count = 3, height = 116, style }: { count?: number; height?: number; style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={{ gap: 12, ...style }}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={{ height, borderRadius: R.l, backgroundColor: C.card, opacity, borderWidth: 1, borderColor: C.borderSoft }} />
      ))}
    </View>
  );
}

/** 分段标签（可横向滚动，适配多分栏） */
export function SegmentedTabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 1, paddingVertical: 1 }}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: 20,
              backgroundColor: on ? C.goldSoft : C.card,
              borderWidth: 1,
              borderColor: on ? 'rgba(229,181,88,0.4)' : C.borderSoft,
            }}
          >
            <Text style={{ color: on ? C.gold : C.text2, fontSize: 13, fontWeight: on ? '700' : '500' }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** 顶部自定义导航头 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderSoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={{ color: C.text3, fontSize: 12 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** 细进度条 */
export function ProgressBar({ pct, color = C.gold, height = 4, track = '#232A3C' }: { pct: number; color?: string; height?: number; track?: string }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/** 圆形页码章标 */
export function ChapterBadge({ number, written }: { number: number; written: boolean }) {
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: written ? C.goldSoft : 'transparent',
        borderWidth: 1,
        borderColor: written ? 'rgba(229,181,88,0.35)' : C.border,
      }}
    >
      <Text style={{ color: written ? C.gold : C.text3, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
        {number}
      </Text>
    </View>
  );
}

/** 表单字段标签 */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600', marginLeft: 2 }}>{children}</Text>
  );
}

/** 统一样式的文本输入框 */
export function Input({
  height,
  ...rest
}: React.ComponentProps<typeof TextInput> & { height?: number }) {
  return (
    <TextInput
      placeholderTextColor="#5A6170"
      keyboardAppearance="dark"
      {...rest}
      style={[
        {
          backgroundColor: '#0F121B',
          borderWidth: 1,
          borderColor: '#242A3B',
          borderRadius: R.m,
          paddingHorizontal: 13,
          paddingVertical: 0,
          height: height ?? 44,
          color: C.text,
          fontSize: 14.5,
        },
        rest.multiline ? { paddingTop: 10, paddingBottom: 10, height: height ?? 100, textAlignVertical: 'top', lineHeight: 21 } : null,
        rest.style as object,
      ]}
    />
  );
}

/** 底部弹层表单壳：整层半透明遮罩 + 圆角面板浮在上面（圆角缺口透出遮罩色，不会露白边）。
 *  滚动约束必须直接加在 ScrollView 自己身上（具体像素 maxHeight）：只给外层面板 maxHeight
 *  时 ScrollView 会按内容自报全高，面板裁掉溢出但 ScrollView 不认为自己可滚——长表单
 *  （如角色编辑）下半截被裁且拖不动，就是这个问题。 */
export function SheetModal({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { height: winH } = useWindowDimensions();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose}>
        {/* 内层 Pressable 拦截点击，防止点表单误关闭 */}
        <Pressable
          style={{
            backgroundColor: '#141826',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: 36,
            maxHeight: '88%',
            borderWidth: 1,
            borderColor: '#262C3F',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={21} color={C.text2} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: Math.round(winH * 0.62) }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
