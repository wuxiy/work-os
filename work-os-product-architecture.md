# Work-OS 产品架构

> 版本：V0.4  
> 阶段：MVP 产品架构基线  
> 产品名：Work-OS  
> 定位：Native Feel、插件驱动、本地优先的跨平台开发者工作台

---

## 1. 产品愿景

Work-OS 是一款面向开发者的本地工作操作系统。

它不是“多个小工具的集合”，而是以统一入口、统一插件运行时、统一权限体系和统一知识手册中心为核心，逐步形成：

```text
Launcher
+ Workbench
+ Plugin Runtime
+ Developer Tools
+ Manual Hub
+ Automation
+ AI
```

第一阶段优先支持：

- macOS Intel
- macOS Apple Silicon
- macOS Universal App

后续扩展：

- Windows
- Linux

---

## 2. 核心产品理念

### 2.1 Native Feel

Work-OS 必须是一款真正的桌面应用，而不是 Web 页面套壳。

核心体验：

- 全局快捷键快速唤起
- Keyboard First
- 原生窗口行为
- 原生菜单与通知
- 原生文件选择
- 系统安全存储
- Drag & Drop
- Dark / Light Mode
- 快速启动
- 快速切换
- 低打扰交互

### 2.2 Plugin First

Work-OS Core 只负责平台能力。

```text
Core = OS
Plugin = Apps
```

即使第一方开发者工具，也尽量通过插件机制实现，以持续验证 Plugin Runtime。

### 2.3 Local First

第一版不依赖账号或 SaaS。

- 配置本地保存
- 插件本地运行
- API Collection 本地保存
- 历史记录本地保存
- 手册离线可用
- 搜索索引本地保存
- Secret 使用系统 Keychain
- 无网络仍可完成核心工作

### 2.4 Secure by Default

插件不能直接获得系统权限。

```text
Plugin
  ↓
Work-OS SDK
  ↓
Permission Broker
  ↓
Native Service
  ↓
Operating System
```

### 2.5 Content 与 Runtime 解耦

Manual 采用独立生命周期。

```text
Work-OS Core
负责：
- 运行
- 搜索
- 展示
- 收藏
- 最近访问
- 权限
- 统一交互

Manual Plugin
负责：
- 内容
- 索引
- 元数据
- 来源
- 版本
```

手册独立仓库、独立版本、独立发布，无需跟随 Work-OS 主程序发版。

---

## 3. 产品总架构

```text
Work-OS
│
├── Launcher
│   ├── Command Search
│   ├── Plugin Search
│   ├── Manual Search
│   ├── Context Suggestions
│   ├── Recent
│   └── Favorites
│
├── Workbench
│   ├── Home
│   ├── Developer Tools
│   ├── Manual Hub
│   ├── Plugin Manager
│   └── Settings
│
├── Plugin Runtime
│   ├── UI Plugin
│   ├── Manual Plugin
│   └── System Plugin
│
└── Native Services
    ├── Storage
    ├── Network
    ├── Clipboard
    ├── Secret
    ├── Window
    ├── Shortcut
    └── Notification
```

---

## 4. Launcher

Launcher 是 Work-OS 最重要的入口。

默认快捷键建议：

```text
⌥ Space
```

目标：

> 尽可能在不打开完整 Workbench 的情况下完成高频操作。

统一搜索：

- Core Command
- Installed Plugin
- Plugin Command
- Manual
- Recent
- Favorite

支持输入感知。

例如粘贴：

```json
{"name":"work-os","version":"0.4"}
```

自动推荐：

- JSON Format
- JSON Minify
- JSON Validate
- JSONPath
- JSON → YAML
- Copy Pretty JSON

输入：

```text
systemctl
```

自动推荐：

- Linux Manual: systemctl
- 常用示例
- 相关命令
- Copy Command

---

## 5. Workbench

复杂任务进入主工作台。

一级区域：

```text
Home
Developer
Manuals
Plugins
Settings
```

首页不做传统 SaaS Dashboard，而是围绕“继续工作”组织：

- Quick Tools
- Recent Items
- Recent Requests
- Recent Manuals
- Favorites
- Plugin Updates

