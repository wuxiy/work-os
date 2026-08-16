# Work-OS MVP 验收清单

> 版本：V1.0（2026-08-16）
> 基线文档：`work-os-product-architecture.md` V0.4、`work-os-technical-architecture.md` V0.4
> 验证环境：本机 macOS（darwin 24.6.0，Intel x86_64），Node 20+ / pnpm 9+ / Rust stable + Tauri 2
> 技术基线：**Tauri 2 + Rust**（技术架构 §1「第一版不使用 Electron」，旧 Electron 代码已从仓库删除，本次为全新实现）

## 判定规则

- 每项标注验证方式：`[命令]` 执行命令看结果、`[测试]` 自动化测试、`[运行]` 实际启动应用操作观察、`[代码]` 结构/依赖检查、`[人工]` 需要人眼确认（如系统权限弹窗）。
- 标注 **（条件）** 的项依赖外部凭据（Apple 签名等）：无凭据时明确记录「跳过-缺凭据」，不计为失败；其余各项必须全部通过，验收才算通过。
- 出现 §P「范围外」中的任何功能视为不合格。

---

## A. 工程基线（技术架构 §1、§4）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| A1 | pnpm workspace 单仓 | `pnpm-workspace.yaml` 存在；目录含 `apps/desktop`（含 `src-tauri/` 与 `src-tauri/capabilities/`）、`packages/{ui,plugin-sdk,plugin-types,manual-kit,command,shared}`、`crates/{core,plugin-runtime,permission,storage,network,manual,native}`、`plugins/{json-tools,api-client,websocket,crypto-tools,developer-essentials}`、`tools/workos-cli`、`docs/` | [命令] `ls` + `cat pnpm-workspace.yaml` |
| A2 | 无 Electron | 全仓源码与依赖中不出现 electron（仅架构文档中作为历史说明出现） | [命令] `grep -ri electron --include="*.{ts,tsx,json,toml,rs}"` 无命中 |
| A3 | 技术栈符合选型 | Tauri 2 + React + TypeScript + Vite + Tailwind + shadcn/ui(Radix) + CodeMirror 6 + Zustand + SQLite（Rust 侧） | [代码] package.json / Cargo.toml 依赖清单 |
| A4 | SQLite + FTS5 | 数据库初始化后 `PRAGMA compile_options` 含 FTS5（或使用 bundled rusqlite），manual 侧存在 FTS5 虚拟表 | [测试] 启动建库后查询 |
| A5 | TypeScript 全通过 | 所有 tsconfig project 无类型错误 | [命令] `pnpm typecheck` 退出码 0 |
| A6 | Rust 全通过 | `cargo check` 与 `cargo clippy` 全 workspace 无警告级以上问题 | [命令] `cargo check && cargo clippy` |
| A7 | 测试通过 | `cargo test` 与前端 vitest 全绿 | [命令] `cargo test`、`pnpm test` |
| A8 | 一键校验 | 提供 `pnpm verify`（或等价脚本）串联 lint + typecheck + cargo check + test 并通过 | [命令] `pnpm verify` 退出码 0 |

## B. Desktop Shell 与原生能力（产品架构 §2.1、§5、§15；技术架构 §26、§34）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| B1 | 双窗口架构 | Launcher 窗口：无边框、置顶、失焦/ESC 隐藏、再次唤起焦点在输入框；Workbench 窗口：标准可缩放，含 Sidebar + Toolbar + Split Pane + Plugin Surface | [运行] + 截图 |
| B2 | 全局快捷键 | `⌥Space` 在任意应用前台均可唤起/隐藏 Launcher（应用在后台也生效） | [运行]（首次注册如触发系统权限弹窗则 [人工]） |
| B3 | Workbench 信息架构 | 一级导航为 Home / Developer / Manuals / Plugins / Settings，与产品架构 §14 一致 | [运行] + 截图 |
| B4 | Home「继续工作」 | Home 展示 Quick Tools、Recent Items、Recent Requests、Recent Manuals、Favorites、Plugin Updates 区块；无 SaaS Dashboard 式空卡片 | [运行] + 截图 |
| B5 | Dark / Light 主题 | 支持跟随系统与手动切换，两套主题均完整可看；插件页随主题同步变化 | [运行] 切换系统外观与手动开关，截图对比 |
| B6 | 原生菜单 | macOS 菜单栏含 App/编辑等基本菜单，Cmd+C/V/A 快捷键在输入框可用 | [运行] |
| B7 | 原生通知 | 插件调用 `notification.show` 后出现系统通知中心通知 | [运行]（首次需系统授权则 [人工]） |
| B8 | 原生对话框与拖拽 | `dialog.open/save` 打开系统原生文件对话框；JSON 工具页可拖入 `.json` 文件自动载入内容 | [运行] |
| B9 | 设计语言 | 中性背景、低对比边界、小圆角、克制阴影；无大面积渐变/夸张玻璃拟态/大卡片堆叠；信息架构与 `ui/` 设计稿一致（Launcher、Home、JSON、API Client、手册中心、手册阅读、Plugins、Settings） | [运行] + 截图对照设计稿 |

