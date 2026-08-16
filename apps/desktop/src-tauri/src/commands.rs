//! 宿主命令（Workbench / Launcher 前端专用；插件 WebView 调用被拒绝）

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Webview, Wry};
use tauri_plugin_dialog::DialogExt;
use workos_core::AppState;

use crate::state::{plugins_root, LAUNCHER_SHOWN_AT};
use crate::surface::{self, SurfaceRect};
use crate::windows;

fn host_only(webview: &Webview<Wry>) -> Result<(), String> {
    if AppState::host_label(webview.label()) {
        Ok(())
    } else {
        Err("仅宿主窗口可调用此命令".into())
    }
}

fn st() -> std::sync::Arc<AppState> {
    workos_core::global()
}

#[tauri::command]
pub fn get_app_info() -> Value {
    json!({ "name": "Work-OS", "version": env!("CARGO_PKG_VERSION") })
}

/// UI 调试/取证通道（仅宿主）
#[tauri::command]
pub fn debug_log(webview: Webview<Wry>, msg: String) -> Result<(), String> {
    host_only(&webview)?;
    tracing::info!("[ui:{}] {}", webview.label(), msg);
    Ok(())
}

/// 验收取证辅助：运行时统计
#[tauri::command]
pub fn debug_stats(_app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    let s = st();
    let plugins = s.storage.plugins_list(false).map_err(|e| e.to_string())?;
    Ok(json!({
        "plugins": plugins.len(),
        "enabledPlugins": plugins.iter().filter(|p| p.enabled).count(),
        "manualDocs": s.storage.manual_docs_count().unwrap_or(0),
        "wsOpenSessions": s.ws.open_sessions(),
        "favorites": s.storage.favorites_list().unwrap_or_default().len(),
        "recentItems": s.storage.list_recent(None, 1000).unwrap_or_default().len(),
    }))
}

