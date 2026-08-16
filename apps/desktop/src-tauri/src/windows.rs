//! 窗口管理：Launcher 显隐（含 Warm Show 埋点）、全局快捷键

use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::state::LAUNCHER_SHOWN_AT;

pub fn register_hotkey(app: AppHandle<Wry>) {
    let app2 = app.clone();
    let result = app.global_shortcut().on_shortcut(
        "alt+space".parse::<Shortcut>().expect("快捷键解析失败"),
        move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                toggle_launcher(app);
            }
        },
    );
    if let Err(e) = result {
        tracing::warn!("全局快捷键注册失败（可能被占用）：{e}");
    }
    let _ = app2;
}

pub fn toggle_launcher(app: &AppHandle<Wry>) {
    if let Some(w) = app.get_webview_window("launcher") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            let _ = app.emit("workos://launcher-hidden", ());
        } else {
            *LAUNCHER_SHOWN_AT.lock() = Some(Instant::now());
            // 顶部居中（屏幕 22% 高度处），符合 u-tools 类启动器习惯
            if let Ok(Some(monitor)) = w.current_monitor() {
                let size = monitor.size();
                let scale = monitor.scale_factor();
                let win_w = (720.0 * scale).round();
                let x = (size.width as f64 - win_w) / 2.0;
                let y = size.height as f64 * 0.22;
                let _ = w.set_position(tauri::PhysicalPosition::new(x.round() as i32, y.round() as i32));
            }
            let _ = w.show();
            let _ = w.set_focus();
            // 前端 ready 后回报 launcher_ready → 输出 warm show 埋点
            let _ = app.emit_to("launcher", "workos://launcher-shown", ());
        }
    }
}

pub fn show_workbench(app: &AppHandle<Wry>) {
    if let Some(w) = app.get_webview_window("workbench") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
