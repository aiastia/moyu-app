/**
 * expo prebuild 之后、gradle 构建之前执行：
 * 把仓库根目录的 moyu-release.jks 注入 android/app/build.gradle 的 release 签名配置。
 * 没有 keystore 时（如 fork 构建）自动跳过，保持默认 debug 签名。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle');
const KEYSTORE = path.join(ROOT, 'moyu-release.jks');

if (!fs.existsSync(GRADLE)) {
  console.error('android/app/build.gradle not found — run `npx expo prebuild -p android` first');
  process.exit(1);
}

if (!fs.existsSync(KEYSTORE)) {
  console.log('moyu-release.jks not found — keep default debug signing');
  process.exit(0);
}

let g = fs.readFileSync(GRADLE, 'utf8');
if (g.includes('moyu-release.jks')) {
  console.log('signing config already applied');
  process.exit(0);
}

const PASSWORD = process.env.MOYU_KEYSTORE_PASSWORD || 'moyu2026';
const block = `
    signingConfigs {
        release {
            storeFile file('../../moyu-release.jks')
            storePassword '${PASSWORD}'
            keyAlias 'moyu'
            keyPassword '${PASSWORD}'
            storeType 'pkcs12'
        }
    }
`;

const replaced = g.replace(/^android\s*\{/m, (m) => `${m}\n${block}`);
if (replaced === g) {
  console.error('failed to locate `android {` block');
  process.exit(1);
}
g = replaced;

if (g.includes('signingConfig signingConfigs.debug')) {
  g = g.replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release');
  console.log('buildTypes release -> signingConfigs.release');
} else {
  console.log('WARN: no `signingConfig signingConfigs.debug` line found; release build may stay unsigned');
}

fs.writeFileSync(GRADLE, g);
console.log('release signing applied (keystore: moyu-release.jks)');