---

## 6. Developer Tools

### 6.1 JSON Workbench

P0：

- JSON Format
- JSON Minify
- JSON Validate
- Escape / Unescape
- JSONPath
- JSON Diff
- JSON ⇄ YAML
- JSON → TypeScript

P1：

- JSON ⇄ XML
- JSON → Java Class

---

### 6.2 API Client

定位：

> 轻量、快速、桌面原生的 API 调试工具。

支持：

- GET
- POST
- PUT
- PATCH
- DELETE
- HEAD
- OPTIONS

Request：

- Query Params
- Path Variables
- Headers
- Cookies
- JSON
- Text
- Form Data
- x-www-form-urlencoded
- Binary

Auth：

- Bearer Token
- Basic Auth
- API Key

数据结构：

```text
Workspace
└── Collection
    └── Folder
        └── Request
```

环境：

```text
dev
test
prod
```

变量：

```text
{{baseUrl}}
{{token}}
{{userId}}
```

必须支持：

- Import cURL
- Export cURL

---

### 6.3 WebSocket Workbench

支持：

- ws
- wss
- Headers
- Sub Protocol
- Text
- JSON
- Binary
- Reconnect
- Message History
- Search
- Filter
- Pretty JSON

未来演化：

```text
Network Debugger
├── WebSocket
├── SSE
├── MQTT
├── Socket.IO
└── gRPC
```

---

### 6.4 Crypto / Encode

```text
Encode
├── Base64
├── URL
├── Hex
└── Unicode

Hash
├── MD5
├── SHA-1
├── SHA-256
└── SHA-512

HMAC

Crypto
├── AES
├── RSA
└── Sign / Verify

Token
└── JWT Decode
```

---

### 6.5 Developer Essentials

高频小工具统一收纳：

- UUID
- Timestamp
- Regex
- JWT
- URL Parser
- Text Diff
- Cron Parser
- Hash
- Base64

---

## 7. Manual Hub

Manual Hub 是统一技术知识入口。

第一版：

- Linux Command Manual

后续：

- Git
- Docker
- Kubernetes
- PostgreSQL
- Redis
- Nginx
- Spring

统一能力：

- Search
- Category
- Reader
- Syntax Highlight
- Copy Command
- Recent
- Favorite
- Offline Read
- Related Commands

---

## 8. 手册生态架构

### 8.1 独立仓库

第一阶段：

```text
work-os
work-os-manual-linux
```

后续：

```text
work-os-manual-git
work-os-manual-docker
work-os-manual-kubernetes
work-os-manual-postgresql
work-os-manual-redis
...
```

### 8.2 内容导入链路

Linux Manual：

```text
jaywcjlove/linux-command
          ↓
Sync / Import
          ↓
Normalize
          ↓
Metadata Enrichment
          ↓
Search Index
          ↓
work-os-manual-linux
          ↓
Build
          ↓
linux-manual.workos-plugin
          ↓
Work-OS
```

### 8.3 Manual Plugin 是数据插件

核心原则：

> Work-OS 负责体验，Manual Plugin 负责知识。

Manual Plugin 默认不携带自定义 UI，而使用 Work-OS 的统一 Manual Runtime 展示。

这样 Linux、Git、Docker 等手册具备一致的：

- Search
- Category
- Reader
- Copy
- Favorite
- Recent
- Offline

体验。

---

## 9. Manual Plugin 生命周期

```text
Upstream
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
   ↓
Install / Update
```

独立版本：

```text
Work-OS           0.4.0
Linux Manual      1.8.0
Docker Manual     1.2.0
Git Manual        2.0.0
```

---

## 10. Plugin System

统一插件包：

```text
*.workos-plugin
```

类型：

```text
type: ui
type: manual
type: system
```

示例：

```json
{
  "schemaVersion": 1,
  "id": "dev.workos.manual.linux",
  "name": "Linux Manual",
  "type": "manual",
  "version": "1.8.0"
}
```

---

## 11. Plugin Manager

V0.1 支持：

- Install
- Uninstall
- Enable
- Disable
- Update
- Permissions
- Version
- Developer Mode

