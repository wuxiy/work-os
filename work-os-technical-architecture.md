# Work-OS 技术架构

> 版本：V0.4  
> Target：macOS Intel + Apple Silicon  
> 架构关键词：Tauri 2 / Plugin First / Local First / Secure Runtime / Manual as Data Plugin

---

## 1. 技术选型

```text
Desktop Runtime     Tauri 2
Native Backend      Rust
Frontend            React + TypeScript
Bundler             Vite
UI Primitive        shadcn/ui + Radix UI
Styling             Tailwind CSS
Editor              CodeMirror 6
State               Zustand
Database            SQLite
Search              SQLite FTS5
Package Manager     pnpm
Monorepo             pnpm workspace
Plugin SDK          TypeScript
Plugin Package      .workos-plugin
```

第一版不使用 Electron。

---

## 2. 总体技术架构

```text
┌───────────────────────────────────────────────┐
│                 Work-OS UI                    │
│ Launcher / Workbench / Plugins / Manual Hub  │
└──────────────────────┬────────────────────────┘
                       │
                 Application Core
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   Command Bus      Search        Plugin Runtime
                                      │
                                Permission Broker
                                      │
      ┌───────────────────────────────┼───────────────┐
      │                               │               │
   Storage                         Network         Native
      │                               │               │
   SQLite                         HTTP / WS       macOS API
      │
 Manual Runtime / FTS5
```

---

## 3. 核心架构原则

### 3.1 Core 不承载业务工具

Core：

```text
Window
Launcher
Command Bus
Search
Plugin Runtime
Plugin Manager
Permission
Storage
Manual Runtime
Theme
Updater
Native Services
```

Plugin：

```text
Developer Tools
Manual Content
Integration
Automation
AI
```

### 3.2 插件最小权限

插件必须通过 Work-OS SDK 调用系统能力。

### 3.3 Manual 是内容型插件

Manual 默认禁止任意脚本执行，只提供标准化内容和索引。

### 3.4 Local First

SQLite + Keychain + 本地插件 + 本地 Manual Index 为默认架构。

---

## 4. Core Repository

```text
work-os/
│
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── app/
│       │   ├── launcher/
│       │   ├── workbench/
│       │   ├── plugins/
│       │   ├── manuals/
│       │   └── settings/
│       │
│       └── src-tauri/
│           ├── src/
│           ├── capabilities/
│           └── tauri.conf.json
│
├── packages/
│   ├── ui/
│   ├── plugin-sdk/
│   ├── plugin-types/
│   ├── manual-kit/
│   ├── command/
│   └── shared/
│
├── crates/
│   ├── core/
│   ├── plugin-runtime/
│   ├── permission/
│   ├── storage/
│   ├── network/
│   ├── manual/
│   └── native/
│
├── plugins/
│   ├── json-tools/
│   ├── api-client/
│   ├── websocket/
│   ├── crypto-tools/
│   └── developer-essentials/
│
├── tools/
│   └── workos-cli/
│
└── docs/
```

---

## 5. Manual Repositories

第一版：

```text
work-os-manual-linux
```

后续：

```text
work-os-manual-git
work-os-manual-docker
work-os-manual-kubernetes
work-os-manual-postgresql
work-os-manual-redis
```

目标：

- 独立维护
- 独立版本
- 独立 Release
- 独立 CI
- 不触发 Work-OS 主程序发版

---

## 6. Command Bus

统一注册一切可执行能力：

```ts
interface Command {
  id: string
  title: string
  keywords?: string[]
  execute(context: CommandContext): Promise<unknown>
}
```

示例：

```text
json.format
http.open
websocket.connect
manual.search
plugin.install
```

Launcher 只依赖 Command/Search，不直接依赖业务插件。

---

## 7. Plugin Package

统一：

```text
*.workos-plugin
```

本质：

```text
ZIP
├── manifest.json
├── dist/
├── assets/
└── optional-content/
```

---

## 8. Plugin Type

```text
ui
manual
system
```

### UI Plugin

