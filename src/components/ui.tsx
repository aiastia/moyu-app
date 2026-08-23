import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, type ViewStyle } from 'react-native';

import { C, R } from '@/lib/theme';

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

/** 分段标签 */
export function SegmentedTabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: R.m, padding: 3, borderWidth: 1, borderColor: C.borderSoft, gap: 2 }}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              borderRadius: R.m - 3,
              backgroundColor: on ? C.card2 : 'transparent',
            }}
          >
            <Text style={{ color: on ? C.gold : C.text2, fontSize: 13, fontWeight: on ? '700' : '500' }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
