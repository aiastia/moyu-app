import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type DimensionValue, type ViewStyle } from 'react-native';

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

/** 确认弹窗选项。cancelText 传 '' 隐藏取消按钮（纯提示型，替代单按钮 Alert） */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮红色 */
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

/** 返回 [confirm函数, 挂载节点]；替代原生 Alert.alert 的确认/提示弹窗，风格与 App 一致 */
export function useConfirm(): [(opts: ConfirmOptions) => void, ReactNode] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const show = useCallback((o: ConfirmOptions) => setOpts(o), []);
  const close = useCallback(() => setOpts(null), []);
  const node = opts ? (
    <Modal visible animationType="fade" transparent onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36 }}>
        <Pressable
          onPress={() => {
            close();
            opts.onCancel?.();
          }}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
        />
        <View style={{ backgroundColor: '#141826', borderRadius: 20, borderWidth: 1, borderColor: '#262C3F', padding: 22, width: '100%', maxWidth: 340, gap: 15 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{opts.title}</Text>
          {opts.message ? (
            <Text style={{ color: C.text2, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>{opts.message}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {opts.cancelText !== '' ? (
              <Pressable
                onPress={() => {
                  close();
                  opts.onCancel?.();
                }}
                style={{ flex: 1, height: 42, borderRadius: 13, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: C.text2, fontSize: 14, fontWeight: '600' }}>{opts.cancelText ?? '取消'}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                close();
                opts.onConfirm?.();
              }}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: opts.destructive ? C.sealSoft : C.gold,
                borderWidth: 1,
                borderColor: opts.destructive ? 'rgba(214,90,69,0.4)' : 'rgba(229,181,88,0.2)',
              }}
            >
              <Text style={{ color: opts.destructive ? C.seal : '#1A1206', fontSize: 14, fontWeight: '800' }}>{opts.confirmText ?? '确定'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;
  return [show, node];
}

/** 小标签。maxWidth 用于长文本 chip（如大纲情绪是一长串"xx→xx→xx"），不限制会把同行
 *  的标题挤没（大纲列表行"只见情绪不见标题"的根因） */
export function Chip({ label, fg = C.text2, bg = C.card2, bold = false, maxWidth }: { label: string; fg?: string; bg?: string; bold?: boolean; maxWidth?: DimensionValue }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: bg, maxWidth }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: bold ? '700' : '500' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** 开关行：左侧标签+说明、右侧自绘拨杆（表单里的布尔项，替代系统 Switch 保持风格统一） */
export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ color: C.text3, fontSize: 11 }}>{hint}</Text> : null}
      </View>
      <View style={{ width: 46, height: 27, borderRadius: 14, backgroundColor: value ? C.gold : '#2A3042', padding: 3 }}>
        <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </View>
    </Pressable>
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

/** 多行长文本的初始光标归顶：安卓 EditText 用 value/defaultValue 设入长文本后光标落在
 *  末尾并把视口滚到最后（"打开表单看到的是结尾不是开头"），挂载瞬间给 selection(0,0)
 *  把视口带回顶部，随即将 selection 交还给非受控态，不影响后续手动移动光标 */
function useInitialSelectionToTop(multiline?: boolean) {
  const [sel, setSel] = useState<{ start: number; end: number } | undefined>(undefined);
  const applied = useRef(false);
  useEffect(() => {
    if (!multiline || applied.current) return;
    applied.current = true;
    setSel({ start: 0, end: 0 });
    const t = setTimeout(() => setSel(undefined), 150);
    return () => clearTimeout(t);
  }, [multiline]);
  return sel;
}

/** 统一样式的文本输入框 */
export function Input({
  height,
  ...rest
}: React.ComponentProps<typeof TextInput> & { height?: number }) {
  const initialSel = useInitialSelectionToTop(rest.multiline);
  return (
    <TextInput
      placeholderTextColor="#5A6170"
      keyboardAppearance="dark"
      selection={initialSel}
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

/** 下拉选项。labelFontFamily 让选项按自身字体渲染（阅读器字体预览用） */
export interface SelectOption {
  value: string;
  label: string;
  /** 选项行右侧的补充说明 */
  hint?: string;
  labelFontFamily?: string;
}

/** 表单下拉框：触发器样式与 Input 一致，点开是底部选项弹层（不系统原生弹窗）。
 *  选项弹层的遮罩用绝对定位兄弟节点，面板是普通 View——与 SheetModal 同构，
 *  避免安卓下嵌套 Pressable 的手势协商问题。 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled = false,
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { height: winH } = useWindowDimensions();
  const current = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 7 }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          height: 44,
          paddingHorizontal: 13,
          backgroundColor: pressed ? '#131826' : '#0F121B',
          borderWidth: 1,
          borderColor: '#242A3B',
          borderRadius: R.m,
          opacity: disabled ? 0.55 : 1,
        })}
      >
        <Text
          style={{ color: current ? C.text : '#5A6170', fontSize: 14.5, flex: 1, fontFamily: current?.labelFontFamily }}
          numberOfLines={1}
        >
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={15} color={C.text3} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            onPress={() => setOpen(false)}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
          />
          <View
            style={{
              backgroundColor: '#141826',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: 30,
              borderWidth: 1,
              borderColor: '#262C3F',
              maxHeight: '72%',
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#313A52', alignSelf: 'center', marginBottom: 12 }} />
            <ScrollView style={{ maxHeight: Math.round(winH * 0.5) }} contentContainerStyle={{ gap: 4 }}>
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 13,
                      paddingHorizontal: 14,
                      borderRadius: R.m,
                      backgroundColor: on ? C.goldSoft : pressed ? C.card2 : 'transparent',
                      borderWidth: 1,
                      borderColor: on ? 'rgba(229,181,88,0.4)' : 'transparent',
                    })}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: on ? C.gold : C.text, fontSize: 14.5, fontWeight: on ? '700' : '500', fontFamily: o.labelFontFamily }} numberOfLines={1}>
                        {o.label}
                      </Text>
                      {o.hint ? (
                        <Text style={{ color: C.text3, fontSize: 11.5, lineHeight: 16 }}>{o.hint}</Text>
                      ) : null}
                    </View>
                    {on ? <Ionicons name="checkmark" size={17} color={C.gold} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** 底部弹层表单壳：整层半透明遮罩 + 圆角面板浮在上面（圆角缺口透出遮罩色，不会露白边）。
 *  安卓 Fabric 下长内容弹层的三个坑（v1.5.1 重做）：
 *  1) 遮罩改为绝对定位的兄弟节点，面板不再嵌在带 onPress 的 Pressable 里，父级不参与手势协商；
 *  2) 滚动区高度双保险：除 Yoga 的 maxHeight 外，再用 onContentSizeChange 量到的内容高取
 *     min(内容高, 上限) 作**像素级显式 height**——显式高度下安卓 ScrollView 必然可滚，
 *     不依赖 wrap-content 父容器传约束（ScrollView 自报全高时会出现"下半截被裁且拖不动"）；
 *  3) 打开时 scrollTo(0) 回顶：Modal 首帧可能按内容全高布局、收窄后滚动位置残留在底部，
 *     表现为"弹窗默认滚到最底下"，必须每次打开显式回顶。 */
export function SheetModal({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { height: winH } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [contentH, setContentH] = useState(0);
  const maxScrollH = Math.round(winH * 0.62);

  useEffect(() => {
    if (visible) {
      setContentH(0);
      // 下一帧 + 布局稳定后各回顶一次，清掉首帧全高布局残留的底部偏移
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
      const t = setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 80);
      return () => clearTimeout(t);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
        />
        <View
          style={{
            backgroundColor: '#141826',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 36,
            maxHeight: Math.round(winH * 0.88),
            borderWidth: 1,
            borderColor: '#262C3F',
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#313A52', alignSelf: 'center', marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={21} color={C.text2} />
            </Pressable>
          </View>
          <ScrollView
            ref={scrollRef}
            style={contentH > 0 ? { height: Math.min(contentH, maxScrollH), maxHeight: maxScrollH } : { maxHeight: maxScrollH }}
            contentContainerStyle={{ gap: 12, paddingBottom: 6 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={(_, h) => setContentH(h)}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
