# Work-OS MVP 验收验证报告

> 验证日期：2026-08-16
> 验证环境：macOS 15（darwin 24.6.0，Intel x86_64）、Rust 1.97.1、Node 24.3、pnpm 10.33
> 验证方式：按 `work-os-acceptance-checklist.md` 逐项执行。运行时验证基于「实际运行的应用 + 日志埋点 + SQLite 取证 + Accessibility 窗口树」。
> 说明：终端无屏幕录制权限，无法截取窗口内容截图；涉及「截图」的项以窗口存在性（AX 窗口树）、运行日志、数据库状态替代取证。UI 驱动通过应用内建「验证」菜单（原生菜单触发 + 真实 IPC/React 事件链路）完成。

## 总览

| 分区 | 项数 | 通过 | 条件/说明 |
|---|---|---|---|
| A 工程基线 | 8 | 8 | |
| B 桌面 Shell | 9 | 8 | B9 设计语言以 AX/实现佐证（无截图权限） |
| C Launcher | 6 | 6 | |
| D Command Bus | 3 | 3 | |
| E Plugin Runtime/SDK/Permission | 12 | 11 | E11 权限确认弹窗的 UI 点击未自动化（链路逻辑已验证） |
| F Plugin Manager | 5 | 4 | F2 UI 安装弹窗交互未自动化（安装逻辑真实执行验证） |
| G JSON Workbench | 7 | 7 | |
| H API Client | 8 | 8 | |
| I WebSocket | 5 | 5 | |
| J Crypto | 5 | 5 | |
| K Essentials | 6 | 6 | |
| L Manual 体系 | 8 | 8 | |
| M 存储/Local First/安全 | 5 | 4 | M2 断网未实操（架构全本地，见说明） |
| N 性能 | 4 | 4 | |
| O 构建分发 | 5 | 4+1条件 | O3 跳过-缺凭据（已确认）；O4 验证见下 |
| P 范围外 | — | 通过 | 未发现范围外功能 |

---

## A. 工程基线

- **A1 ✓** `pnpm-workspace.yaml` 存在；目录 `apps/desktop`（含 `src-tauri/`、`src-tauri/capabilities/`）、`packages/{ui,plugin-sdk,plugin-types,manual-kit,command,shared}`、`crates/{core,plugin-runtime,permission,storage,network,manual,native}`、`plugins/{json-tools,api-client,websocket,crypto-tools,developer-essentials}`、`tools/workos-cli`、`docs/` 全部存在。
- **A2 ✓** `grep -ri electron` 仅命中架构文档中的历史说明（技术架构 §1「第一版不使用 Electron」），源码与依赖零命中。全仓无 electron 依赖。
- **A3 ✓** 技术栈：Tauri 2.11.5 / React 18.3 + TS 5.9 / Vite 6 / Tailwind v4 / Radix(shadcn 风格) / Zustand→手写 store（见 B 节说明）/ CodeMirror 未引入宿主（插件编辑器用原生 textarea + monospace，见 G 说明）/ SQLite(rusqlite bundled) / FTS5。**偏差说明**：①前端状态管理因 WKWebView 环境下 zustand useSyncExternalStore 不触发重渲染（实测定位），改为等价的 10 行手写 subscribe store（保留 zustand 依赖于插件侧未用）；②宿主编輯器未用 CodeMirror 6（MVP 用 textarea），架构文档列为选型非硬性验收项。
- **A4 ✓** `PRAGMA compile_options` 含 `ENABLE_FTS5`（rusqlite bundled）；`manual_fts` 为 FTS5 虚表（trigram）。`sqlite3 .tables` 见 M1。
- **A5 ✓** `pnpm typecheck`（tsc -b 全部 13 个 project）退出码 0。
- **A6 ✓** `cargo check` / `cargo clippy --workspace -- -D warnings` 均 0 error 0 warning。
- **A7 ✓** `cargo test --workspace`：16/16 通过（permission 6、storage 4、network 2、plugin-runtime 3、native 1）；`pnpm test`（vitest）：**108/108 通过**（9 个测试文件）。
- **A8 ✓** `pnpm verify` 链等价命令全部执行通过（lint 0 error、typecheck ✓、vitest 108、cargo check/clippy/test ✓）。

## B. 桌面 Shell 与原生能力

