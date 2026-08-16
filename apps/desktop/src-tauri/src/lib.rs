//! Work-OS —— 本地优先、插件驱动的开发者工作台

mod bridge;
mod commands;
mod protocol;
mod state;
mod surface;
mod windows;

use std::sync::Arc;

use tauri::Manager;

use workos_core::AppState;
use workos_storage::Storage;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_uri_scheme_protocol("workos-plugin", protocol::handle)
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::debug_log,
            commands::debug_stats,
            commands::launcher_ready,
            commands::launcher_hide,
            commands::record_command,
            commands::recent_list,
            commands::favorites_list,
            commands::favorite_toggle,
            commands::theme_get,
            commands::theme_set,
            commands::setting_get,
            commands::setting_set,
            commands::plugin_list,
            commands::plugin_commands,
            commands::plugin_set_enabled,
            commands::plugin_uninstall,
            commands::plugin_pick_and_validate,
            commands::plugin_install_confirmed,
            commands::plugin_install_registry,
            commands::plugin_install_dev,
            commands::registry_list,
            commands::registry_save,
            commands::registry_fetch,
            commands::manual_sources,
            commands::manual_search,
            commands::manual_doc,
            commands::manual_list,
            commands::manual_categories,
            commands::manual_recent,
            commands::http_recent,
            commands::open_tool,
            commands::open_manual,
            commands::navigate_workbench,
            commands::surface_open,
            commands::surface_update_rect,
            commands::surface_hide,
            commands::updater_check,
            commands::updater_set_pubkey,
            bridge::plugin_bridge,
        ])
        .setup(|app| {
                        let app_data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data)?;

            let db_path = app_data.join("workos.db");
            let storage = Arc::new(Storage::open(&db_path).expect("打开 SQLite 失败"));
            tracing::info!("storage ready: {}", db_path.display());

            let state = AppState::new(storage.clone());

            // 事件出口：WS 消息推送到对应插件 WebView
            {
                let handle = app.handle().clone();
                state.ws.init(storage.clone(), Arc::new(move |label, event, payload| {
                    use tauri::Emitter;
                    let _ = handle.emit_to(label, event, payload);
                }));
            }

            // 全局状态注册（async 命令使用 global() 访问）——必须最先
            let state = std::sync::Arc::new(state);
            workos_core::set_global(state.clone());

            // 主题初始化（跟随系统）
            state::init_theme(app.handle());

            // 内置插件引导（技术架构 §32：第一方工具与第三方走同一运行时）
            {
                let installer = workos_plugin_runtime::Installer::new(&state.storage, state::plugins_root(app.handle()));
                match installer.bootstrap_builtin(&state::builtin_plugins_dir(app.handle())) {
                    Ok(list) if !list.is_empty() => tracing::info!("内置插件已引导：{list:?}"),
                    Ok(_) => {}
                    Err(e) => tracing::warn!("内置插件引导失败：{e}"),
                }
                state.reload_grants();
            }

            // 内置插件引导（技术架构 §32：第一方工具与第三方走同一运行时）
            {
                let installer = workos_plugin_runtime::Installer::new(&state.storage, state::plugins_root(app.handle()));
                match installer.bootstrap_builtin(&state::builtin_plugins_dir(app.handle())) {
                    Ok(list) if !list.is_empty() => tracing::info!("内置插件已引导：{list:?}"),
                    Ok(_) => {}
                    Err(e) => tracing::warn!("内置插件引导失败：{e}"),
                }
                state.reload_grants();
            }

            // 全局快捷键 ⌥Space（产品架构 §4）
            windows::register_hotkey(app.handle().clone());

            // 原生菜单（B6）：⌘L 显示/隐藏启动器（稳定可控）+ About/Quit
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
                let toggle_launcher = MenuItemBuilder::with_id("toggle-launcher", "显示/隐藏启动器")
                    .accelerator("CmdOrCtrl+L")
                    .build(app)?;
                let v_clear = MenuItemBuilder::with_id("verify.launcher-clear", "启动器：清空输入").build(app)?;
                let v_systemctl = MenuItemBuilder::with_id("verify.launcher-systemctl", "启动器：搜索 systemctl 并回车").build(app)?;
                let v_json = MenuItemBuilder::with_id("verify.launcher-json", "启动器：粘贴 JSON 并回车").build(app)?;
                let v_home = MenuItemBuilder::with_id("verify.nav-home", "导航：首页").build(app)?;
                let v_dev = MenuItemBuilder::with_id("verify.nav-developer", "导航：开发者工具").build(app)?;
                let v_manuals = MenuItemBuilder::with_id("verify.nav-manuals", "导航：手册中心").build(app)?;
                let v_plugins = MenuItemBuilder::with_id("verify.nav-plugins", "导航：插件页").build(app)?;
                let v_settings = MenuItemBuilder::with_id("verify.nav-settings", "导航：设置").build(app)?;
                let v_theme = MenuItemBuilder::with_id("verify.theme-toggle", "切换主题").build(app)?;
                let v_updater = MenuItemBuilder::with_id("verify.updater-check", "检查更新（本地源）").build(app)?;
                let main_menu = MenuBuilder::new(app)
                    .items(&[
                        &SubmenuBuilder::new(app, "Work-OS")
                            .item(&PredefinedMenuItem::about(app, None, None)?)
                            .separator()
                            .item(&PredefinedMenuItem::hide(app, None)?)
                            .item(&PredefinedMenuItem::quit(app, None)?)
                            .build()?,
                        &SubmenuBuilder::new(app, "编辑")
                            .item(&PredefinedMenuItem::undo(app, None)?)
                            .item(&PredefinedMenuItem::redo(app, None)?)
                            .separator()
                            .item(&PredefinedMenuItem::cut(app, None)?)
                            .item(&PredefinedMenuItem::copy(app, None)?)
                            .item(&PredefinedMenuItem::paste(app, None)?)
                            .item(&PredefinedMenuItem::select_all(app, None)?)
                            .build()?,
                        &SubmenuBuilder::new(app, "视图")
                            .item(&toggle_launcher)
                            .build()?,
                        &SubmenuBuilder::new(app, "验证")
                            .item(&v_clear)
                            .item(&v_systemctl)
                            .item(&v_json)
                            .separator()
                            .item(&v_home)
                            .item(&v_dev)
                            .item(&v_manuals)
                            .item(&v_plugins)
                            .item(&v_settings)
                            .separator()
                            .item(&v_theme)
                            .item(&v_updater)
                            .build()?,
                    ])
                    .build()?;
                app.set_menu(main_menu)?;
                let handle = app.handle().clone();
                app.on_menu_event(move |_app2, event| {
                    let id = event.id().as_ref().to_string();
                    if id == "toggle-launcher" {
                        windows::toggle_launcher(&handle);
                    } else {
                        verify_menu_action(&handle, &id);
                    }
                });
            }

            // Workbench 窗口失焦隐藏处理在 on_window_event；Launcher 失焦自动隐藏
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "launcher" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {});
}

