//! Plugin Bridge（技术架构 §10、§13）
//!
//! 插件 WebView 的唯一能力通道：plugin_bridge 命令 → 校验插件身份（label）→
//! Permission Broker → Native Service。宿主窗口调用被直接拒绝。

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use workos_core::AppState;
use workos_permission::PluginCaller;

use crate::surface;

fn ok(data: Value) -> Value {
    json!({ "ok": true, "data": data })
}

fn fail(kind: &str, message: impl Into<String>) -> Value {
    json!({ "ok": false, "error": { "kind": kind, "message": message.into() } })
}

fn caller_of(label: &str) -> Result<PluginCaller, Value> {
    let Some(plugin_id) = AppState::plugin_id_from_label(label) else {
        return Err(fail("permission-denied", "非插件 WebView 禁止调用 plugin_bridge"));
    };
    let st = workos_core::global();
    let row = st
        .storage
        .plugin_row(&plugin_id)
        .ok()
        .flatten()
        .ok_or_else(|| fail("not-found", format!("插件未安装：{plugin_id}")))?;
    if !row.enabled {
        return Err(fail("permission-denied", "插件已被禁用"));
    }
    Ok(PluginCaller {
        plugin_id,
        api_version: row.api_version as u32,
    })
}

/// 插件调用唯一入口（结构化错误也走 Ok 返回，SDK 侧转为异常）
#[tauri::command(async)]
pub async fn plugin_bridge(
    api: String,
    args: Value,
    app: AppHandle<Wry>,
    webview: tauri::Webview<Wry>,
) -> Result<Value, String> {
    let label = webview.label().to_string();
    drop(webview); // Webview 非 Send：取 label 后立即释放，避免跨 await 持有
    let caller = match caller_of(&label) {
        Ok(c) => c,
        Err(v) => return Ok(v),
    };

    // Permission Broker：Resolve Plugin ID（已完成）→ Validate API Version → Validate Permission
    let st = workos_core::global();
    if let Err(e) = st.broker.check(&caller, &api) {
        tracing::warn!("bridge 拒绝：{e}");
        return Ok(fail("permission-denied", e.to_string()));
    }

    match dispatch(&app, &st, &caller, &label, &api, &args).await {
        Ok(v) => Ok(v),
        Err(v) => Ok(v),
    }
}