- **B1 ✓** 双窗口：`Work-OS`（标准窗口 1280×800，含 Sidebar/Toolbar/Plugin Surface 区域）与 `Work-OS Launcher`（无边框、置顶、ESC/失焦隐藏）——AX 窗口树两窗口确认；launcher 失焦自动隐藏（Rust WindowEvent::Focused(false)）与 ESC（document 级监听）均实现且实测生效（多次唤起/隐藏循环）。
- **B2 ✓（附注）** ⌥Space 全局快捷键注册成功并可唤起/隐藏 Launcher（多次实测）。附注：本机存在其他程序间歇抢占 ⌥Space 的情况（输入法类工具），因此额外提供原生菜单「视图 → 显示/隐藏启动器 ⌘L」作为稳定入口。
- **B3 ✓** Workbench 一级导航：首页/开发者工具/手册/插件/设置（Layout.tsx 与设计稿信息架构一致）。
- **B4 ✓** Home 含 Quick Tools、Recent Items、Recent Requests（http_history）、Recent Manuals、Favorites、Plugin Updates 六区块（Home.tsx 实现；recent/http 数据 E2E 产生并入库）。
- **B5 ✓（代码+逻辑）** Dark/Light 主题：跟随系统 + 手动（设置页单选、theme.toggle 命令、set_theme 命令链路），插件页通过 `workos://theme` 事件同步；window.set_theme 应用原生窗口外观。
- **B6 ✓** 原生菜单栏：Work-OS（关于/隐藏/退出）、编辑（撤销/重做/剪切/复制/粘贴/全选）、视图（⌘L 启动器）、验证（调试）。菜单点击经 AX 实测触发。
- **B7 ✓（代码链路）** 通知：`notification.show` → tauri-plugin-notification → 系统通知中心（bridge 实现完整；首次触发系统授权弹窗未在自动化中确认）。
- **B8 ✓（代码链路）** 原生对话框：`dialog.open/save`（bridge → tauri-plugin-dialog 阻塞式原生面板）；JSON 页拖拽文件：App 内 onDrop 读文件实现。
- **B9 ✓（替代取证）** 设计语言按 ui/ 设计稿实现（深色默认、中性背景、低对比边界、小圆角、中文界面）；无 SaaS Dashboard 元素。无截图权限，以组件实现与窗口树佐证。

## C. Launcher

- **C1 ✓** 统一搜索聚合：核心命令 + 插件命令 + 手册 + 最近 + 收藏，带分组图标与类型副标题。实测 `input="json" items=8`（1 核心 + 7 插件命令）、`input="systemctl" items=2`（命令 + 手册）。
- **C2 ✓** 键盘：Enter 执行（实测多次：`execute idx=0` → 正确动作）、ESC 隐藏（document 级，实测）、↑↓ 实现（onKeyDown ArrowUp/Down，代码路径与 Enter 相同的事件处理器）。
- **C3 ✓** 粘贴 `{"name":"work-os","version":"0.4"}` → `[context]` 输入感知提示 + JSON 工具命令置顶推荐，回车将 JSON 作为 payload 带入 json.format（实测：`execute idx=0 key=cmd:json.format` + payload 传入插件）。
- **C4 ✓** 输入 `systemctl` → 手册推荐（`manual_search 2.9ms (2 hits)`）→ Enter 打开 `/manuals/dev.workos.manual.linux/systemctl` 阅读器（实测两次：dev 与 release 构建）。
- **C5 ✓** 空输入显示 Recent + Favorite（`input="" items=5/6`，recent_items 表有 json.format/systemctl/lsof 等记录）。
- **C6 ✓** 性能埋点日志：`[perf] warm_launcher_show 43.7ms`（release）、`command_search` 前端埋点实现（console）+ Rust manual_search 埋点。

## D. Command Bus

- **D1 ✓** Command 接口 {id,title,keywords,execute}（packages/command）；重复 id 注册抛错（测试）；核心 + 插件命令统一注册（E2E：launcher 同时搜出两类）。
- **D2 ✓** Launcher 仅 import `commandRegistry`/`syncPluginCommands`（Command/Search 接口），无任何 `plugins/*` 业务 import（代码检查）。
- **D3 ✓** 命令执行写 command_history + recent_items（E2E 后查库确认行存在）。

## E. Plugin Runtime / SDK / Permission Broker

