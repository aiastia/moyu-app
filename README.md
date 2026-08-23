# 墨鱼写作 · 安卓客户端

[![Build APK](https://github.com/aiastia/moyu-app/actions/workflows/build-apk.yml/badge.svg)](https://github.com/aiastia/moyu-app/actions/workflows/build-apk.yml)

墨鱼写作系统的安卓手机客户端。**不绑定任何服务器**：安装后填入你自部署的服务器地址和账号密码即可使用，适合自托管作者在手机上看书架、追 AI 任务进度、阅读与顺手改稿。

墨色 + 鎏金的阅读向设计，深色模式为默认。

## 功能

- 🔐 **自带服务器配置**：登录页填 `服务器地址 + 用户名 + 密码`，token 本地保存（30 天免登录，过期重登即可）
- 📚 **书架**：作品卡片（封面 / 题材 / 长短篇 / 已写字数 / 目标进度），搜索与下拉刷新
- 📖 **阅读器**：字号调节、夜间 / 纸张 / 护眼三种背景、宋体正文（内置思源宋体）、上一章下一章、自动记住「继续阅读」位置
- ✏️ **章节编辑**：手机端小修标题与正文，保存后服务端自动重算字数
- ✨ **AI 生成**：章节列表一键提交正文生成（可重新生成，带覆盖确认）；大纲分栏支持生成/续写大纲（3或5章）；空章在阅读页直接点「生成本章」
- ➕ **创建新书**：书架右上角「+」，填书名/题材/简介/篇幅/人称/目标字数直接建书
- 🌍 **世界设定管理**：按分类新建/编辑/删除世界设定（地理/历史/力量体系…，分类清单与服务端一致）
- 🎯 **伏笔管理**：状态筛选（计划/已埋/已回收/部分/放弃）、新建编辑、标记埋入/回收/放弃、AI 基于大纲或蓝图自动规划一批伏笔
- 🎭 **角色管理**：新建/编辑角色档案（定位/性格/外貌/背景/动机/弱点…）、删除
- ⚡ **任务管理**：运行中任务一键取消、失败任务重试、删记录、清空已完成
- 📋 **项目详情**：章节 / 大纲 / 角色 / 世界 / 伏笔 / 概况六个分栏
- ⚡ **任务监控**：AI 生成任务的实时进度（运行中 / 排队 / 完成 / 失败），10 秒自动刷新

## 下载安装

1. 到 [Releases](https://github.com/aiastia/moyu-app/releases) 下载最新的 APK：
   - **`…-arm64-v8a.apk`** ← 2018 年之后的绝大多数手机选这个（更小）
   - `…-armeabi-v7a.apk` ← 老款 32 位手机用这个
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

签名材料只存放在 GitHub Actions secrets 中（仓库不携带 keystore 与密码），构建时由 `scripts/apply-signing.js` 解码注入，保证每次 APK 签名一致、可直接覆盖升级。需要自行构建正式签名包时，在仓库 Settings → Secrets and variables → Actions 配置三项：`MOYU_KEYSTORE_BASE64`（keystore 文件的 base64，`base64 < your.jks` 生成）、`MOYU_KEYSTORE_PASSWORD`、`MOYU_KEYSTORE_ALIAS`；未配置时构建自动回落 debug 签名。

历史版本的仓库中曾内置过明文密钥（已删除文件与密码，且迁移到 secrets 后继续沿用同一密钥以保证老包可直接覆盖升级）；git 历史中仍可翻到旧密钥，若在意这一点可彻底轮换：本地 `keytool -genkeypair -storetype pkcs12 -keystore new.jks -alias moyu ...` 生成新密钥后，用 `base64 < new.jks` 更新 `MOYU_KEYSTORE_BASE64` 与 `MOYU_KEYSTORE_PASSWORD` 两个 secrets 即可——代价是已安装用户需卸载旧包后重装（签名变更无法覆盖升级）。

## 许可

MIT
