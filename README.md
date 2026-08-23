# 墨鱼写作 · 安卓客户端

[![Build APK](https://github.com/aiastia/moyu-app/actions/workflows/build-apk.yml/badge.svg)](https://github.com/aiastia/moyu-app/actions/workflows/build-apk.yml)

墨鱼写作系统的安卓手机客户端。**不绑定任何服务器**：安装后填入你自部署的服务器地址和账号密码即可使用，适合自托管作者在手机上看书架、追 AI 任务进度、阅读与顺手改稿。

墨色 + 鎏金的阅读向设计，深色模式为默认。

## 功能

- 🔐 **自带服务器配置**：登录页填 `服务器地址 + 用户名 + 密码`，token 本地保存（30 天免登录，过期重登即可）
- 📚 **书架**：作品卡片（封面 / 题材 / 长短篇 / 已写字数 / 目标进度），搜索与下拉刷新
- 📖 **阅读器**：字号调节、夜间 / 纸张 / 护眼三种背景、宋体正文（内置思源宋体）、上一章下一章、自动记住「继续阅读」位置
- ✏️ **章节编辑**：手机端小修标题与正文，保存后服务端自动重算字数
- 📋 **项目详情**：章节 / 大纲 / 角色 / 概况四个分栏
- ⚡ **任务监控**：AI 生成任务的实时进度（运行中 / 排队 / 完成 / 失败），10 秒自动刷新

## 下载安装

1. 到 [Releases](https://github.com/aiastia/moyu-app/releases) 下载最新的 `moyu-writer-vX.X.X.apk`
2. 手机上点击安装，允许「安装未知来源应用」
3. 打开 App，填写你的墨鱼服务器地址（如 `https://your-domain.com`）、用户名、密码，登录即可

> 兼容性：需要服务端为墨鱼写作系统（含 `/api/auth/login` 登录接口与 `/api` REST 接口）。同时支持 `http://` 局域网地址。

## 从源码构建（无需本地安卓环境）

仓库自带 GitHub Actions 打包流水线，fork 后也可直接用：

1. Actions → **Build Android APK** → Run workflow
2. 等待构建完成（约 10–15 分钟），在本次运行的 Artifacts 里下载 `moyu-writer-apk`

本地构建（需要 JDK 21 + Android SDK）：

```bash
npm ci
npx expo prebuild -p android --no-install
node scripts/apply-signing.js
cd android && ./gradlew assembleRelease
```

## 开发

```bash
npm ci
npx expo start          # 本地起 Expo 调试
npm run typecheck       # TypeScript 类型检查
npm run icons           # 修改 assets-src/*.svg 后重新渲染各尺寸图标
```

- 技术栈：Expo SDK 57 · React Native 0.86 · expo-router · TypeScript
- 界面主题在 `src/lib/theme.ts`（墨色 + 鎏金），接口客户端在 `src/lib/api.ts`

## 关于签名

仓库内置了用于本地分发的签名密钥 `moyu-release.jks`（密码 `moyu2026`），保证每次构建的 APK 签名一致、可直接覆盖升级。这是面向自托管社区的分发约定：本应用不上架应用商店、不申请敏感权限（仅联网），泄露密钥的后果仅限于他人可以构建同签名的本应用安装包。若要发布你自己的正式版，请替换为自己的 keystore 并在 Actions secrets 中配置 `MOYU_KEYSTORE_PASSWORD`。

## 许可

MIT
