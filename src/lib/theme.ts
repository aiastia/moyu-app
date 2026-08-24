/** 墨色主题：深墨底 + 鎏金点缀 + 朱砂印 */
export const C = {
  bg: '#0B0D13',
  bgSoft: '#10131C',
  card: '#151926',
  card2: '#1B2030',
  border: '#252B3D',
  borderSoft: '#1E2433',

  text: '#EFEAE0',
  text2: '#A6ACBA',
  text3: '#6C7383',

  gold: '#E5B558',
  goldDeep: '#C8963A',
  goldSoft: 'rgba(229,181,88,0.13)',

  seal: '#D65A45',
  sealSoft: 'rgba(214,90,69,0.14)',

  green: '#5FBF8F',
  greenSoft: 'rgba(95,191,143,0.13)',

  blue: '#6AA6E8',
  blueSoft: 'rgba(106,166,232,0.13)',

  purple: '#A78BFA',
  purpleSoft: 'rgba(167,139,250,0.13)',

  danger: '#E25C4A',
} as const;

export const R = { s: 10, m: 14, l: 20, xl: 28 } as const;
export const SP = { xs: 6, s: 10, m: 16, l: 20, xl: 28 } as const;

/** 阅读器背景主题 */
export const READER_THEMES = [
  { key: 'night', name: '夜间', bg: '#0B0D13', text: '#C7CBD6', sub: '#6C7383', card: '#151926' },
  { key: 'paper', name: '纸张', bg: '#F5EFE2', text: '#3A352C', sub: '#8A8272', card: '#EDE5D3' },
  { key: 'green', name: '护眼', bg: '#CCE5CF', text: '#2E3830', sub: '#6E8177', card: '#BBDCBF' },
] as const;
export type ReaderThemeKey = (typeof READER_THEMES)[number]['key'];

/** 阅读器系统字体（安卓通用字体族，设备支持哪个呈现哪个） */
export const READER_FONTS: { key: string; label: string; fontFamily?: string }[] = [
  { key: 'default', label: '默认' },
  { key: 'light', label: '细体', fontFamily: 'sans-serif-light' },
  { key: 'medium', label: '中黑', fontFamily: 'sans-serif-medium' },
  { key: 'serif', label: '宋体', fontFamily: 'serif' },
  { key: 'cursive', label: '手写', fontFamily: 'cursive' },
  { key: 'mono', label: '等宽', fontFamily: 'monospace' },
];

export interface ReaderPrefs {
  fontSize: number;
  theme: ReaderThemeKey;
  fontKey: string;
  /** 行距倍数（1.3–2.4，lineHeight = fontSize × 该值） */
  lineSpacing: number;
  /** 段间距（0–36 px，段与段之间的留白） */
  paraSpacing: number;
  /** 导入的自定义字体显示名（fontKey==='custom' 时生效） */
  customFontLabel?: string;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = { fontSize: 18, theme: 'night', fontKey: 'default', lineSpacing: 1.7, paraSpacing: 14 };

/** 封面兜底渐变组（按项目ID取模），深色系配鎏金/朱砂/黛蓝 */
export const COVER_GRADIENTS: readonly [string, string][] = [
  ['#23283C', '#3A2F16'],
  ['#2C2434', '#40241E'],
  ['#1E2E38', '#17322A'],
  ['#33202E', '#2E1F38'],
  ['#2E2A1E', '#1F3028'],
];
