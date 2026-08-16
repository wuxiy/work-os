//! Plugin Surface：Workbench 内嵌插件 WebView 的生命周期与布局（技术架构 §10）

use std::time::Instant;

use parking_lot::Mutex;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::state::plugins_root;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

static OPEN_AT: once_cell::sync::Lazy<Mutex<std::collections::HashMap<String, Instant>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(std::collections::HashMap::new()));

fn plugin_label(plugin_id: &str) -> String {
    workos_core::AppState::plugin_label(plugin_id)
}

fn entry_of(_app: &AppHandle<Wry>, plugin_id: &str) -> String {
    let st = workos_core::global();
    if let Ok(Some(row)) = st.storage.plugin_row(plugin_id) {
        if let Ok(v) = serde_json::from_str::<Value>(&row.manifest_json) {
            if let Some(e) = v.get("entry").and_then(Value::as_str) {
                return e.trim_start_matches('/').to_string();
            }
        }
    }
    "dist/index.html".into()
}

/// 打开（或复用）插件 Surface：创建子 WebView、定位、派发 enter 事件
pub fn open(app: &AppHandle<Wry>, plugin_id: &str, rect: &SurfaceRect, enter: Option<Value>) -> Result<(), String> {
    let label = plugin_label(plugin_id);
    let window = app.get_webview_window("workbench").ok_or("workbench 窗口不存在")?;
    let scale = window.scale_factor().unwrap_or(1.0);

    let existing = app.get_webview(&label);
    let webview = match existing {
        Some(wv) => {
            position(&wv, rect, scale);
            wv
        }
        None => {
            let entry = entry_of(app, plugin_id);
            let url: tauri::Url = format!("workos-plugin://{plugin_id}/{entry}")
                .parse()
                .map_err(|e| format!("插件 URL 构造失败：{e}"))?;
            let builder = tauri::WebviewBuilder::new(&label, tauri::WebviewUrl::External(url));
            let win = window.as_ref().window();
            let wv = win
                .add_child(
                    builder,
                    tauri::PhysicalPosition::new((rect.x * scale).round() as i32, (rect.y * scale).round() as i32),
                    tauri::PhysicalSize::new((rect.w * scale).round() as u32, (rect.h * scale).round() as u32),
                )
                .map_err(|e| format!("创建插件 WebView 失败：{e}"))?;
            position(&wv, rect, scale);
            OPEN_AT.lock().insert(plugin_id.to_string(), Instant::now());
            tracing::info!("插件 Surface 已创建：{label}");
            wv
        }
    };

    if let Some(enter) = enter {
        let st = workos_core::global();
        st.pending_enter.lock().insert(label.clone(), enter);
        // 已 ready 的插件立即派发；否则等 lifecycle.ready 再派发
        if st.plugin_ready.lock().contains(&label) {
            dispatch_enter(app, &label);
        }
    }
    let _ = webview.show();
    Ok(())
}

pub fn position(webview: &tauri::Webview<Wry>, rect: &SurfaceRect, scale: f64) {
    let _ = webview.set_position(tauri::PhysicalPosition::new(
        (rect.x * scale).round() as i32,
        (rect.y * scale).round() as i32,
    ));
    let _ = webview.set_size(tauri::PhysicalSize::new(
        (rect.w * scale).round() as u32,
        (rect.h * scale).round() as u32,
    ));
}

fn dispatch_enter(app: &AppHandle<Wry>, label: &str) {
    let payload = workos_core::global().pending_enter.lock().remove(label);
    if let Some(payload) = payload {
        let _ = app.emit_to(label, "workos://enter", payload);
    }
}

/// 插件回报 ready（bridge lifecycle.ready）：补发 enter + 记录 Plugin Open 埋点
pub fn mark_ready(app: &AppHandle<Wry>, plugin_id: &str) {
    let label = plugin_label(plugin_id);
    let st = workos_core::global();
    let first = st.plugin_ready.lock().insert(label.clone());
    if first {
        if let Some(t0) = OPEN_AT.lock().remove(plugin_id) {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            tracing::info!("[perf] plugin_open {plugin_id} {:.1}ms", ms);
        }
    }
    dispatch_enter(app, &label);
}

pub fn hide(app: &AppHandle<Wry>, plugin_id: &str) {
    if let Some(wv) = app.get_webview(&plugin_label(plugin_id)) {
        let _ = wv.hide();
        let st = workos_core::global();
        let _ = app.emit_to(plugin_label(plugin_id), "workos://out", ());
        st.plugin_ready.lock().remove(&plugin_label(plugin_id));
    }
}

/// 主题变化广播到所有插件 WebView
pub fn broadcast_theme(app: &AppHandle<Wry>, theme: &str) {
    let st = workos_core::global();
    if let Ok(rows) = st.storage.plugins_list(false) {
        for row in rows {
            let label = plugin_label(&row.id);
            if app.get_webview(&label).is_some() {
                let _ = app.emit_to(&label, "workos://theme", theme);
            }
        }
    }
}

/// 插件目录（卸载后 WebView 关闭时也用）
pub fn plugin_webview_close(app: &AppHandle<Wry>, plugin_id: &str) {
    if let Some(wv) = app.get_webview(&plugin_label(plugin_id)) {
        let _ = wv.close();
    }
    let _ = plugins_root(app);
}
