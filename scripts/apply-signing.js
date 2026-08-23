/**
 * expo prebuild 之后、gradle 构建之前执行：
 * 用 GitHub Actions secrets（MOYU_KEYSTORE_BASE64 / MOYU_KEYSTORE_PASSWORD / MOYU_KEYSTORE_ALIAS）
 * 注入 android/app/build.gradle 的 release 签名配置。
 * 签名材料不入库——仓库不携带 keystore 文件与密码（历史版本曾内置明文，已迁移到 secrets）。
 * fork / 未配置 secrets 时自动跳过，保持默认 debug 签名。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle');
const KEYSTORE_OUT = path.join(ROOT, 'android', 'app', 'moyu-release.jks');

const BASE64 = process.env.MOYU_KEYSTORE_BASE64 || '';
const PASSWORD = process.env.MOYU_KEYSTORE_PASSWORD || '';
const ALIAS = process.env.MOYU_KEYSTORE_ALIAS || 'moyu';

if (!fs.existsSync(GRADLE)) {
  console.error('android/app/build.gradle not found — run `npx expo prebuild -p android` first');
  process.exit(1);
}

let g = fs.readFileSync(GRADLE, 'utf8');
if (g.includes('moyu-release.jks')) {
  console.log('signing config already applied');
  process.exit(0);
}

if (!BASE64 || !PASSWORD) {
  console.log('MOYU_KEYSTORE_BASE64 / MOYU_KEYSTORE_PASSWORD not set — keep default debug signing');
  process.exit(0);
}

fs.writeFileSync(KEYSTORE_OUT, Buffer.from(BASE64, 'base64'));

const block = `
    signingConfigs {
        release {
            storeFile file('moyu-release.jks')
            storePassword '${PASSWORD}'
            keyAlias '${ALIAS}'
            keyPassword '${PASSWORD}'
            storeType 'pkcs12'
        }
    }
    // ABI 拆分瘦身：只出 arm64-v8a 单包。include 列表必须与 gradle.properties 的
    // reactNativeArchitectures 一致——编译了哪些 ABI 就拆哪些，不一致会产出缺原生库的坏包
    splits {
        abi {
            enable true
            reset()
            include 'arm64-v8a'
            universalApk false
        }
    }
`;

const replaced = g.replace(/^android\s*\{/m, (m) => `${m}\n${block}`);
if (replaced === g) {
  console.error('failed to locate `android {` block');
  process.exit(1);
}
g = replaced;

// 开启构建缓存与并行编译（配合 CI 的 gradle cache 复用，重复构建提速）
const gp = path.join(ROOT, 'android', 'gradle.properties');
if (fs.existsSync(gp)) {
  let props = fs.readFileSync(gp, 'utf8');
  for (const line of ['org.gradle.caching=true', 'org.gradle.parallel=true']) {
    const key = line.split('=')[0];
    if (!props.includes(key)) props += `\n${line}`;
  }
  fs.writeFileSync(gp, props.endsWith('\n') ? props : `${props}\n`);
  console.log('gradle caching/parallel enabled');
}

if (g.includes('signingConfig signingConfigs.debug')) {
  g = g.replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release');
  console.log('buildTypes release -> signingConfigs.release');
} else {
  console.log('WARN: no `signingConfig signingConfigs.debug` line found; release build may stay unsigned');
}

fs.writeFileSync(GRADLE, g);
console.log('release signing applied (keystore decoded from MOYU_KEYSTORE_BASE64)');