#[tauri::command]
pub fn launcher_ready(_app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<(), String> {
    host_only(&webview)?;
    if let Some(t0) = *LAUNCHER_SHOWN_AT.lock() {
        let ms = t0.elapsed().as_secs_f64() * 1000.0;
        tracing::info!("[perf] warm_launcher_show {:.1}ms", ms);
    }
    Ok(())
}

#[tauri::command]
pub fn launcher_hide(webview: Webview<Wry>) -> Result<(), String> {
    host_only(&webview)?;
    if let Some(w) = app_window(&webview, "launcher") {
        let _ = w.hide();
    }
    Ok(())
}

fn app_window(webview: &Webview<Wry>, label: &str) -> Option<tauri::WebviewWindow<Wry>> {
    webview.app_handle().get_webview_window(label)
}

#[tauri::command]
pub fn record_command(_app: AppHandle<Wry>, webview: Webview<Wry>, id: String, input: Option<String>, title: Option<String>) -> Result<(), String> {
    host_only(&webview)?;
    let s = st();
    s.storage.record_command(&id, input.as_deref()).map_err(|e| e.to_string())?;
    if let Some(t) = title {
        s.storage.add_recent("command", &id, &t).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn recent_list(_app: AppHandle<Wry>, webview: Webview<Wry>, kind: Option<String>, limit: Option<i64>) -> Result<Value, String> {
    host_only(&webview)?;
    let items = st().storage.list_recent(kind.as_deref(), limit.unwrap_or(20)).map_err(|e| e.to_string())?;
    Ok(json!(items))
}

#[tauri::command]
pub fn favorites_list(_app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    Ok(json!(st().storage.favorites_list().map_err(|e| e.to_string())?))
}

#[tauri::command]
pub fn favorite_toggle(_app: AppHandle<Wry>, webview: Webview<Wry>, kind: String, reference: String, title: String) -> Result<bool, String> {
    host_only(&webview)?;
    st()
        .storage
        .toggle_favorite(&kind, &reference, &title)
        .map_err(|e| e.to_string())
}

// ---------- 主题 ----------

#[tauri::command]
pub fn theme_get(app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    let s = st();
    let mode = s.storage.setting_get("theme").ok().flatten().unwrap_or_else(|| "system".into());
    Ok(json!({ "mode": mode, "resolved": crate::state::resolved_theme(&app) }))
}

#[tauri::command]
pub fn theme_set(app: AppHandle<Wry>, webview: Webview<Wry>, mode: String) -> Result<(), String> {
    host_only(&webview)?;
    let s = st();
    s.storage.setting_set("theme", &mode).map_err(|e| e.to_string())?;
    crate::state::apply_theme(&app, &mode);
    let resolved = crate::state::resolved_theme(&app);
    let _ = app.emit_to("workbench", "workos://theme", &resolved);
    let _ = app.emit_to("launcher", "workos://theme", &resolved);
    surface::broadcast_theme(&app, &resolved);
    Ok(())
}

// ---------- 通用设置 ----------

#[tauri::command]
pub fn setting_get(_app: AppHandle<Wry>, webview: Webview<Wry>, key: String) -> Result<Value, String> {
    host_only(&webview)?;
    Ok(json!(st().storage.setting_get(&key).ok().flatten()))
}

#[tauri::command]
pub fn setting_set(_app: AppHandle<Wry>, webview: Webview<Wry>, key: String, value: String) -> Result<(), String> {
    host_only(&webview)?;
    st().storage.setting_set(&key, &value).map_err(|e| e.to_string())
}

// ---------- 插件管理（产品架构 §11）----------

#[tauri::command]
pub fn plugin_list(_app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    let s = st();
    let rows = s.storage.plugins_list(false).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for mut row in rows {
        let perms = s.storage.permissions_list(&row.id).unwrap_or_default();
        row.manifest_json = String::new(); // 前端不需要原始 manifest
        out.push(json!({ "row": row, "permissions": perms }));
    }
    Ok(json!(out))
}

#[tauri::command]
pub fn plugin_commands(app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    let s = st();
    let installer = workos_plugin_runtime::Installer::new(&s.storage, plugins_root(&app));
    let commands = installer.collect_commands().map_err(|e| e.to_string())?;
    Ok(json!(commands))
}

#[tauri::command]
pub fn plugin_set_enabled(app: AppHandle<Wry>, webview: Webview<Wry>, id: String, enabled: bool) -> Result<(), String> {
    host_only(&webview)?;
    let s = st();
    if enabled {
        // 重新启用时恢复授权
        if let Ok(Some(row)) = s.storage.plugin_row(&id) {
            if let Ok(m) = serde_json::from_str::<Value>(&row.manifest_json) {
                let perms: Vec<String> = m
                    .get("permissions")
                    .and_then(Value::as_array)
                    .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                    .unwrap_or_default();
                s.storage.permissions_grant(&id, &perms).map_err(|e| e.to_string())?;
                s.broker.grant(&id, row.api_version as u32, &perms);
            }
        }
    } else {
        s.broker.revoke_all(&id);
        surface::hide(&app, &id);
    }
    s.storage.plugin_set_enabled(&id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn plugin_uninstall(app: AppHandle<Wry>, webview: Webview<Wry>, id: String) -> Result<(), String> {
    host_only(&webview)?;
    let s = st();
    surface::plugin_webview_close(&app, &id);
    s.broker.revoke_all(&id);
    let installer = workos_plugin_runtime::Installer::new(&s.storage, plugins_root(&app));
    installer.uninstall(&id).map_err(|e| e.to_string())
}

/// 选择本地 .workos-plugin → 校验（hash + manifest）→ 返回待确认信息（前端弹权限确认）
#[tauri::command]
pub async fn plugin_pick_and_validate(app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    let picked = app
        .dialog()
        .file()
        .add_filter("Work-OS 插件包", &["workos-plugin"])
        .blocking_pick_file();
    let path = picked
        .and_then(|p| p.into_path().ok())
        .ok_or_else(|| "未选择文件".to_string())?;
    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
    validate_staged(&app, bytes).await
}

async fn validate_staged(_app: &AppHandle<Wry>, bytes: Vec<u8>) -> Result<Value, String> {
    let s = st();
    let (manifest, raw) = workos_plugin_runtime::Installer::inspect_zip(&bytes)
        .map_err(|e| format!("包校验失败：{e}"))?;
    // 暂存到 temp 供确认后安装
    let tmp = std::env::temp_dir().join(format!("workos-stage-{}-{}.zip", manifest.id, manifest.version));
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    let sha = workos_plugin_runtime::sha256_hex(&bytes);
    Ok(json!({
        "stagedPath": tmp.to_string_lossy(),
        "manifest": raw,
        "sha256": sha,
        "size": bytes.len(),
        "isNew": s.storage.plugin_row(&manifest.id).ok().flatten().map(|r| r.version != manifest.version).unwrap_or(true),
    }))
}

/// 权限确认后执行安装（E11 完整链路：校验包→manifest→apiVersion→hash→权限确认→安装→注册）
#[tauri::command]
pub async fn plugin_install_confirmed(
    app: AppHandle<Wry>,
    webview: Webview<Wry>,
    staged_path: String,
    permissions: Vec<String>,
) -> Result<Value, String> {
    host_only(&webview)?;
    let bytes = tokio::fs::read(&staged_path).await.map_err(|e| format!("读取暂存包失败：{e}"))?;
    let s = st();
    let installer = workos_plugin_runtime::Installer::new(&s.storage, plugins_root(&app));
    // 再校验一次（暂存期间文件可能被改动）
    let _ = workos_plugin_runtime::Installer::inspect_zip(&bytes).map_err(|e| format!("包校验失败：{e}"))?;
    for p in &permissions {
        if !workos_permission::is_valid_permission(p) {
            return Err(format!("非法权限：{p}"));
        }
    }
    let m = installer
        .install_zip(&bytes, "local", &permissions)
        .map_err(|e| format!("安装失败：{e}"))?;
    s.broker.grant(&m.id, m.api_version.parse().unwrap_or(1), &permissions);
    let _ = std::fs::remove_file(&staged_path);
    tracing::info!("插件已安装：{} {}（来源 local）", m.id, m.version);
    Ok(json!({ "id": m.id, "version": m.version }))
}

/// 从 Registry 下载安装（F2/F5）：下载 → sha256 校验 → 权限确认（两段式与本地安装一致）
#[tauri::command(async)]
pub async fn plugin_install_registry(
    app: AppHandle<Wry>,
    webview: Webview<Wry>,
    registry_url: String,
    plugin_id: String,
) -> Result<Value, String> {
    host_only(&webview)?;
    let registry = workos_plugin_runtime::fetch_registry(&registry_url)
        .await
        .map_err(|e| e.to_string())?;
    let entry = registry
        .plugins
        .iter()
        .find(|p| p.id == plugin_id)
        .ok_or_else(|| format!("registry 中不存在插件：{plugin_id}"))?;
    let download_url = absolutize(&registry_url, &entry.download);
    let bytes = workos_plugin_runtime::download_plugin(&download_url)
        .await
        .map_err(|e| e.to_string())?;
    if !entry.sha256.is_empty() {
        workos_plugin_runtime::Installer::verify_sha256(&bytes, &entry.sha256)
            .map_err(|e| format!("安装中止：{e}"))?;
    }
    let v = validate_staged(&app, bytes).await?;
    Ok(v)
}

fn absolutize(base: &str, download: &str) -> String {
    if download.starts_with("http://") || download.starts_with("https://") {
        download.to_string()
    } else {
        let trimmed = base.trim_end_matches('/');
        let mut prefix = trimmed.to_string();
        if let Some(pos) = trimmed.rfind('/') {
            prefix = trimmed[..pos].to_string();
        }
        format!("{}/{}", prefix, download.trim_start_matches('/'))
    }
}

/// Developer Mode：选择本地开发目录加载（F4）
#[tauri::command(async)]
pub async fn plugin_install_dev(app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    let picked = app
        .dialog()
        .file()
        .blocking_pick_folder();
    let dir = picked
        .and_then(|p| p.into_path().ok())
        .ok_or_else(|| "未选择目录".to_string())?;
    let s = st();
    let installer = workos_plugin_runtime::Installer::new(&s.storage, plugins_root(&app));
    let m = installer.install_dev(&dir).map_err(|e| format!("开发插件加载失败：{e}"))?;
    s.broker.grant(&m.id, m.api_version.parse().unwrap_or(1), &m.permissions);
    tracing::info!("开发插件已加载：{} → {}", m.id, dir.display());
    Ok(json!({ "id": m.id, "version": m.version, "path": dir.to_string_lossy() }))
}

// ---------- Registry 配置 ----------

#[tauri::command]
pub fn registry_list(_app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    let raw = st().storage.setting_get("registryUrls").ok().flatten().unwrap_or_else(|| "[]".into());
    let urls: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(json!(urls))
}

#[tauri::command]
pub fn registry_save(_app: AppHandle<Wry>, webview: Webview<Wry>, urls: Vec<String>) -> Result<(), String> {
    host_only(&webview)?;
    let raw = serde_json::to_string(&urls).map_err(|e| e.to_string())?;
    st().storage.setting_set("registryUrls", &raw).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub async fn registry_fetch(_app: AppHandle<Wry>, webview: Webview<Wry>, url: String) -> Result<Value, String> {
    host_only(&webview)?;
    let doc = workos_plugin_runtime::fetch_registry(&url).await.map_err(|e| e.to_string())?;
    Ok(json!(doc))
}

// ---------- Manual（Manual Hub 统一体验，产品架构 §7）----------

#[tauri::command]
pub fn manual_sources(_app: AppHandle<Wry>, webview: Webview<Wry>) -> Result<Value, String> {
    host_only(&webview)?;
    Ok(json!(st().storage.manual_sources_list().map_err(|e| e.to_string())?))
}

#[tauri::command]
pub fn manual_search(_app: AppHandle<Wry>, webview: Webview<Wry>, query: String, limit: Option<i64>) -> Result<Value, String> {
    host_only(&webview)?;
    let t0 = std::time::Instant::now();
    let hits = st()
        .storage
        .search_manual(&query, limit.unwrap_or(20))
        .map_err(|e| e.to_string())?;
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    tracing::info!("[perf] manual_search {:.1}ms ({} hits)", ms, hits.len());
    Ok(json!(hits))
}

#[tauri::command]
pub fn manual_doc(_app: AppHandle<Wry>, webview: Webview<Wry>, source_id: String, doc_id: String) -> Result<Value, String> {
    host_only(&webview)?;
    let s = st();
    let doc = s
        .storage
        .manual_doc(&source_id, &doc_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "文档不存在".to_string())?;
    s.storage.add_recent("manual", &doc_id, &doc.title).ok();
    Ok(json!(doc))
}

#[tauri::command]
pub fn manual_list(_app: AppHandle<Wry>, webview: Webview<Wry>, source_id: String) -> Result<Value, String> {
    host_only(&webview)?;
    Ok(json!(st().storage.manual_doc_list(&source_id).map_err(|e| e.to_string())?))
}

#[tauri::command]
pub fn manual_categories(_app: AppHandle<Wry>, webview: Webview<Wry>, source_id: String) -> Result<Value, String> {
    host_only(&webview)?;
    Ok(json!(st().storage.manual_categories(&source_id).map_err(|e| e.to_string())?))
}

#[tauri::command]
pub fn manual_recent(_app: AppHandle<Wry>, webview: Webview<Wry>, limit: Option<i64>) -> Result<Value, String> {
    host_only(&webview)?;
    Ok(json!(st().storage.list_recent(Some("manual"), limit.unwrap_or(10)).map_err(|e| e.to_string())?))
}

#[tauri::command]
pub fn http_recent(_app: AppHandle<Wry>, webview: Webview<Wry>, limit: Option<i64>) -> Result<Value, String> {
    host_only(&webview)?;
    Ok(json!(st().storage.http_history_list(limit.unwrap_or(10)).map_err(|e| e.to_string())?))
}

// ---------- 打开工具/手册（Launcher 与插件命令的统一落点）----------

#[tauri::command]
pub fn open_tool(_app: AppHandle<Wry>, webview: Webview<Wry>, plugin_id: String, code: Option<String>, payload: Option<Value>) -> Result<(), String> {
    host_only(&webview)?;
    tracing::info!("[open_tool] plugin={plugin_id} code={}", code.clone().unwrap_or_default());
    let app = &_app;
    windows::show_workbench(app);
    let _ = app.emit_to(
        "workbench",
        "workos://open-tool",
        json!({ "pluginId": plugin_id, "code": code, "payload": payload }),
    );
    Ok(())
}

#[tauri::command]
pub fn open_manual(app: AppHandle<Wry>, webview: Webview<Wry>, source_id: String, doc_id: String) -> Result<(), String> {
    host_only(&webview)?;
    windows::show_workbench(&app);
    let _ = app.emit_to(
        "workbench",
        "workos://navigate",
        json!({ "route": format!("/manuals/{source_id}/{doc_id}") }),
    );
    Ok(())
}

#[tauri::command]
pub fn navigate_workbench(app: AppHandle<Wry>, webview: Webview<Wry>, route: String) -> Result<(), String> {
    host_only(&webview)?;
    windows::show_workbench(&app);
    let _ = app.emit_to("workbench", "workos://navigate", json!({ "route": route }));
    Ok(())
}

// ---------- Surface ----------

#[tauri::command]
pub fn surface_open(app: AppHandle<Wry>, webview: Webview<Wry>, plugin_id: String, rect: SurfaceRect, enter: Option<Value>) -> Result<(), String> {
    host_only(&webview)?;
    surface::open(&app, &plugin_id, &rect, enter)
}

#[tauri::command]
pub fn surface_update_rect(_app: AppHandle<Wry>, webview: Webview<Wry>, plugin_id: String, rect: SurfaceRect) -> Result<(), String> {
    host_only(&webview)?;
    let label = workos_core::AppState::plugin_label(&plugin_id);
    if let Some(wv) = _app.get_webview(&label) {
        let scale = _app.get_webview_window("workbench").map(|w| w.scale_factor().unwrap_or(1.0)).unwrap_or(1.0);
        surface::position(&wv, &rect, scale);
    }
    Ok(())
}

#[tauri::command]
pub fn surface_hide(app: AppHandle<Wry>, webview: Webview<Wry>, plugin_id: String) -> Result<(), String> {
    host_only(&webview)?;
    surface::hide(&app, &plugin_id);
    Ok(())
}

// ---------- Updater（基础能力，O4）----------

#[tauri::command]
pub fn updater_set_pubkey(_app: AppHandle<Wry>, webview: Webview<Wry>, pubkey: String) -> Result<(), String> {
    host_only(&webview)?;
    st().storage.setting_set("updaterPubkey", &pubkey).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub async fn updater_check(app: AppHandle<Wry>, webview: Webview<Wry>, feed_url: String) -> Result<Value, String> {
    host_only(&webview)?;
    use tauri_plugin_updater::UpdaterExt;
    let s = st();
    s.storage.setting_set("updaterFeed", &feed_url).ok();
    let pubkey = s.storage.setting_get("updaterPubkey").ok().flatten().unwrap_or_default();
    // 协议安全门：仅环回地址允许 http（本地更新源），公网必须 https
    let is_loopback = feed_url.starts_with("http://127.0.0.1") || feed_url.starts_with("http://localhost");
    if feed_url.starts_with("http://") && !is_loopback {
        return Err("更新源必须使用 https（仅 127.0.0.1/localhost 允许 http）".into());
    }
    let mut builder = app.updater_builder();
    builder = builder
        .endpoints(vec![feed_url.parse().map_err(|e| format!("非法更新源：{e}"))?])
        .map_err(|e| e.to_string())?;
    if !pubkey.is_empty() {
        builder = builder.pubkey(pubkey);
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(json!({
            "available": true,
            "version": update.version,
            "notes": update.body.clone().unwrap_or_default(),
            "date": update.date.map(|d| d.to_string()).unwrap_or_default(),
        })),
        Ok(None) => Ok(json!({ "available": false })),
        Err(e) => Err(format!("检查更新失败：{e}")),
    }
}
