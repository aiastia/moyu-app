/**
 * 把 assets-src/*.svg 渲染为 assets/images/ 下的各尺寸 PNG。
 * 用法：npm run icons  （需要已安装 devDependency: sharp）
 */
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'assets', 'images');

const JOBS = [
  ['icon.svg', 'icon.png', 1024],
  ['icon-foreground.svg', 'android-icon-foreground.png', 1024],
  ['icon-background.svg', 'android-icon-background.png', 1024],
  ['icon-monochrome.svg', 'android-icon-monochrome.png', 1024],
  ['splash-icon.svg', 'splash-icon.png', 1024],
  ['icon.svg', 'favicon.png', 64],
];

(async () => {
  for (const [input, output, size] of JOBS) {
    await sharp(path.join(SRC, input))
      .resize(size, size)
      .png()
      .toFile(path.join(OUT, output));
    console.log(`rendered ${output} (${size}x${size})`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
