//! workos-plugin:// 协议：以插件 id 为 host，安全地服务已安装插件目录内的文件
//!
//! 安全规则：路径穿越拒绝、仅插件目录内、附加严格 CSP（脚本仅 self）

use std::path::PathBuf;

use tauri::http::{Request, Response};
use tauri::{AppHandle, UriSchemeContext, Wry};

use crate::state::plugins_root;

pub const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src ipc: http://ipc.localhost";

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "woff2" => "font/woff2",
        "md" => "text/markdown; charset=utf-8",
        _ => "application/octet-stream",
    }
}

pub fn handle(ctx: UriSchemeContext<'_, Wry>, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let app: &AppHandle<Wry> = ctx.app_handle();
    let uri = request.uri().clone();
    let host = uri.host().unwrap_or("").to_lowercase();
    let path = uri.path().trim_start_matches('/');

    if host.is_empty() {
        return bad_request("缺少插件 id");
    }
    // dev 插件：从 source_path（manifest 记录）读取；安装插件：plugins/<id>/current
    let base: PathBuf = {
        let st = workos_core::global();
        let installed = st.storage.plugin_row(&host).ok().flatten();
        match installed.as_ref().filter(|r| r.source == "dev").and_then(|r| r.source_path.clone()) {
            Some(p) => PathBuf::from(p),
            None => plugins_root(app).join(&host).join("current"),
        }
    };

    if path.is_empty() || path.contains("..") {
        return bad_request("非法路径");
    }
    let file = base.join(path);
    // 兜底：dist/ 前缀内查找（manifest entry 形如 dist/index.html 时 host 路径一致）
    let file = if file.is_dir() { base.join("index.html") } else { file };

    match std::fs::read(&file) {
        Ok(bytes) => {
            let ct = content_type(path);
            let mut builder = Response::builder()
                .header("Content-Type", ct)
                .header("Content-Security-Policy", CSP)
                .header("Access-Control-Allow-Origin", "null");
            if path.ends_with(".html") {
                builder = builder.header("X-Frame-Options", "SAMEORIGIN");
            }
            builder.body(bytes).unwrap()
        }
        Err(_) => Response::builder()
            .status(404)
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(format!("not found: {path}").into_bytes())
            .unwrap(),
    }
}

fn bad_request(msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(400)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap()
}