## C. Launcher 与统一搜索（产品架构 §4；技术架构 §27、§38）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| C1 | 统一搜索源 | 搜索结果聚合 Core Command、Installed Plugin、Plugin Command、Manual、Recent、Favorite，条目带类型标识 | [运行] 输入关键词观察结果分组 |
| C2 | 键盘优先 | ↑↓ 移动选择、Enter 执行、ESC 关闭；不碰鼠标可完成一次完整搜索-执行 | [运行] |
| C3 | 输入感知-JSON | 粘贴 `{"name":"work-os","version":"0.4"}` 后推荐 JSON Format / Minify / Validate 等命令 | [运行] |
| C4 | 输入感知-命令名 | 输入 `systemctl` 推荐 Linux Manual 的 systemctl 文档（需 Linux Manual 已安装） | [运行] |
| C5 | 空态 | 输入框为空时显示 Recent + Favorite | [运行] |
| C6 | 性能埋点 | 应用日志输出：Warm Launcher 显现 < 150ms、Command Search < 50ms | [运行] 读取埋点日志数值 |

## D. Command Bus（技术架构 §6）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| D1 | 统一注册 | 实现.Command/{id,title,keywords,execute}.；Core 与插件命令进入同一注册表；重复 id 注册被拒绝 | [测试] 注册表单测 |
| D2 | Launcher 解耦 | Launcher 模块仅依赖 Command/Search 接口，不 import 任何 `plugins/*` 业务实现 | [代码] 依赖检查 |
| D3 | 命令历史 | 每次执行命令写入 `command_history` 并出现在 Recent | [运行] + `sqlite3` 查库 |

## E. Plugin Runtime / SDK / Permission Broker（技术架构 §7–§13、§29–§31）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| E1 | 插件包格式 | `.workos-plugin` 为 ZIP，解包后含 `manifest.json`、`dist/`，可选 `assets/`、`optional-content/` | [命令] `unzip -l` 检查内置插件产物 |
| E2 | Manifest 校验 | schemaVersion/id/name/version/type(ui\|manual\|system)/apiVersion 必填合法，entry/permissions/commands/manual 可选；非法 manifest 安装被拒并给出原因 | [测试] 校验器单测（合法/缺字段/非法 type 用例） |
| E3 | 插件隔离运行 | UI 插件运行在独立 WebView，非主 React runtime；插件页面内 `window.__TAURI__ === undefined` 且 `window.workos` 存在 | [运行] 在插件页执行检测脚本输出结果 |
| E4 | Plugin SDK | `@work-os/plugin-sdk` 提供 `definePlugin` 与 `ctx.commands.register`；内置 5 个 UI 插件均基于 SDK 实现 | [代码] 插件源码 import 检查 |
| E5 | Plugin API V0.1 | Clipboard/Storage/HTTP/Secret/Command/Window/Notification/Dialog/Theme/Lifecycle 十类可用；`workos.clipboard.readText/writeText`、`storage.get/set`、`http.request`、`secret.get/set`、`commands.execute` 实测可用 | [测试] SDK 契约测试 + [运行] |
| E6 | Permission Broker 链路 | 每次插件 API 调用经过：Resolve Plugin ID → 校验 apiVersion → 校验 permission → Native Service；未注册插件来源的调用被拒 | [测试] broker 单测 |
| E7 | 权限拒绝 | 插件未声明 `network.request` 时 `http.request` 返回权限错误（非静默失败） | [测试] + [运行] |
| E8 | V0.1 权限集 | 支持 clipboard.read/write、storage.read/write、network.request、secret.read/write、dialog.open/save、notification.show；安装时弹权限确认 UI，插件详情可查看已授予权限 | [运行] 安装流程 + 详情页 |
| E9 | 高危权限默认关闭 | V0.1 不存在 filesystem.read/write、shell.execute 权限，manifest 声明此类权限直接校验失败 | [测试] 非法权限 manifest 用例 |
| E10 | 生命周期 | Installed→Enabled→Loaded→Activated→Running→Deactivated→Unloaded；Disable 后其命令立即从 Launcher/搜索消失，Enable 后恢复 | [运行] |
| E11 | 安装链路 | 本地 `.workos-plugin` 文件安装走完整链路：校验包 → 校验 manifest → 检查 apiVersion → sha256 校验 → 权限确认弹窗 → 安装 → 注册 commands/Manual Provider | [运行]（预置一个 sha256 不符的包验证拒装） |
| E12 | 存储 namespace 隔离 | `plugin_storage` 按 plugin_id 隔离：插件 A 无法读取插件 B 的同 key 数据 | [测试] |