插件页：

```text
Installed
Available
Developer
```

第一版不做：

- 评论
- 评分
- 支付
- 开发者账号
- 推荐算法
- 云端插件后台

---

## 12. Manual Repository 模板

```text
work-os-manual-linux/
│
├── README.md
├── LICENSE
│
├── source/
│   └── upstream.json
│
├── content/
│   ├── ls.md
│   ├── grep.md
│   └── ...
│
├── metadata/
│   ├── categories.yaml
│   ├── aliases.yaml
│   └── tags.yaml
│
├── scripts/
│   ├── sync.ts
│   ├── normalize.ts
│   ├── validate.ts
│   └── build.ts
│
├── dist/
│   ├── index.json
│   ├── manual.db
│   └── content/
│
├── manifest.json
└── .github/workflows/
```

---

## 13. Manual Kit

Linux Manual 闭环跑通之后再抽象：

```text
@work-os/manual-kit
```

或 CLI：

```bash
workos manual init
workos manual import
workos manual validate
workos manual build
workos manual preview
workos manual pack
```

---

## 14. UI 信息架构

```text
Work-OS
│
├── Quick Launcher
│
├── Home
│
├── Developer
│   ├── JSON
│   ├── API Client
│   ├── WebSocket
│   ├── Crypto
│   └── Essentials
│
├── Manuals
│   └── Linux
│
├── Plugins
│   ├── Installed
│   ├── Available
│   └── Developer
│
└── Settings
```

---

## 15. UI 设计语言

关键词：

```text
Native
Minimal
Precise
Calm
Keyboard-first
Developer-oriented
Dense but breathable
```

视觉策略：

- macOS 原生感
- 轻量 Sidebar
- 顶部全局 Command Search
- 低对比边界
- 中性背景
- 小圆角
- 克制阴影
- 紧凑但不拥挤
- Code Editor 与数据表格并重
- Dark / Light 两套主题
- 状态颜色克制而清晰

避免：

- SaaS Dashboard 风
- AI Chat 首页化
- 大面积渐变
- 夸张玻璃拟态
- 大卡片堆叠
- 过度动效

---

## 16. MVP 页面

1. Quick Launcher
2. Home
3. JSON Workbench
4. API Client
5. WebSocket
6. Crypto
7. Manual Hub
8. Manual Reader
9. Plugin Manager
10. Plugin Detail
11. Settings

---

## 17. MVP 范围

### 必须完成

- macOS Universal
- Launcher
- Command Bus
- Plugin Runtime
- Plugin SDK
- Plugin Manager
- Permission System
- JSON
- API Client
- WebSocket
- Crypto
- Essentials
- Linux Manual
- Offline Search
- Local Storage
- Dark / Light
- Auto Update 基础能力

### 暂不做

- Windows
- Linux
- Account
- SaaS
- Cloud Sync
- WebDAV
- Team
- Workflow
- AI Agent
- Plugin Marketplace Backend
- Vector DB

---

## 18. 版本规划

### V0.1 — Developer Workbench

- Plugin Runtime
- JSON
- API
- WebSocket
- Crypto
- Linux Manual

### V0.2 — Knowledge Workbench

- Git Manual
- Docker Manual
- PostgreSQL Manual
- Snippets
- Favorites
- Notes

### V0.3 — Developer Runtime

- File Search
- App Search
- Terminal Integration
- SSH
- Database Tools
- SSE
- MQTT
- gRPC

### V0.4 — AI Workbench

AI 作为插件与 Context Consumer：

- Explain JSON
- Explain API Error
- Generate Request
- Generate Regex
- Explain Command
- Analyze Logs

---

## 19. 产品成功关键

Work-OS 第一阶段真正需要打磨：

1. Launcher 足够顺手
2. Native Feel 足够好
3. Plugin Runtime 足够稳定
4. Permission 足够清晰
5. Plugin API 足够克制
6. Manual 足够好搜
7. Offline 足够可靠
8. Manual 可独立迭代
9. 开发者工具确实高频
10. macOS Intel / ARM 体验一致

最终目标：

> **Work-OS = 开发者的本地工作操作系统。**