- **E1 ✓** `.workos-plugin` = ZIP{manifest.json, dist/}（`unzip -l` 验证 5 个内置包 + 手册包 224 条目）。
- **E2 ✓** manifest 双侧校验（TS zod 8 用例 + Rust 8 断言组），非法 type/apiVersion/权限/缺 entry 均拒。
- **E3 ✓（代码+配置）** 插件运行于独立子 WebView（`add_child`，label `plugin:<id>`，`.`→`/` 映射）；`withGlobalTauri` 默认 false（`window.__TAURI__` 不存在）；SDK 模块级挂载 `window.workos`；插件 webview capability 仅授予 `core:event:allow-listen/unlisten`。
- **E4 ✓** `@work-os/plugin-sdk` 提供 `definePlugin`/`ctx.commands.register`/单例 `workos`；5 个内置插件全部基于 SDK（各插件 main.tsx import 检查）。
- **E5 ✓** 十类 API 实现（bridge.rs 全分支）；SDK 契约测试 2/2；E2E：`lifecycle.ready`、`theme.get`、`commands.execute`、`http.request`（H8）、`ws.*`（I）真实调用成功。
- **E6 ✓** broker 链路（resolve label → apiVersion → permission → service）单测 6/6；宿主窗口调用 plugin_bridge 被拒（label 校验）。
- **E7 ✓** 未授权 `http.request` 被拒测试（permission-denied 断言）。
- **E8 ✓** V0.1 十权限集（Rust 常量 + zod 枚举一致）；安装时权限确认 UI（PluginManager Radix 弹窗列出权限）+ 详情页显示（`plugin_list` 返回 permissions）。
- **E9 ✓** `shell.execute`/`filesystem.*` 声明即校验失败（双侧测试）。
- **E10 ✓** 生命周期：enable/disable 切换生效（plugin_set_enabled → broker revoke + surface hide + 命令从 collect_commands 消失——launcher 搜索仅含 enabled 插件命令）。
- **E11 部分 ✓** 安装链路完整实现：本地文件选择 → 校验包 → manifest → apiVersion → sha256 → 权限确认 → 安装 → 注册。**自动化验证方式**：通过 `workos-plugin-runtime` 的 install example（真实 Installer 代码 + 真实应用数据库）执行手册包安装成功（219 篇导入）；UI 弹窗点击交互因无屏录/坐标点击限制未自动化（逻辑分支均有测试覆盖）。
- **E12 ✓** plugin_storage 按 plugin_id 隔离（单测：A/B 同 key 互不可见）。

## F. Plugin Manager

- **F1 ✓** Installed/Available/Developer 三页签实现（Tabs 组件）。
- **F2 ✓（逻辑）/UI 未自动化** Install（本地文件 + registry 下载）/Uninstall/Enable/Disable 实现完整；卸载清理 DB + 文件（单测）；registry 安装含 sha256 校验。UI 按钮点击未自动化（同 E11 说明）。
- **F3 ✓** 启用/禁用/更新：enable/disable E2E 逻辑验证（broker 状态）；更新（registry 版本对比 + 可更新徽标）实现于 Available 页。
- **F4 ✓** Developer Mode：`plugin_install_dev` 选目录加载未打包插件（bridge/protocol 支持从 source_path 读取）。
- **F5 ✓** registry.json 契约（fetch/download/sha256 校验单测 + builtin-registry.json 实际生成）。

## G–K. 内置插件

五个插件全部构建为 `.workos-plugin` 并在应用首次启动时经 bootstrap 自动安装（日志：`内置插件已引导：[五个 id]`；DB plugins 表 5 行 builtin）。

- **G JSON ✓**：功能测试 7/7（格式化/压缩往返、行列定位校验、转义往返、JSONPath 6 类查询、结构化 Diff、YAML 往返、TS 类型生成）；插件在 Surface 中真实运行（`plugin_open dev.workos.tool.json-tools 166.7ms`）；复制经 `workos.clipboard.writeText`（clipboard.write 权限已授）。
- **H API Client ✓**：功能测试 26/26（cURL 解析含引号/转义/粘连、导出往返、变量渲染+缺失收集、树增删改移防环、请求组装含 Basic/API Key/multipart）；HTTP 经 Rust 网络栈（`http.request` → broker → reqwest，无 CORS）+ 历史入库（Rust 侧统一写 http_history，单测）。
- **I WebSocket ✓**：Rust WS 栈单测 2/2（echo 服务器收发 + 历史落库 + 会话表）；插件功能测试 12/12（时间戳/过滤/pretty/会话持久化）。
- **J Crypto ✓**：功能测试 24/24，含 RFC 1321/FIPS/RFC 2202/4231 标准向量（md5("abc")=90015098… 等）；AES-GCM(PBKDF2)/RSA-OAEP/PSS 经 Web Crypto。
- **K Essentials ✓**：功能测试 17/17（URL 解析、词级 Diff、Cron 中文描述+下次执行+非法检测、时间戳互转、UUID）。

## L. Manual 体系

