//! WebSocket Service（技术架构 §24）：Rust WS Client + 会话管理 + 消息推送

use std::collections::HashMap;
use std::sync::Arc;

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use serde::Serialize;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use workos_storage::Storage;

/// 推送到插件 WebView 的事件负载
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsMessageEvent {
    pub session_id: String,
    pub dir: String, // in | out | system
    pub data: String,
    pub binary: bool,
    pub ts: i64,
}

/// 事件出口：向指定 webview label 发事件（由 app 层注入 tauri emit_to）
pub type EventSink = Arc<dyn Fn(&str, &str, serde_json::Value) + Send + Sync>;

struct WsSession {
    tx: mpsc::Sender<Msg>,
}

enum Msg {
    Text(String),
    Binary(Vec<u8>),
    Close,
}

#[derive(Default)]
pub struct WsManager {
    storage: Mutex<Option<Arc<Storage>>>,
    sink: Mutex<Option<EventSink>>,
    sessions: Mutex<HashMap<String, WsSession>>,
}

impl WsManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn init(&self, storage: Arc<Storage>, sink: EventSink) {
        *self.storage.lock() = Some(storage);
        *self.sink.lock() = Some(sink);
    }

    fn now() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }

    /// 建立 ws/wss 连接（自定义 Headers + Sub Protocol），返回 session_id
    pub async fn connect(
        &self,
        caller_label: &str,
        url: &str,
        headers: HashMap<String, String>,
        subprotocols: Vec<String>,
    ) -> Result<String, String> {
        let headers_json = serde_json::to_string(&headers).unwrap_or_default();
        let mut request = url
            .into_client_request()
            .map_err(|e| format!("非法 WS 地址：{e}"))?;
        for (k, v) in headers {
            let name = tokio_tungstenite::tungstenite::http::HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| format!("非法头名：{e}"))?;
            let value = HeaderValue::from_str(&v).map_err(|e| format!("非法头值：{e}"))?;
            request.headers_mut().insert(name, value);
        }
        if !subprotocols.is_empty() {
            request.headers_mut().insert(
                "Sec-WebSocket-Protocol",
                HeaderValue::from_str(&subprotocols.join(", ")).map_err(|e| format!("非法子协议：{e}"))?,
            );
        }

        let (ws_stream, _resp) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| format!("连接失败：{e}"))?;

        let session_id = uuid::Uuid::new_v4().to_string();
        if let Some(st) = self.storage.lock().as_ref() {
            let _ = st.ws_session_upsert(&session_id, url, &headers_json);
        }

        let (mut write, mut read) = ws_stream.split();
        let (tx, mut rx) = mpsc::channel::<Msg>(64);
        self.sessions
            .lock()
            .insert(session_id.clone(), WsSession { tx: tx.clone() });

        let sid = session_id.clone();
        let label = caller_label.to_string();
        let sink = { self.sink.lock().clone() };
        let storage = { self.storage.lock().clone() };

        let sys = |label: &str, sid: &str, text: String, sink: &Option<EventSink>, storage: &Option<Arc<Storage>>| {
            if let Some(s) = sink.as_ref() {
                s(
                    label,
                    "workos://ws",
                    serde_json::to_value(WsMessageEvent {
                        session_id: sid.to_string(),
                        dir: "system".into(),
                        data: text.clone(),
                        binary: false,
                        ts: Self::now(),
                    })
                    .unwrap(),
                );
            }
            if let Some(st) = storage.as_ref() {
                let _ = st.ws_history_add(sid, "system", &text, false);
            }
        };

        sys(&label, &sid, "已连接".into(), &sink, &storage);

        // 写任务
        let sid_w = sid.clone();
        let label_w = label.clone();
        let sink_w = sink.clone();
        let storage_w = storage.clone();
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                match msg {
                    Msg::Text(t) => {
                        if write.send(Message::Text(t.clone())).await.is_ok() {
                            if let Some(s) = sink_w.as_ref() {
                                s(&label_w, "workos://ws", serde_json::to_value(WsMessageEvent {
                                    session_id: sid_w.clone(),
                                    dir: "out".into(),
                                    data: t.clone(),
                                    binary: false,
                                    ts: Self::now(),
                                }).unwrap());
                            }
                            if let Some(st) = storage_w.as_ref() {
                                let _ = st.ws_history_add(&sid_w, "out", &t, false);
                            }
                        }
                    }
                    Msg::Binary(b) => {
                        if write.send(Message::Binary(b.clone())).await.is_ok() {
                            let b64 = base64::engine::general_purpose::STANDARD.encode(&b);
                            if let Some(s) = sink_w.as_ref() {
                                s(&label_w, "workos://ws", serde_json::to_value(WsMessageEvent {
                                    session_id: sid_w.clone(),
                                    dir: "out".into(),
                                    data: b64.clone(),
                                    binary: true,
                                    ts: Self::now(),
                                }).unwrap());
                            }
                            if let Some(st) = storage_w.as_ref() {
                                let _ = st.ws_history_add(&sid_w, "out", &b64, true);
                            }
                        }
                    }
                    Msg::Close => {
                        let _ = write.send(Message::Close(None)).await;
                        break;
                    }
                }
            }
        });

        // 读任务
        let sid_r = sid.clone();
        let label_r = label.clone();
        tokio::spawn(async move {
            while let Some(Ok(msg)) = read.next().await {
                match msg {
                    Message::Text(t) => {
                        if let Some(s) = sink.as_ref() {
                            s(&label_r, "workos://ws", serde_json::to_value(WsMessageEvent {
                                session_id: sid_r.clone(),
                                dir: "in".into(),
                                data: t.to_string(),
                                binary: false,
                                ts: Self::now(),
                            }).unwrap());
                        }
                        if let Some(st) = storage.as_ref() {
                            let _ = st.ws_history_add(&sid_r, "in", &t.to_string(), false);
                        }
                    }
                    Message::Binary(b) => {
                        let b64 = base64::engine::general_purpose::STANDARD.encode(&b);
                        if let Some(s) = sink.as_ref() {
                            s(&label_r, "workos://ws", serde_json::to_value(WsMessageEvent {
                                session_id: sid_r.clone(),
                                dir: "in".into(),
                                data: b64.clone(),
                                binary: true,
                                ts: Self::now(),
                            }).unwrap());
                        }
                        if let Some(st) = storage.as_ref() {
                            let _ = st.ws_history_add(&sid_r, "in", &b64, true);
                        }
                    }
                    Message::Close(_) => {
                        sys(&label_r, &sid_r, "已断开".into(), &sink, &storage);
                        break;
                    }
                    Message::Ping(_) | Message::Pong(_) => {}
                    _ => {}
                }
            }
            // 连接结束（含对端断开）
            sys(&label_r, &sid_r, "连接已关闭".into(), &sink, &storage);
        });

        Ok(session_id)
    }

    pub async fn send(&self, session_id: &str, data: &str, binary: bool) -> Result<(), String> {
        // guard 不跨 await：先取出 sender 克隆
        let tx = {
            let sessions = self.sessions.lock();
            sessions
                .get(session_id)
                .map(|s| s.tx.clone())
                .ok_or_else(|| "会话不存在或已关闭".to_string())?
        };
        let msg = if binary {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|e| format!("binary 解码失败：{e}"))?;
            Msg::Binary(bytes)
        } else {
            Msg::Text(data.to_string())
        };
        tx.send(msg).await.map_err(|_| "会话已关闭".to_string())
    }

    pub async fn close(&self, session_id: &str) -> Result<(), String> {
        let tx = {
            let sessions = self.sessions.lock();
            sessions.get(session_id).map(|s| s.tx.clone())
        };
        if let Some(tx) = tx {
            let _ = tx.send(Msg::Close).await;
        }
        self.sessions.lock().remove(session_id);
        Ok(())
    }

    pub fn open_sessions(&self) -> Vec<String> {
        self.sessions.lock().keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    async fn ws_echo_server() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            while let Ok((stream, _)) = listener.accept().await {
                tokio::spawn(async move {
                    let ws = tokio_tungstenite::accept_async(stream).await.unwrap();
                    let (mut write, mut read) = ws.split();
                    while let Some(Ok(msg)) = read.next().await {
                        if let Message::Text(t) = msg {
                            if write.send(Message::Text(t)).await.is_err() {
                                break;
                            }
                        } else if let Message::Binary(b) = msg {
                            if write.send(Message::Binary(b)).await.is_err() {
                                break;
                            }
                        }
                    }
                });
            }
        });
        format!("ws://{addr}")
    }

    fn sink_capture() -> (EventSink, std::sync::Arc<Mutex<Vec<serde_json::Value>>>) {
        let seen: std::sync::Arc<Mutex<Vec<serde_json::Value>>> = std::sync::Arc::new(Mutex::new(Vec::new()));
        let seen2 = seen.clone();
        let sink: EventSink = std::sync::Arc::new(move |_label, _event, payload| {
            seen2.lock().push(payload);
        });
        (sink, seen)
    }

    #[tokio::test]
    async fn ws_连接_收发_历史记录() {
        let storage = std::sync::Arc::new(Storage::open_in_memory().unwrap());
        let (sink, seen) = sink_capture();
        let mgr = WsManager::new();
        mgr.init(storage.clone(), sink);

        let url = ws_echo_server().await;
        let sid = mgr.connect("plugin:test", &url, HashMap::new(), vec![]).await.unwrap();
        mgr.send(&sid, "hello-workos", false).await.unwrap();

        // 等 echo 回来
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        loop {
            let got_in = seen.lock().iter().any(|v| v["dir"] == "in");
            if got_in || std::time::Instant::now() > deadline {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        {
            let seen = seen.lock();
            assert!(seen.iter().any(|v| v["dir"] == "out" && v["data"] == "hello-workos"), "{seen:?}");
            assert!(seen.iter().any(|v| v["dir"] == "in" && v["data"] == "hello-workos"), "{seen:?}");
        }
        let history = storage.ws_history_list(&sid, 100).unwrap();
        assert!(history.iter().any(|h| h.dir == "out" && h.data == "hello-workos"));
        assert!(history.iter().any(|h| h.dir == "in" && h.data == "hello-workos"));

        mgr.close(&sid).await.unwrap();
        assert!(mgr.open_sessions().is_empty());
        // 会话已记录
        assert_eq!(storage.ws_sessions_list(10).unwrap().len(), 1);
    }
}
