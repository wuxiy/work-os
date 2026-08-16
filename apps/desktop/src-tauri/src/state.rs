//! 应用状态辅助：主题、内置插件引导

use std::time::Instant;

use parking_lot::Mutex;
use tauri::{AppHandle, Manager, Theme, Wry};

/// 最近一次 Launcher 显示时刻（用于 Warm Show 埋点）
pub static LAUNCHER_SHOWN_AT: Mutex<Option<Instant>> = Mutex::new(None);

/// 解析后的有效主题（插件 theme.get 使用）
pub fn resolved_theme(app: &AppHandle<Wry>) -> String {
    let setting = workos_core::global()
        .storage
        .setting_get("theme")
        .unwrap_or(None)
        .unwrap_or_else(|| "system".into());
    if setting == "system" {
        if let Some(w) = app.get_webview_window("workbench") {
            if let Ok(t) = w.theme() {
                return if t == Theme::Dark { "dark".into() } else { "light".into() };
            }
        }
        "dark".into()
    } else {
        setting
    }
}

pub fn init_theme(app: &AppHandle<Wry>) {
    let mode = workos_core::global()
        .storage
        .setting_get("theme")
        .unwrap_or(None)
        .unwrap_or_else(|| "system".into());
    apply_theme(app, &mode);
}

pub fn apply_theme(app: &AppHandle<Wry>, mode: &str) {
    let theme = match mode {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None, // system
    };
    for label in ["workbench", "launcher"] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.set_theme(theme);
        }
    }
}

pub fn builtin_plugins_dir(app: &AppHandle<Wry>) -> std::path::PathBuf {
    // 开发态：仓库内 src-tauri/plugins（由 scripts/pack-plugins.mjs 生成）
    // 发布态：资源目录 plugins/
    if cfg!(debug_assertions) {
        let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins");
        if dev.exists() {
            return dev;
        }
    }
    use tauri::Manager;
    app.path()
        .resource_dir()
        .map(|d| d.join("plugins"))
        .unwrap_or_else(|_| std::path::PathBuf::from("plugins"))
}

pub fn plugins_root(app: &AppHandle<Wry>) -> std::path::PathBuf {
    let data = app.path().app_data_dir().expect("app_data_dir");
    let root = data.join("plugins");
    let _ = std::fs::create_dir_all(&root);
    root
}