## F. Plugin Manager（产品架构 §11；技术架构 §22）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| F1 | 三个页签 | Installed / Available / Developer 页签存在且各自有内容布局 | [运行] + 截图 |
| F2 | 安装来源 | 支持从本地文件安装与从静态 Registry URL 列表安装；Uninstall 卸载后插件与数据目录移除、命令消失 | [运行] 本地 http 服务托管 registry 实测 |
| F3 | 启用/禁用/更新 | Enable/Disable/Update 操作生效；registry 中更新版本可一键升级 | [运行] |
| F4 | Developer Mode | 可添加本地开发目录，未打包插件源码直接加载运行 | [运行] |
| F5 | Registry 契约 | registry.json 为 `{plugins:[{id,version,type,download,sha256}]}`；下载后 sha256 不匹配拒绝安装并提示 | [测试] + [运行] |

## G. JSON Workbench（内置插件 json-tools，P0 全量）（产品架构 §6.1）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| G1 | Format / Minify / Validate | `{"a":1,"b":[1,2]}` Format 得到缩进多行、Minify 还原单行；`{"a":}` Validate 报错并指明出错位置 | [运行] 样例输入 |
| G2 | Escape / Unescape | 含 `"`、`\`、换行的 JSON 转义后可无损还原（往返一致） | [运行] + [测试] |
| G3 | JSONPath | 样例 `$.store.book[0].title` 返回正确节点；无匹配返回空结果非报错 | [测试] + [运行] |
| G4 | JSON Diff | 两份仅一处不同的 JSON，差异路径/行高亮显示 | [运行] |
| G5 | JSON ⇄ YAML | 双向转换后与原对象深度相等 | [测试] |
| G6 | JSON → TypeScript | 样例对象生成 interface：字段名、类型（含数组/嵌套/null 联合类型）正确 | [测试] 固定样例快照 |
| G7 | 复制能力 | 各结果面板一键复制到系统剪贴板 | [运行] 粘贴验证 |

## H. API Client（内置插件 api-client）（产品架构 §6.2；技术架构 §23）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| H1 | HTTP 方法 | GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS 全部可发送，本地 echo 服务端核对方法名 | [运行] 本地服务 |
| H2 | Request 组成 | Query Params、Path Variables、Headers、Cookies 编辑生效（echo 回显核对）；Body 支持 JSON/Text/Form Data/x-www-form-urlencoded/Binary 五种，Content-Type 正确 | [运行] |
| H3 | Auth | Bearer Token → `Authorization: Bearer x`；Basic → base64 编码头；API Key → 自定义 header；echo 核对 | [运行] |
| H4 | 数据结构 | Workspace→Collection→Folder→Request 树可增删改/拖拽排序，重启应用后完整保留 | [运行] + `sqlite3` 查 `http_collections/http_requests` |
| H5 | 环境与变量 | dev/test/prod 环境可切换；`{{baseUrl}}`、`{{token}}`、`{{userId}}` 在 URL/Header/Body 中正确渲染；未定义变量有视觉提示 | [运行] |
| H6 | cURL 导入导出 | 导入 `curl -X POST 'http://localhost:PORT/echo' -H 'Content-Type: application/json' -d '{"a":1}'` 解析出方法/头/体；导出生成语义等价命令 | [测试] + [运行] |
| H7 | 走 Rust 网络栈 | 请求经 `workos.http.request` → Permission Broker → Rust Network Service：请求公网任意端点无 CORS 报错；无 `network.request` 权限时被拒 | [运行] 本地服务 + 公网端点各一次 |
| H8 | 响应与历史 | 显示状态码、耗时、响应大小、Headers、Pretty JSON；请求写入 `http_history` 并可在 History 查看重放 | [运行] + 查库 |

## I. WebSocket Workbench（内置插件 websocket）（产品架构 §6.3；技术架构 §24）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| I1 | 连接管理 | ws:// 连接/断开正常；可设置自定义 Header 与 Sub Protocol（本地 WS echo 服务核对） | [运行] 本地 `ws` echo 服务 |
| I2 | 消息类型 | 可发送 Text/JSON/Binary；收发消息带时间戳与方向（↑发送/↓接收）标记 | [运行] |
| I3 | 自动重连 | 重连开关开启后服务端断开能自动重连并提示状态变化 | [运行] 重启本地 WS 服务 |
| I4 | 历史与检索 | 消息历史可按关键词搜索、按方向过滤、JSON 消息 Pretty 展示 | [运行] |
| I5 | 会话持久化 | 连接信息保存到 `websocket_sessions`，重启后可从历史恢复连接 | [运行] + 查库 |

## J. Crypto / Encode（内置插件 crypto-tools）（产品架构 §6.4）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| J1 | Encode | Base64/URL/Hex/Unicode 编码与解码往返一致 | [测试] + [运行] |
| J2 | Hash | MD5/SHA-1/SHA-256/SHA-512 输出与已知标准值一致（如 `md5("abc")=90015098…`） | [测试] 固定向量 |
| J3 | HMAC | HMAC-SHA256 等常用组合结果与标准向量一致 | [测试] |
| J4 | 对称/非对称 | AES 加解密往返成功；RSA 密钥对生成、加解密与 Sign/Verify 通过/篡改失败两条路径均验证 | [测试] |
| J5 | JWT Decode | 解码 header/payload 并展示 exp 是否过期；签名不校验（decode 非 verify） | [测试] + [运行] |

## K. Developer Essentials（内置插件 developer-essentials）（产品架构 §6.5）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| K1 | UUID | 生成 UUID v4，支持批量，格式校验通过 | [运行] |
| K2 | Timestamp | 显示当前秒/毫秒时间戳；时间戳↔可读时间双向转换正确（含时区） | [测试] + [运行] |
| K3 | Regex | 输入正则+文本，命中高亮、捕获分组展示；非法正则提示错误 | [运行] |
| K4 | URL Parser | 解析协议/主机/端口/路径/查询参数表；与 `new URL()` 结果一致 | [测试] |
| K5 | Text Diff | 两段文本差异逐行/逐词高亮 | [运行] |
| K6 | Cron Parser | `*/5 * * * *` 解析为语义描述并给出下次执行时间；非法表达式报错 | [测试] + [运行] |

## L. Manual 体系（产品架构 §7–§9、§12；技术架构 §16–§21、§28）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| L1 | 独立仓库 | `../work-os-manual-linux` 为独立 git 仓库（remote 指向 `https://github.com/wuxiy/work-os-manual-linux`），结构含 `source/upstream.json`、`content/`、`metadata/{categories,aliases,tags}.yaml`、`scripts/{sync,normalize,validate,build}.ts`、`dist/`、`manifest.json` | [命令] `ls` + `git -C … log` |
| L2 | 构建管线 | sync（来源 jaywcjlove/linux-command，网络不通时可配置镜像/本地子集）→ normalize → validate → build 一条命令跑通，产出 `dist/index.json`、`dist/manual.db`、`dist/content/` | [命令] `pnpm manual:build`（或 workos-cli） |
| L3 | 内容量与 Schema | 文档 ≥100 篇，必含 ls/grep/find/systemctl/chmod/curl；每篇符合 ManualDocument schema（id/title/aliases/summary/category/tags/sections/source） | [测试] validate 输出 0 错误 |
| L4 | 打包 | `workos manual pack` 产出 `linux-manual.workos-plugin`（ZIP，manifest type=manual，provider=static，指向 dist 三件套） | [命令] `unzip -l` 核对 |
| L5 | 安装与搜索 | 安装后 Manual Hub 出现 Linux Manual；FTS5 搜索：命令名、别名（aliases）、中文关键词均能命中，耗时 <100ms | [运行] + 埋点日志 |
| L6 | Reader 体验 | 分类侧栏、Markdown 语法高亮、Copy Command 按钮、Related Commands、Favorite、Recent 均可用 | [运行] + 截图 |
| L7 | 内容安全 | Manual 渲染禁止 JS 与远程脚本、HTML 经 sanitize 白名单、危险 URI（javascript: 等）被拦截；只有 Copy 无 Execute 入口 | [测试] 恶意样例文档 |
| L8 | 独立版本与更新 | Manual 版本号独立于主程序（如 1.x）；registry 提供新版本后 Plugin Manager 可检测并升级 | [运行] |

