/* app.json 的 android.usesCleartextTraffic 在新版 @expo/config-plugins 里已不再
 * 写入 AndroidManifest（只剩类型声明，无实现），自部署 http 服务器的用户会被
 * 安卓默认的明文流量拦截挡在门外。这里显式把属性补进 <application>，
 * 恢复 app.json 该键原本的语义。 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

function withCleartextHttp(config) {
  // 插件拿到的 exp 已被归一化，未知 android 键会被剥掉，直接读 app.json 原始值
  let enabled = false;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(config._internal?.projectRoot ?? process.cwd(), 'app.json'), 'utf8'));
    enabled = raw?.expo?.android?.usesCleartextTraffic === true;
  } catch { /* 读不到就关闭 */ }
  if (!enabled) return config;
  return withAndroidManifest(config, (cfg) => {
    if (cfg.modResults) {
      const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
}

module.exports = withCleartextHttp;