独立 UI 与业务逻辑。

### Manual Plugin

标准化内容与索引，默认不携带自定义 UI。

### System Plugin

用于受控扩展系统级能力，V0.1 不对第三方开放。

---

## 9. Plugin Manifest

```ts
interface PluginManifest {
  schemaVersion: number
  id: string
  name: string
  version: string
  type: "ui" | "manual" | "system"
  apiVersion: string
  entry?: string
  permissions?: string[]
  commands?: PluginCommand[]
  manual?: ManualPluginConfig
}
```

Manual 示例：

```json
{
  "schemaVersion": 1,
  "id": "dev.workos.manual.linux",
  "name": "Linux Manual",
  "version": "1.8.0",
  "type": "manual",
  "apiVersion": "1",
  "manual": {
    "provider": "static",
    "index": "dist/index.json",
    "database": "dist/manual.db",
    "content": "dist/content"
  }
}
```

---

## 10. UI Plugin Runtime

UI 插件不运行在主 React Runtime 中。

```text
Plugin WebView
    ↓
Plugin Bridge
    ↓
Plugin Runtime
    ↓
Permission Broker
    ↓
Native Services
```

插件不能直接访问：

```text
window.__TAURI__
```

仅暴露：

```text
window.workos
```

---

## 11. Plugin SDK

Package：

```text
@work-os/plugin-sdk
```

示例：

```ts
import { definePlugin } from "@work-os/plugin-sdk"

export default definePlugin({
  activate(ctx) {
    ctx.commands.register({
      id: "json.format",
      title: "JSON Format",
      async execute(input) {
        return JSON.stringify(JSON.parse(String(input)), null, 2)
      }
    })
  }
})
```

---

## 12. Plugin API

V0.1：

```text
Clipboard
Storage
HTTP
Secret
Command
Window
Notification
Dialog
Theme
Lifecycle
```

示例：

```ts
workos.clipboard.readText()
workos.clipboard.writeText()
workos.storage.get()
workos.storage.set()
workos.http.request()
workos.secret.get()
workos.secret.set()
workos.commands.execute()
```

---

## 13. Permission Broker

```text
Plugin API Call
      ↓
Resolve Plugin ID
      ↓
Validate API Version
      ↓
Validate Permission
      ↓
Native Service
```

V0.1 权限：

```text
clipboard.read
clipboard.write
storage.read
storage.write
network.request
secret.read
secret.write
dialog.open
dialog.save
notification.show
```

后续高风险权限：

```text
filesystem.read
filesystem.write
shell.execute
```

默认关闭。

---

## 14. Storage

SQLite：

```text
settings
plugins
plugin_versions
plugin_permissions
plugin_storage

http_collections
http_requests
http_history
http_environments

websocket_sessions
websocket_history

manual_sources
manual_documents

favorites
recent_items
command_history
```

Plugin Storage 必须通过 `plugin_id` namespace 隔离。

---

## 15. Secret Storage

Secret 不写入 SQLite。

抽象：

```rust
trait SecretStore {
    fn get(...)
    fn set(...)
    fn remove(...)
}
```

macOS：

```text
Keychain
```

未来：

```text
Windows Credential Manager
Linux Secret Service
```

---

## 16. Manual Runtime

统一 Runtime：

```text
Manual Plugin
      ↓
Manual Runtime
      ↓
Manual Service
      ↓
Search / Reader / Favorites / Recent
      ↓
Work-OS Manual Hub
```

UI 由 Work-OS Core 提供。

---

## 17. Manual Schema

```ts
interface ManualDocument {
  id: string
  title: string
  aliases?: string[]
  summary?: string
  category?: string
  tags?: string[]
  sections: ManualSection[]
  source?: {
    name: string
    url?: string
    license?: string
  }
}
```

目标：

- 多来源统一
- Search 与 UI 解耦
- 可离线
- 可独立升级
- 可成为未来 AI Context Provider

---

## 18. Manual Repository Pipeline

Linux：