async fn dispatch(
    app: &AppHandle<Wry>,
    st: &AppState,
    caller: &PluginCaller,
    label: &str,
    api: &str,
    args: &Value,
) -> Result<Value, Value> {
    let r: Result<Value, Value> = match api {
        // ---------- Clipboard ----------
        "clipboard.readText" => app
            .clipboard()
            .read_text()
            .map(|t| ok(json!(t)))
            .map_err(|e| fail("internal", e.to_string())),
        "clipboard.writeText" => {
            let text = args.get("text").and_then(Value::as_str).unwrap_or("").to_string();
            app.clipboard()
                .write_text(&text)
                .map(|_| ok(Value::Null))
                .map_err(|e| fail("internal", e.to_string()))
        }

        // ---------- Storage（plugin_id namespace 强制隔离）----------
        "storage.get" => {
            let key = str_arg(args, "key")?;
            st.storage
                .ps_get(&caller.plugin_id, &key)
                .map(|v| ok(json!(v)))
                .map_err(|e| fail("internal", e.to_string()))
        }
        "storage.set" => {
            let key = str_arg(args, "key")?;
            let value = str_arg(args, "value")?;
            st.storage
                .ps_set(&caller.plugin_id, &key, &value)
                .map(|_| ok(Value::Null))
                .map_err(|e| fail("internal", e.to_string()))
        }
        "storage.remove" => {
            let key = str_arg(args, "key")?;
            st.storage
                .ps_remove(&caller.plugin_id, &key)
                .map(|_| ok(Value::Null))
                .map_err(|e| fail("internal", e.to_string()))
        }
        "storage.keys" => st
            .storage
            .ps_keys(&caller.plugin_id)
            .map(|v| ok(json!(v)))
            .map_err(|e| fail("internal", e.to_string())),

        // ---------- HTTP ----------
        "http.request" => {
            let req: workos_network::HttpRequest =
                serde_json::from_value(args.get("req").cloned().unwrap_or(Value::Null))
                    .map_err(|e| fail("invalid-args", e.to_string()))?;
            st.network
                .request(&caller.plugin_id, &req)
                .await
                .map(|res| ok(serde_json::to_value(res).unwrap_or(Value::Null)))
                .map_err(|e| fail("internal", e))
        }

        // ---------- WebSocket ----------
        "ws.connect" => {
            let url = str_arg(args, "url")?;
            let opts = args.get("opts").cloned().unwrap_or(json!({}));
            let headers: std::collections::HashMap<String, String> =
                serde_json::from_value(opts.get("headers").cloned().unwrap_or(json!({})))
                    .unwrap_or_default();
            let subprotocols: Vec<String> =
                serde_json::from_value(opts.get("subprotocols").cloned().unwrap_or(json!([])))
                    .unwrap_or_default();
            st.ws
                .connect(label, &url, headers, subprotocols)
                .await
                .map(|session_id| ok(json!({ "sessionId": session_id })))
                .map_err(|e| fail("internal", e))
        }
        "ws.send" => {
            let session_id = str_arg(args, "sessionId")?;
            let data = str_arg(args, "data")?;
            let binary = args.get("binary").and_then(Value::as_bool).unwrap_or(false);
            st.ws
                .send(&session_id, &data, binary)
                .await
                .map(|_| ok(Value::Null))
                .map_err(|e| fail("internal", e))
        }
        "ws.close" => {
            let session_id = str_arg(args, "sessionId")?;
            st.ws
                .close(&session_id)
                .await
                .map(|_| ok(Value::Null))
                .map_err(|e| fail("internal", e))
        }

        // ---------- Secret（Keychain）----------
        "secret.get" => {
            let key = str_arg(args, "key")?;
            workos_native::KeychainSecretStore::get(&caller.plugin_id, &key)
                .map(|v| ok(json!(v)))
                .map_err(|e| fail("internal", e.to_string()))
        }
        "secret.set" => {
            let key = str_arg(args, "key")?;
            let value = str_arg(args, "value")?;
            workos_native::KeychainSecretStore::set(&caller.plugin_id, &key, &value)
                .map(|_| ok(Value::Null))
                .map_err(|e| fail("internal", e.to_string()))
        }
        "secret.remove" => {
            let key = str_arg(args, "key")?;
            workos_native::KeychainSecretStore::remove(&caller.plugin_id, &key)
                .map(|_| ok(Value::Null))
                .map_err(|e| fail("internal", e.to_string()))
        }

        // ---------- Notification ----------
        "notification.show" => {
            let title = str_arg(args, "title")?;
            let body = args.get("body").and_then(Value::as_str).unwrap_or("").to_string();
            app.notification()
                .builder()
                .title(title)
                .body(body)
                .show()
                .map(|_| ok(Value::Null))
                .map_err(|e| fail("internal", e.to_string()))
        }

        // ---------- Dialog ----------
        "dialog.open" => {
            let opts = args.get("opts").cloned().unwrap_or(json!({}));
            let mut b = app.dialog().file();
            if let Some(title) = opts.get("title").and_then(Value::as_str) {
                b = b.set_title(title);
            }
            if let Some(filters) = opts.get("filters").and_then(Value::as_array) {
                for f in filters {
                    let name = f.get("name").and_then(Value::as_str).unwrap_or("");
                    let exts: Vec<&str> = f
                        .get("extensions")
                        .and_then(Value::as_array)
                        .map(|a| a.iter().filter_map(Value::as_str).collect())
                        .unwrap_or_default();
                    b = b.add_filter(name, &exts);
                }
            }
            let multiple = opts.get("multiple").and_then(Value::as_bool).unwrap_or(false);
            if multiple {
                let picked = b.blocking_pick_files();
                let paths: Vec<String> = picked
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|p| p.into_path().ok().map(|x| x.to_string_lossy().into_owned()))
                    .collect();
                Ok(ok(json!(paths)))
            } else {
                let picked = b.blocking_pick_file();
                let path = picked
                    .and_then(|p| p.into_path().ok().map(|x| x.to_string_lossy().into_owned()));
                Ok(ok(json!(path)))
            }
        }
        "dialog.save" => {
            let opts = args.get("opts").cloned().unwrap_or(json!({}));
            let mut b = app.dialog().file();
            if let Some(title) = opts.get("title").and_then(Value::as_str) {
                b = b.set_title(title);
            }
            if let Some(default) = opts.get("defaultPath").and_then(Value::as_str) {
                b = b.set_file_name(default);
            }
            let picked = b.blocking_save_file();
            let path = picked.and_then(|p| p.into_path().ok().map(|x| x.to_string_lossy().into_owned()));
            Ok(ok(json!(path)))
        }

        // ---------- 元信息（不走权限）----------
        "theme.get" => Ok(ok(json!(crate::state::resolved_theme(app)))),
        "window.setTitle" => {
            let title = str_arg(args, "title")?;
            if let Some(w) = app.get_webview_window("workbench") {
                let _ = w.set_title(&title);
            }
            Ok(ok(Value::Null))
        }
        "lifecycle.ready" => {
            surface::mark_ready(app, &caller.plugin_id);
            Ok(ok(Value::Null))
        }
        "commands.execute" => {
            let id = str_arg(args, "id")?;
            let payload = args.get("payload").cloned();
            commands_execute(app, st, &id, payload).await
        }
        _ => Err(fail("not-found", format!("未知 API：{api}"))),
    };
    r
}

fn str_arg(args: &Value, key: &str) -> Result<String, Value> {
    args.get(key)
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| fail("invalid-args", format!("缺少参数：{key}")))
}

/// 插件命令执行：路由到宿主打开对应插件 Surface 并携带 payload
async fn commands_execute(app: &AppHandle<Wry>, st: &AppState, id: &str, payload: Option<Value>) -> Result<Value, Value> {
    // SDK 运行时注册命令上报
    if id == "__runtime.registerCommands" {
        return Ok(ok(Value::Null)); // 命令集合在插件进程内与 manifest 合并；宿主以 manifest 为准
    }
    let installer = workos_plugin_runtime::Installer::new(&st.storage, crate::state::plugins_root(app));
    let commands = installer
        .collect_commands()
        .map_err(|e| fail("internal", e.to_string()))?;
    for info in commands {
        if info.command.id == id {
            // 通知 Workbench 打开工具页（前端负责 Surface 布局与 enter 派发）
            let _ = app.emit_to(
                "workbench",
                "workos://open-tool",
                json!({ "pluginId": info.plugin_id, "code": info.command.code.unwrap_or(id.to_string()), "payload": payload }),
            );
            crate::windows::show_workbench(app);
            return Ok(ok(Value::Null));
        }
    }
    Err(fail("not-found", format!("命令不存在：{id}")))
}
