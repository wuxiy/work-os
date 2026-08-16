# Work-OS

> 本地优先、插件驱动的跨平台开发者工作台 · Tauri 2 + Rust + React
> 面向 macOS（Intel / Apple Silicon / Universal），后续扩展 Windows 与 Linux

```
┌─ Work-OS ─────────────────────────────────────────┐
│  ⌥Space 快速启动器：命令 / 工具 / 手册 统一搜索      │
│  Workbench：首页 · 开发者工具 · 手册 · 插件 · 设置    │
│  Plugin Runtime：JSON / API Client / WebSocket /    │
│  Crypto / Essentials —— 第一方工具即插件            │
└───────────────────────────────────────────────────┘
```

## 核心特性

- **快速启动器（⌥Space / 菜单 ⌘L）**：统一搜索核心命令、插件命令、手册（FTS5 全文/别名/中文）、最近与收藏；粘贴 JSON 自动推荐 JSON 工具并带入内容。
- **插件体系**：`.workos-plugin` 包（ZIP + manifest）、静态 Registry（sha256 校验）、Permission Broker（V0.1 十权限，高危 filesystem/shell 不存在）、独立 WebView 运行、`@work-os/plugin-sdk`（`window.workos` 唯一能力通道）。
- **开发者工具（全部为插件）**：JSON 工作台（格式化/校验/JSONPath/Diff/YAML/TypeScript）、API Client（7 方法、环境变量、cURL 导入导出、Rust 网络栈无 CORS）、WebSocket（Headers/子协议/重连/历史）、加密编码（MD5/SHA/HMAC/AES/RSA/JWT）、高频小工具（UUID/时间戳/正则/URL/Diff/Cron）。
- **手册中心**：Linux 命令手册（219 篇，来自 [jaywcjlove/linux-command](https://github.com/jaywcjlove/linux-command)）离线搜索阅读；手册是独立仓库 + 独立版本的数据插件（[wuxiy/work-os-manual-linux](https://github.com/wuxiy/work-os-manual-linux)）。
- **Local First**：SQLite（FTS5）+ macOS Keychain + 本地插件目录，断网可用；Secret 不落 SQLite。
- **性能**：warm 启动器 ~40ms、手册搜索 ~3ms、插件打开 ~170ms（release 实测埋点）。

## 快速开始

```bash
# 依赖：Node 20+ / pnpm 9+ / Rust stable（含 aarch64-apple-darwin target）
pnpm install
pnpm build:plugin-packages   # 构建并打包 5 个内置插件 → src-tauri/plugins/
pnpm dev                     # tauri dev（内置插件首启自动安装）
```

全局快捷键 **⌥Space** 唤起启动器（亦可用菜单「视图 → 显示/隐藏启动器 ⌘L」）；输入 `json`、`systemctl`、`md5` 等关键词回车。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发模式 |
| `pnpm verify` | lint + typecheck + vitest + cargo check/clippy/test 一键校验 |
| `pnpm build` | 构建插件 + x86_64 .app/.dmg（含更新产物与签名） |
| `pnpm build:universal` | Universal（x86_64 + aarch64） |
| `node tools/workos-cli/bin/workos.mjs manual pack --dir ../work-os-manual-linux` | 打包手册插件 |

更新签名密钥：`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 环境变量（minisign）。

## 仓库结构

```
apps/desktop        Tauri 应用（React 前端 + src-tauri Rust）
packages/           plugin-sdk / plugin-types / command / manual-kit / ui / shared
crates/             permission / storage / network / plugin-runtime / manual / native / core
plugins/            5 个内置插件（独立 Vite 构建，打包为 .workos-plugin）
tools/workos-cli    workos CLI（manual pack 等）
docs/               开发指南与验收报告
../work-os-manual-linux   手册内容仓库（独立 git，独立版本与发布）
```

架构文档：`work-os-product-architecture.md`、`work-os-technical-architecture.md`；验收：`work-os-acceptance-checklist.md` 与 `docs/acceptance-report.md`。

## 插件开发（一分钟）

```ts
// plugins/my-tool/src/main.tsx
import { definePlugin, workos } from '@work-os/plugin-sdk'

export const plugin = definePlugin({
  activate(ctx) {
    workos.lifecycle.onPluginEnter(({ code, payload }) => { /* 启动器带入 */ })
    ctx.commands.register({ id: 'mytool.run', title: '我的工具' })
  },
})
```

manifest.json 声明 id/type/permissions/commands → `pnpm build:plugin-packages` → 首启自动安装；或「设置 → 插件 → 开发者」直接加载本地目录。

## License

MIT