## M. 存储 / Local First / 安全边界（产品架构 §2.3、§2.4；技术架构 §14、§15、§29）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| M1 | SQLite 表齐备 | 建库后存在：settings、plugins、plugin_versions、plugin_permissions、plugin_storage、http_collections、http_requests、http_history、http_environments、websocket_sessions、websocket_history、manual_sources、manual_documents、favorites、recent_items、command_history；数据库位于 macOS 标准 Application Support 路径 | [命令] `sqlite3 .schema` 核对 |
| M2 | 断网可用 | 关闭网络后：JSON、Crypto、Essentials、Manual 搜索阅读、历史/收藏全部可用（API Client/WebSocket 需网络属预期） | [运行] 关 Wi-Fi 逐项操作 |
| M3 | Secret 入 Keychain | `workos.secret.set/get` 的值存于 macOS Keychain；SQLite 全库字符串搜不到该值 | [命令] `security find-generic-password` + `strings` 库文件 |
| M4 | 插件四无 | 插件环境无 Node.js、无 `window.__TAURI__`、无任意 Shell、无任意文件系统访问（与 E3/E9 联合验证） | [测试] + [运行] |
| M5 | 包完整性 | 所有安装来源（本地/registry）均强制 sha256 校验，不符拒装（与 E11/F5 联合验证） | [测试] |