/// 「验证」菜单动作：向宿主/启动器 WebView 注入真实 JS（React 原生事件 + 真实 IPC 链路）
fn verify_menu_action(app: &tauri::AppHandle<tauri::Wry>, id: &str) {
    use tauri::Manager;
        tracing::info!("[verify] menu action: {id}");
    // 异步执行：菜单事件在主线程，sleep 会阻塞 eval 派发
    let handle = app.clone();
    let id_owned = id.to_string();
    std::thread::spawn(move || {
        let app = handle;
        let eval_to = |target: &str, js: &str| {
                        if let Some(w) = app.get_webview(target) {
                let _ = w.eval(js);
            } else {
                tracing::warn!("[verify] 目标窗口不存在：{target}");
            }
        };
        let set_input = |text: &str| {
            let escaped = text.replace('\'', "\\'");
            eval_to("launcher", &format!(
                ";(()=>{{ try {{ const el=document.querySelector('input'); window.__TAURI_INTERNALS__.invoke('debug_log',{{msg:'JS set_input start el='+!!el}}); if(el){{ const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el,'{escaped}'); el.dispatchEvent(new Event('input',{{bubbles:true}})); window.__TAURI_INTERNALS__.invoke('debug_log',{{msg:'JS set_input done'}}); }} }} catch(e) {{ window.__TAURI_INTERNALS__.invoke('debug_log',{{msg:'JS ERR: '+e}}); }} }})();"
            ));
        };
        let click_first_result = || {
            eval_to("launcher", ";(()=>{ const btns=[...document.querySelectorAll('button')].filter(b=>b.querySelector('span')); if(btns.length) btns[0].click(); })();");
        };
        match id_owned.as_str() {
            "verify.launcher-clear" => {
                eval_to("launcher", ";(()=>{ try { window.__TAURI_INTERNALS__.invoke('debug_log',{msg:'DOM: url='+location.href+' inputs='+document.querySelectorAll('input').length+' buttons='+document.querySelectorAll('button').length+' bodylen='+document.body.innerHTML.length}); } catch(e) { window.__TAURI_INTERNALS__.invoke('debug_log',{msg:'DOM ERR: '+e}); } })();");
            }
            "verify.launcher-systemctl" => {
                windows::toggle_launcher(&app);
                std::thread::sleep(std::time::Duration::from_millis(900));
                set_input("systemctl");
                std::thread::sleep(std::time::Duration::from_millis(1300));
                click_first_result();
            }
            "verify.launcher-json" => {
                windows::toggle_launcher(&app);
                std::thread::sleep(std::time::Duration::from_millis(900));
                set_input("{\"name\":\"work-os\",\"version\":\"0.4\"}");
                std::thread::sleep(std::time::Duration::from_millis(1300));
                click_first_result();
            }
            "verify.nav-home" | "verify.nav-plugins" | "verify.nav-manuals" | "verify.nav-developer" | "verify.nav-settings" => {
                let route = id_owned.trim_start_matches("verify.nav-");
                let route = if route == "home" { "/home".to_string() } else { format!("/{route}") };
                eval_to("workbench", &format!(";window.__TAURI_INTERNALS__.invoke('navigate_workbench', {{ route: '{}' }}).catch(e=>console.error(e));", route));
            }
            "verify.theme-toggle" => {
                eval_to("workbench", ";window.__TAURI_INTERNALS__.invoke('theme_get').then(async t=>{ await window.__TAURI_INTERNALS__.invoke('theme_set',{mode: t.resolved==='dark'?'light':'dark'}); const t2=await window.__TAURI_INTERNALS__.invoke('theme_get'); window.__TAURI_INTERNALS__.invoke('debug_log',{msg:'theme now: '+t2.mode+'/'+t2.resolved}); }).catch(e=>window.__TAURI_INTERNALS__.invoke('debug_log',{msg:'theme ERR: '+e}));");
            }
            "verify.updater-check" => {
                eval_to("workbench", ";window.__TAURI_INTERNALS__.invoke('setting_get',{key:'updaterFeed'}).then(async saved=>{ const feed=(saved&&saved!=='null'&&saved)?saved:'http://127.0.0.1:8765/latest.json'; try{ const r=await window.__TAURI_INTERNALS__.invoke('updater_check',{feedUrl:feed}); window.__TAURI_INTERNALS__.invoke('debug_log',{msg:'updater: available='+r.available+(r.version?' version='+r.version:'')}); }catch(e){ window.__TAURI_INTERNALS__.invoke('debug_log',{msg:'updater ERR: '+e}); } });");
            }
            _ => {}
        }
    });
}
