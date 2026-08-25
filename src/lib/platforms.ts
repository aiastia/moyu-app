/**
 * 投稿平台清单 —— 与网页端 frontend/utils/platforms.ts 同源，想加平台两边同步改。
 * 平台不强制校验（可手动输入任意值），清单只是输入建议。
 */
export const PLATFORM_OPTIONS: string[] = [
  '番茄', '七猫', '起点', '晋江', '纵横', '黑岩', '疯读', '飞卢',
  '知乎盐言', '蛙蛙阅读', 'LOFTER', '番茄短篇', '微信读书', 'QQ阅读',
  '微信公众号', '书旗', '掌阅', '朵朵阅读', '美团', '其他',
];

/** 叙事人称选项 —— 与网页端 frontend/utils/narrative-povs.ts 同源 */
export const NARRATIVE_POV_OPTIONS: string[] = [
  '第三人称',
  '第一人称',
  '第二人称',
  '第三人称有限视角',
  '第三人称全知视角',
];
