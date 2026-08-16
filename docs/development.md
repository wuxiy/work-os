# Work-OS 开发指南

> 技术栈：Tauri 2 / Rust / React + TypeScript / Vite / Tailwind v4 / SQLite (FTS5) / pnpm workspace
> 架构文档见仓库根目录 `work-os-product-architecture.md` 与 `work-os-technical-architecture.md`。

## 目录结构

```
apps/desktop        Tauri 桌面应用（React 前端 + src-tauri Rust）
packages/
  plugin-sdk        @work-os/plugin-sdk —— 插件唯一能力通道（window.workos）
  plugin-types      manifest zod schema（TS 侧校验，与 Rust 双侧一致）
  command           Command Bus 内存注册表（Launcher 唯一依赖）
  manual-kit        手册管线共享库（sync/normalize/validate/build）
  ui                Workbench 设计系统（Radix + Tailwind）
  shared            纯类型与工具
crates/
  permission        Permission Broker（V0.1 权限集）
  storage           SQLite（16 张表）+ FTS5 手册索引
  network           HTTP / WebSocket 统一网络栈（绕过浏览器 CORS）
  plugin-runtime    插件包安装 / manifest 校验 / 静态 Registry
  manual            Manual Runtime 装载（dist 三件套 → FTS5）
  native            macOS Keychain Secret Store
plugins/            内置插件（json-tools / api-client / websocket / crypto-tools / developer-essentials）
tools/workos-cli    workos CLI（manual pack 等）
```

## 常用命令

```bash
pnpm install
pnpm dev              # 构建内置插件 + tauri dev（开发模式）
pnpm typecheck        # 全仓 TS 检查
pnpm test             # vitest（packages + plugins）
cargo test --workspace
pnpm verify           # lint + typecheck + test + cargo check/clippy/test 一键校验
pnpm build            # 全量构建 + 打包 x86_64
pnpm build:universal  # Universal（x86_64 + aarch64）
pnpm build:plugin-packages   # 仅重新打包内置插件
```

## 插件开发

1. `plugins/<name>/` 下开发（参考 json-tools），manifest.json 声明 id/type/permissions/commands。
2. `import { workos, definePlugin } from '@work-os/plugin-sdk'`，一切系统能力经 `workos.*`（Permission Broker 校验）。
3. `pnpm build:plugin-packages` 打包并在下次启动时由 Core 自动引导安装（builtin）。
4. 调试未打包插件：设置 → 插件 → 开发者 → 选择本地目录（Developer Mode）。
5. 分发：`.workos-plugin`（ZIP）+ 静态 registry.json（含 sha256）。

## 手册仓库

独立仓库 `work-os-manual-linux`（remote: https://github.com/wuxiy/work-os-manual-linux），
管线：sync（jaywcjlove/linux-command）→ normalize → validate → build（dist 三件套）→
`workos manual pack` → `linux-manual.workos-plugin` → Work-OS 安装导入 FTS5。
