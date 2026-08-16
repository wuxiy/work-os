//! Network Service（技术架构 §23、§24）
//!
//! HTTP 与 WebSocket 统一经 Rust 网络栈（无浏览器 CORS 限制），并写入统一历史。

pub mod http;
pub mod ws;

pub use http::{HttpRequest, HttpResponse, NetworkService};
pub use ws::{WsManager, WsMessageEvent};