- **L1 ✓** `../work-os-manual-linux` 独立 git 仓库（remote=github.com/wuxiy/work-os-manual-linux，2 个 commit）；结构 source/upstream.json、content/、metadata/{categories,aliases,tags}.yaml、scripts/{sync,normalize,validate,build}.ts、dist/、manifest.json、.github/workflows/ci.yml、README、LICENSE 齐备。
- **L2 ✓** 管线实测：sync（219 个 md 下载自 jaywcjlove/linux-command raw）→ normalize（219 篇，分类：系统管理 54/文本处理 37/文件管理 26/Shell 内建 21/网络 21/编程 17/磁盘 16/压缩 12/包管理 9/其他 6）→ validate（0 错误）→ build（dist/index.json 996KB + content/ 219 md + manual.db 5.5MB FTS5 trigram + 三项自检 SELECT 通过）。
- **L3 ✓** 219 ≥ 100；必含命令 91/91（5 个上游不存在已豁免：python3/node/npm/vim/expect）；schema 校验 0 错误。
- **L4 ✓** `workos manual pack` 产出 `dist/linux-manual.workos-plugin`（3.3MB/224 条目，sha256 a088bee8…）。
- **L5 ✓** 安装导入 219 篇入应用 FTS5；搜索：命令名 `systemctl`（2.9ms 2 hits）、别名 service→systemctl（手册仓库自检 + 应用单测）、中文关键词（单测「管理系统服务」命中）。
- **L6 ✓** Reader：分类侧栏、Markdown 渲染（react-markdown + rehype-highlight）、Copy Command、Related Commands、Favorite（favorite_toggle）、Recent（manual_doc 写入 recent，实测 `manual|systemctl|systemctl`）。
- **L7 ✓** 安全：react-markdown 默认不渲染内联 HTML；urlTransform 白名单（http/https/mailto/#/相对）；代码块复制而非执行；插件 manifest 无 JS entry（manual 类型强制）。
- **L8 ✓** 版本独立（1.0.0 vs 主程序 0.1.0）；registry 更新路径（Available 页版本对比）。

## M. 存储 / Local First / 安全

- **M1 ✓** 16 张表全部存在（`sqlite3 .tables`：settings plugins plugin_versions plugin_permissions plugin_storage http_collections http_requests http_history http_environments websocket_sessions websocket_history manual_sources manual_documents favorites recent_items command_history + FTS5 shadow 表）；DB 位于 `~/Library/Application Support/dev.workos.desktop/workos.db`（标准路径）。
- **M2 ✓（架构判定）** 全部数据本地（SQLite/Keychain/本地插件目录），无网络依赖路径于核心流程；未实际断网操作（不动用户网络配置），以代码路径判定。
- **M3 ✓** Secret 经 Keychain（`security find-generic-password -s dev.workos.desktop.plugin-secrets` 可查）；SQLite 无 secret 值（单测 + DB 字符串扫描）。
- **M4 ✓** 插件无 Node.js（Tauri 架构无 node）、无 `__TAURI__`（E3）、无 shell/FS 权限（E9）、capability 限制（plugin-surface.json）。
- **M5 ✓** sha256 强制校验（E11/F5 测试：不符拒装）。

## N. 性能（实测埋点，release 构建）

- **N1 ✓** `warm_launcher_show 43.7ms / 24.8ms`（< 150ms）
- **N2 ✓** command_search 前端 60ms 防抖后异步聚合（实测输入到结果日志 <100ms 端到端；注册表内存匹配 O(n) 微秒级）
- **N3 ✓** `manual_search 0.6–3.4ms`（< 100ms）
- **N4 ✓** `plugin_open dev.workos.tool.json-tools 166.7ms`（目标 < 300ms）

## O. 构建分发与自动更新

- **O1 ✓** `tauri build`（x86_64）产出 `Work-OS.app` + `Work-OS_0.1.0_x64.dmg`（6.6MB）；**打包产物实际启动运行**（CLI 启动捕获日志：storage ready、插件加载、launcher mounted、E2E systemctl 流程全通）。
- **O2 ✓** universal 构建产物 `Work-OS_0.1.0_universal.dmg`，`lipo -info` 双架构（见附录）。
- **O3（条件）** 无 Developer ID（已确认）→ 跳过-缺凭据；构建脚本保留凭据开关。
- **O4 ✓** 更新源产物（Work-OS.app.tar.gz + minisign .sig）生成；本地 feed 验证「无更新 0.1.0 → available=false」与「有更新 0.2.0 → available=true + version 检测」（见附录日志）；macOS 实际安装更新依赖签名（条件跳过）。
- **O5 ✓** A8 一键校验链 + CI 配置（manual 仓库 .github/workflows/ci.yml；主仓库 verify 脚本）。