```text
jaywcjlove/linux-command
         ↓
      sync.ts
         ↓
    normalize.ts
         ↓
    validate.ts
         ↓
      build.ts
         ↓
 ┌────────────────┐
 │ dist/index.json│
 │ dist/content   │
 │ dist/manual.db │
 └────────────────┘
         ↓
 workos manual pack
         ↓
linux-manual.workos-plugin
```

---

## 19. Manual Repository Structure

```text
work-os-manual-linux/
│
├── README.md
├── LICENSE
├── source/
│   └── upstream.json
├── content/
├── metadata/
├── scripts/
│   ├── sync.ts
│   ├── normalize.ts
│   ├── validate.ts
│   └── build.ts
├── dist/
├── manifest.json
└── .github/workflows/
```

---

## 20. Manual Kit

早期：

```text
work-os/packages/manual-kit
```

或：

```text
work-os/tools/workos-cli
```

CLI：

```bash
workos manual init
workos manual import
workos manual validate
workos manual build
workos manual preview
workos manual pack
```

稳定后可拆分独立仓库。

---

## 21. Manual Update

每套手册独立 Release：

```text
GitHub Release
    ↓
registry.json
    ↓
Work-OS Plugin Manager
    ↓
Download
    ↓
Hash Verify
    ↓
Install
```

---

## 22. Plugin Registry

MVP 使用静态 Registry：

```json
{
  "plugins": [
    {
      "id": "dev.workos.manual.linux",
      "version": "1.8.0",
      "type": "manual",
      "download": "...",
      "sha256": "..."
    }
  ]
}
```

无需第一版建设插件市场后台。

---

## 23. HTTP Client Architecture

不依赖 Plugin WebView 的浏览器 `fetch()`。

```text
API Client Plugin
       ↓
workos.http.request
       ↓
Permission Broker
       ↓
Rust Network Service
       ↓
HTTP / LAN / Internet
```

优势：

- 无浏览器 CORS 限制
- 统一 Proxy
- 统一证书
- 统一 Timeout
- 统一日志
- 统一 Network Permission

---

## 24. WebSocket Architecture

```text
WebSocket Plugin
       ↓
Plugin Bridge
       ↓
Network Service
       ↓
Rust WebSocket Client
```

后续支持：

- Headers
- Binary
- Certificate
- Proxy
- Permission

---

## 25. Native Services

```text
Clipboard
Shortcut
Window
Tray
Notification
Dialog
Keychain
App Lifecycle
System Info
```

---

## 26. Window Architecture

至少两个 Window：

```text
Launcher Window
Workbench Window
```

Launcher：

- Borderless
- Always on Top
- Fast Show/Hide
- ESC Close
- Keyboard Focus

Workbench：

- Standard Resizable Window
- Sidebar
- Toolbar
- Split Pane
- Plugin Surface

---

## 27. Search Architecture

```text
Command Search     → Memory Index
Manual Search      → SQLite FTS5
Recent/Favorite    → SQLite
```

V0.1 不引入 Vector DB。

未来可以在不破坏 Manual Schema 的情况下增加语义索引。

---

## 28. Manual Content Security

Manual 默认：

- 禁止 JS
- 禁止远程脚本
- Markdown 白名单渲染
- HTML Sanitization
- 禁止危险 URI
- Copy Command 与 Execute Command 分离

原则：

```text
Manual 可以展示命令
≠
Manual 可以直接执行命令
```

---

## 29. Security Boundary

Untrusted：

```text
Plugin JS
Plugin Content
Network Content
Imported Manual Content
```

Trusted：

```text
Core
Permission Broker
Native Services
Storage Layer
Updater
```

关键规则：

1. Plugin 无 Node.js
2. Plugin 无 Tauri 全局访问
3. Plugin 无任意 Shell
4. Plugin 无任意 File System
5. Native API 校验 Plugin ID
6. 所有能力检查 Permission
7. Storage namespace 隔离
8. Secret 使用 Keychain
9. Plugin Package 校验 Hash / Signature
10. Manual Content 不执行任意脚本

