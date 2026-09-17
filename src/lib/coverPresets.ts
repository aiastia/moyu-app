/** 封面提示词生成档位词表：与后端 frontend/utils/art-styles.ts + dashboard.vue 对齐
 *  （2026-09-17 同步，后端已废题材映射改 AI 全量候选自选 + 评审砍档后的 20 款质感）。
 *  换词表只改本文件；选 auto 时后端把候选清单喂给 AI 按本书气质自选。 */
import type { SelectOption } from '@/components/ui';

// ===== 质感画风（与立绘画风同源，写实→手绘→动漫渐变排序） =====
export const COVER_STYLES: SelectOption[] = [
  { value: 'auto', label: '自动（AI 从清单自选）' },
  { value: 'photo', label: '纪实摄影', hint: '都市/悬疑/纪实' },
  { value: 'semi_realistic', label: '轻写实厚涂', hint: '言情/年代/都市' },
  { value: 'film', label: '胶片写实', hint: '治愈/年代/都市' },
  { value: 'film_cinema', label: '日系胶片电影', hint: '治愈/日常/青春' },
  { value: 'cinematic', label: '电影感插画', hint: '悬疑/虐恋/都市' },
  { value: 'hk_retro', label: '港风复古海报', hint: '民国/年代/复古' },
  { value: 'korean_illust', label: '韩系唯美插画', hint: '现言/甜宠/都市' },
  { value: 'healing', label: '日系治愈水彩', hint: '治愈/甜宠/清新' },
  { value: 'soft_focus', label: '梦幻柔光', hint: '甜宠/幻想/治愈' },
  { value: 'vintage', label: '法式复古绘本', hint: '文艺/绘本/奇幻' },
  { value: 'ghibli', label: '日系动画电影', hint: '治愈/幻想/日常' },
  { value: 'ink', label: '新中式水墨', hint: '志怪/古言/悬疑' },
  { value: 'gongbi', label: '工笔重彩', hint: '宫斗/古言' },
  { value: 'new_chinese_commercial', label: '新国风商业插画', hint: '古言/宅斗/宫斗' },
  { value: 'epic_fantasy', label: '史诗奇幻厚涂', hint: '玄幻/史诗/男频' },
  { value: 'game_cg', label: '游戏CG厚涂', hint: '同人/幻想/仙侠' },
  { value: 'anime', label: '日系动漫插画', hint: '青春/校园/轻小说' },
  { value: 'guofeng', label: '新国风二次元', hint: '古言/宅斗/志怪' },
  { value: 'cel', label: '赛璐璐动画', hint: '轻小说/二次元' },
  { value: 'flat_illustration', label: '高级平涂插画', hint: '轻喜剧/现代/爽文' },
];

// ===== 书名字体材质（30 款） =====
export const COVER_FONTS: SelectOption[] = [
  { value: 'auto', label: '自动（按题材推断）' },
  { value: 'sticker_cream', label: '奶油贴纸手写体' },
  { value: 'jelly_gradient', label: '果冻渐变立体字' },
  { value: 'poster_black', label: '白边大字报黑体' },
  { value: 'bubble_pink', label: '泡泡糖圆体' },
  { value: 'milk_3d', label: '奶油立体字' },
  { value: 'gold_stroke', label: '金边古风字' },
  { value: 'ink_brush', label: '墨韵书法字' },
  { value: 'seal_stamp', label: '印章标题字' },
  { value: 'comic_bold', label: '漫画粗圆字' },
  { value: 'metal_gold', label: '金属浮雕字' },
  { value: 'neon_city', label: '都市霓虹字' },
  { value: 'typewriter', label: '打字机标题' },
  { value: 'handwritten_marker', label: '马克笔手写体' },
  { value: 'gold_brush', label: '鎏金毛笔体' },
  { value: 'gold_kai', label: '烫金工楷' },
  { value: 'warm_handwrite', label: '暖白手写体' },
  { value: 'rustic', label: '暗红锈蚀粗体' },
  { value: 'bronze_gothic', label: '古铜浮雕哥特体' },
  { value: 'stone_weibei', label: '朱砂石面魏碑' },
  { value: 'candy_outline', label: '糖果色卡通体' },
  { value: 'gold_floral', label: '华丽鎏金花体' },
  { value: 'pink_girl', label: '粉金甜宠少女体' },
  { value: 'pearl_3d', label: '珍珠贝母立体字' },
  { value: 'purple_star', label: '紫金星轨梦幻体' },
  { value: 'moonlight_silver', label: '银蓝月光清冷体' },
  { value: 'black_gold', label: '黑金描边霸气体' },
  { value: 'crystal_ice', label: '冰晶蓝仙气体' },
  { value: 'flame_fiery', label: '烈焰燃烧毛笔体' },
  { value: 'jade_antique', label: '翠玉描金篆隶体' },
  { value: 'blood_dark', label: '血色暗黑毛笔体' },
];