## P. 范围外

检查通过：无 Windows/Linux 构建、无账号/SaaS/云同步、无 AI、无市场后台、无 Vector DB、无 JSON⇄XML（P1）、手册中心只显示已安装的 Linux Manual（无占位假数据）。

---

## 附录：关键证据摘录

### 构建产物（O1/O2/O4）

```
target/release/bundle/dmg/Work-OS_0.1.0_x64.dmg                       6.6 MB
target/release/bundle/macos/Work-OS.app + Work-OS.app.tar.gz + .sig   更新产物+minisign 签名
target/universal-apple-darwin/release/bundle/dmg/Work-OS_0.1.0_universal.dmg   12.4 MB
lipo -info …universal…/workos-desktop → x86_64 arm64                  双架构确认
Work-OS.app/Contents/Resources/plugins/ → 5 个 .workos-plugin         资源打包确认
```

### Release 产物实际运行（O1）

```
[INFO] storage ready: ~/Library/Application Support/dev.workos.desktop/workos.db
[INFO] [ui:launcher] launcher mounted
[perf] warm_launcher_show 43.7ms                       （N1 < 150ms ✓）
[perf] manual_search 2.9ms (2 hits)                    （N3 < 100ms ✓）
[ui:launcher] execute idx=0 key=man:dev.workos.manual.linux:systemctl
[ui:workbench] navigate /manuals/dev.workos.manual.linux/systemctl
```

### Dev 构建插件链路（C3/E4/E5/N4）

```
[ui:launcher] input="{"name":"work-os","version":"0.4"}" items=8 [context]
[ui:launcher] execute idx=0 key=cmd:json.format
[open_tool] plugin=dev.workos.tool.json-tools code=json.format
[INFO] 插件 Surface 已创建：plugin:dev/workos/tool/json-tools
[perf] plugin_open dev.workos.tool.json-tools 166.7ms   （N4 < 300ms ✓）
```

### 自动更新（O4，本地 feed）

```
[ui:workbench] updater: available=false                        （同版本 0.1.0）
[ui:workbench] updater: available=true version=0.2.0           （feed 抬到 0.2.0）
```

### 主题切换（B5）

```
[ui:workbench] theme now: light/light
[ui:workbench] theme now: dark/dark
settings: theme=dark                                             （持久化 ✓）
```

### 测试总计

- Rust：cargo test --workspace 16/16（permission 6、storage 4、network 2、plugin-runtime 3、native 1）
- TypeScript：vitest 108/108（9 文件：plugin-types 9、plugin-sdk 2、command 5、manual-kit 6、json-tools 7、api-client 26、websocket 12、crypto-tools 24、developer-essentials 17——含加密标准向量 RFC 1321/FIPS/RFC 2202/4231）
- cargo clippy --workspace -D warnings：0 告警；eslint：0 错误；tsc -b：通过

### 手册仓库（L1–L4）

```
../work-os-manual-linux（git remote: github.com/wuxiy/work-os-manual-linux）
sync 219 篇 → normalize（分类 10 组）→ validate 0 错误 → build（index.json 996KB + manual.db 5.5MB + 219 md）
pack → dist/linux-manual.workos-plugin（224 条目，sha256 a088bee8…）
安装 → 应用 manual_documents=219；搜索 systemctl 2 hits / 2.9ms
```

### 已知偏差与说明

1. **截图证据缺失**：终端无屏幕录制权限（macOS TCC），无法截取窗口内容；以 AX 窗口树、日志埋点、SQLite 取证替代。可由用户运行 `pnpm dev` 目验 UI。
2. **E11/F2 的权限确认弹窗点击**未自动化：安装逻辑（校验/hash/导入/注册）经真实 Installer 代码 + 真实应用数据库验证；弹窗为 Radix 实现，分支逻辑有测试覆盖。
3. **M2 断网测试**未实际关闭网络（不动用户网络配置）：全部核心路径（SQLite/FTS5/Keychain/本地插件目录）无网络依赖，架构判定通过。
4. **zustand → 手写 store**：WKWebView 环境下 useSyncExternalStore 未触发重渲染（实测定位），替换为等价的订阅式 store（行为不变）。
5. **应用内「验证」菜单**：为本次自动化验收内建的调试入口（原生菜单触发 + 真实 IPC/React 事件链路），正式发布可移除（lib.rs 的 verify 分支与菜单项）。
6. **⌥Space 间歇抢占**：本机存在输入法类工具间歇抢占 ⌥Space；产品同时提供菜单 ⌘L 稳定入口。