## N. 性能（技术架构 §38）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| N1 | Warm Launcher 显现 | < 150ms（应用埋点日志为准） | [运行] |
| N2 | Command Search | < 50ms | [运行] 埋点日志 |
| N3 | Manual Search | < 100ms | [运行] 埋点日志 |
| N4 | Plugin Open | < 300ms（从点击到插件 UI 可交互，目标值） | [运行] 埋点日志 |

## O. 构建分发与自动更新（技术架构 §35、§36；产品架构 §17）

| 编号 | 验收项 | 通过标准 | 验证方式 |
|---|---|---|---|
| O1 | 本机构建 | `pnpm tauri build`（x86_64）产出 .app 与 .dmg，产物可打开运行 | [命令] + [运行] 启动产物 |
| O2 | Universal 构建 | 产出 Universal 产物，`lipo -info` 显示 x86_64+aarch64 双架构 | [命令] |
| O3 | 签名/公证/Stapling **（条件）** | ~~提供开发者凭据时执行~~ **已确认无 Developer ID → 记录「跳过-缺凭据」**（构建脚本保留凭据开关，供未来启用） | 记录跳过 |
| O4 | Auto Update 基础能力 | Settings 可配置更新源；检查更新能正确报告「无更新/有更新」并后台下载；macOS 实际安装更新依赖签名（**条件**） | [运行] 本地静态服务托管 updater feed |
| O5 | 本地 CI 就绪 | lint/typecheck/rust check/test/build 均可本地一键执行（A8 覆盖）；CI 配置文件存在且步骤与之一致 | [命令] |

## P. 范围外（出现即不合格）

Windows/Linux 平台构建；账号/SaaS/云同步/WebDAV/团队协作；Workflow 自动化；AI Agent；插件市场后台（评论、评分、支付、开发者账号、推荐算法）；Vector DB；JSON⇄XML 与 JSON→Java Class（P1）；Git/Docker/K8s/PostgreSQL/Redis 等后续手册（手册中心只显示实际已安装的 Linux Manual，不得出现占位假手册数据——设计稿中多本手册仅为示意）。

## Q. 已确认决策（2026-08-16）

1. **UI 文案语言**：全中文界面（与 `ui/` 设计稿一致）。
2. **Linux Manual 仓库**：独立仓库 `https://github.com/wuxiy/work-os-manual-linux`，本地开发目录为 sibling 路径 `../work-os-manual-linux`（独立 git 仓库）。
3. **签名凭据**：无 Apple Developer ID → O3 与 O4 的「macOS 更新应用」按条件项记录「跳过-缺凭据」；O4 的检查/下载仍需实现并验证。
4. **手册内容规模**：核心命令子集（≥100 篇，必含 ls/grep/find/systemctl/chmod/curl），管线结构支持后续全量同步。

---

*验证执行说明：开发完成后将实际运行项目（`tauri dev` 与打包产物），按本清单逐项执行并输出带证据（命令输出、截图、库内查询、测试报告）的验证报告；未通过项修复后复验直至全部通过。*