---

## 30. Plugin Lifecycle

```text
Installed
  ↓
Enabled
  ↓
Loaded
  ↓
Activated
  ↓
Running
  ↓
Deactivated
  ↓
Unloaded
```

---

## 31. Plugin Install

```text
Download / Local File
        ↓
Validate Package
        ↓
Validate Manifest
        ↓
Check apiVersion
        ↓
Hash / Signature
        ↓
Permission Prompt
        ↓
Install
        ↓
Register Commands / Manual Provider
```

---

## 32. Built-in Plugins

Core Repository 内置：

```text
json-tools
api-client
websocket
crypto-tools
developer-essentials
```

Linux Manual 第一版就作为外部仓库接入，用于完整验证：

```text
External Repo
→ Build
→ Pack
→ Install
→ Search
→ Update
```

---

## 33. UI 技术

```text
React
TypeScript
Vite
Tailwind CSS
shadcn/ui
Radix UI
Lucide
CodeMirror 6
Zustand
```

shadcn 仅作为 Primitive。

Work-OS Design System：

```text
WorkbenchSidebar
WorkbenchToolbar
WorkbenchSplitPane
CommandPalette
CodeEditor
RequestEditor
ResponseViewer
ManualReader
PluginSurface
KeyboardHint
```

---

## 34. macOS Native Feel

第一版重点：

- Global Shortcut
- Native Menu
- Native Tray
- Native Dialog
- Notification
- Keychain
- Drag & Drop
- Dark Mode
- Native Window
- Keyboard Navigation

---

## 35. macOS Build

Targets：

```text
x86_64-apple-darwin
aarch64-apple-darwin
universal-apple-darwin
```

发布：

```text
Work-OS Universal.dmg
```

正式分发：

- Code Signing
- Hardened Runtime
- Notarization
- Stapling

---

## 36. CI/CD

Core：

```text
PR
↓
Lint
Type Check
Rust Check
Unit Test
Plugin Contract Test
Build
```

Tag：

```text
macOS x86_64
macOS arm64
Universal
↓
Sign
Notarize
Release
```

Manual Repo：

```text
Upstream Check
↓
Sync
↓
Normalize
↓
Validate
↓
Build
↓
Pack
↓
Release
```

---

## 37. MVP 实施顺序

### Phase 1 — Desktop Shell

- Tauri
- React
- Theme
- Window
- Shortcut
- Launcher
- Workbench

### Phase 2 — Command System

- Command Bus
- Search
- Recent
- Favorite

### Phase 3 — Plugin Runtime

- Manifest
- Local Install
- Plugin WebView
- Plugin Bridge
- Permission
- Plugin SDK

### Phase 4 — Developer Plugins

1. JSON
2. Essentials
3. API Client
4. WebSocket
5. Crypto

### Phase 5 — Manual Runtime

- Manual Schema
- Manual Provider
- FTS5
- Manual Reader
- Linux Manual External Repo

### Phase 6 — Distribution

- Universal Build
- Signing
- Notarization
- Updater

---

## 38. 性能目标

建议 V0.1：

```text
Warm Launcher Show       < 150 ms
Command Search           < 50 ms
Manual Search            < 100 ms
Plugin Open              < 300 ms 目标
```

冷启动指标在真实 Intel 与 Apple Silicon 设备上压测后固化。

---

## 39. 核心技术资产

Work-OS 真正值得长期维护：

```text
Plugin Runtime
Permission System
Command Bus
Plugin SDK
Manual Schema
Manual Runtime
Manual Kit
Native Workbench UX
```

其中：

> Manual Schema / Runtime 与 Plugin API 同级重要。

---

## 40. 最终技术形态

```text
Work-OS Core
   +
Secure Plugin Runtime
   +
Independent Plugin Ecosystem
   +
Independent Manual Content Ecosystem
```

这套边界保证 Work-OS 后续可以持续增加工具、手册、AI 和自动化能力，而不让 Core 失控。