// ===== 辅助字体（作者名/副标题等与主书名组合第二种字体；auto=不组合） =====
export const COVER_FONT_SUBS: SelectOption[] = [
  { value: 'auto', label: '不组合（与书名同字体）' },
  ...COVER_FONTS.slice(1),
];

// ===== 光线档位（20 款） =====
export const COVER_LIGHTINGS: SelectOption[] = [
  { value: 'auto', label: '自动（按题材推断）' },
  { value: 'high_key', label: '高调亮光', hint: '甜宠/轻喜剧/现言' },
  { value: 'softbox', label: '影棚柔光', hint: '现言/都市/人物封面' },
  { value: 'soft', label: '柔和档', hint: '甜宠/治愈/日常' },
  { value: 'morning_sun', label: '清晨暖阳', hint: '治愈/甜宠/重生' },
  { value: 'morning_mist', label: '晨雾散射', hint: '仙侠/幻想/治愈' },
  { value: 'dappled_sun', label: '斑驳树影', hint: '青春/古言/乡村' },
  { value: 'snow_bright', label: '雪后晴光', hint: '古言/仙侠/冬日' },
  { value: 'overcast', label: '阴天漫射', hint: '文艺/现实/治愈' },
  { value: 'golden_hour', label: '黄金时刻', hint: '言情/浪漫/怀旧' },
  { value: 'sunset_backlight', label: '夕阳逆光', hint: '言情/青春/浪漫' },
  { value: 'warm_lamp', label: '灯火暖光', hint: '古言/宅斗/夜景' },
  { value: 'candlelight', label: '烛光火光', hint: '宫斗/古言/志怪' },
  { value: 'moonlight', label: '月夜清辉', hint: '志怪/仙侠/悬疑' },
  { value: 'window_side', label: '窗边侧光', hint: '悬疑/民国/都市' },
  { value: 'rain_night', label: '雨夜反光', hint: '悬疑/都市/虐恋' },
  { value: 'neon_night', label: '霓虹夜色', hint: '都市/娱乐圈/现言' },
  { value: 'backlight', label: '逆光轮廓', hint: '情绪张力/青春' },
  { value: 'medium', label: '中间档', hint: '通用/写实' },
  { value: 'caravaggio', label: '卡拉瓦乔强对比', hint: '权谋/悬疑/强爽文' },
  { value: 'volumetric', label: '丁达尔体积光', hint: '仙侠/史诗/神圣' },
];

// ===== 配色方案（16 款） =====
export const COVER_PALETTES: SelectOption[] = [
  { value: 'auto', label: '自动（AI 按故事冲突配色）' },
  { value: 'vermillion_gold', label: '朱红鎏金', hint: '古言/宫斗/婚嫁' },
  { value: 'wine_gold', label: '酒红暗金', hint: '权谋/宅斗' },
  { value: 'azure_jade', label: '青绿米白', hint: '古言/种田清新' },
  { value: 'moonwhite_silver', label: '月白冷银蓝', hint: '仙侠/清冷古言' },
  { value: 'ink_gray', label: '墨黑灰白', hint: '志怪/悬疑' },
  { value: 'sepia_ochre', label: '赭石做旧', hint: '民国/历史/年代' },
  { value: 'forest_earth', label: '森绿土黄', hint: '种田/年代' },
  { value: 'cool_gray', label: '冷灰奶白', hint: '现代禁欲/职场' },
  { value: 'cream_pink', label: '奶油草莓粉', hint: '甜宠/现言' },
  { value: 'dusk_orange', label: '暮色金橙', hint: '都市/现言' },
  { value: 'sunset_pinkpurple', label: '落日粉紫', hint: '青春/浪漫' },
  { value: 'candy_bright', label: '糖果多彩', hint: '轻喜剧/轻小说' },
  { value: 'pearl_bright', label: '珍珠亮白', hint: '治愈/高调明亮' },
  { value: 'black_gold', label: '黑金', hint: '霸总/玄幻暗贵' },
  { value: 'neon_magenta_cyan', label: '霓虹洋红青蓝', hint: '都市夜/娱乐圈' },
  { value: 'mist_blue', label: '雾蓝灰', hint: '悬疑/文艺' },
];

// ===== 整体明度（点名档=覆盖级指令，治出图普遍偏暗） =====
export const COVER_TONES: SelectOption[] = [
  { value: 'auto', label: '自动（AI 按故事气质定）' },
  { value: 'bright', label: '亮调', hint: '浅色亮块主导，不压暗画面' },
  { value: 'neutral', label: '中性调', hint: '明度均衡，暗部留细节' },
  { value: 'dark', label: '暗调', hint: '低明度但主体受光可读' },
];
