use std::time::Instant;

use base64::Engine;
use serde::{Deserialize, Serialize};
use workos_storage::Storage;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpBody {
    #[serde(default)]
    pub kind: String, // empty | text | json | binary_b64
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub body: Option<HttpBody>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body_text: Option<String>,
    pub body_b64: Option<String>,
    pub time_ms: u64,
    pub size_bytes: u64,
}

pub struct NetworkService {
    pub storage: std::sync::Arc<Storage>,
    client: reqwest::Client,
}

impl NetworkService {
    pub fn new(storage: std::sync::Arc<Storage>) -> Self {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .expect("reqwest client");
        Self { storage, client }
    }

    /// 执行 HTTP 请求并记录 http_history（统一日志，验收 H8）
    pub async fn request(&self, caller_plugin: &str, req: &HttpRequest) -> Result<HttpResponse, String> {
        let t0 = Instant::now();
        let method = reqwest::Method::from_bytes(req.method.as_bytes()).map_err(|e| format!("非法方法：{e}"))?;
        let mut rb = self.client.request(method, &req.url);
        if let Some(t) = req.timeout_ms {
            rb = rb.timeout(std::time::Duration::from_millis(t.max(1)));
        }
        for (k, v) in &req.headers {
            rb = rb.header(k, v);
        }
        let mut req_body_log: Option<String> = None;
        if let Some(b) = &req.body {
            match b.kind.as_str() {
                "text" => {
                    rb = rb.body(b.content.clone());
                    req_body_log = Some(b.content.clone());
                }
                "json" => {
                    rb = rb.header("content-type", "application/json").body(b.content.clone());
                    req_body_log = Some(b.content.clone());
                }
                "binary_b64" => {
                    let bytes = base64::engine::general_purpose::STANDARD
                        .decode(&b.content)
                        .map_err(|e| format!("binary_b64 解码失败：{e}"))?;
                    rb = rb.body(bytes);
                    req_body_log = Some(format!("<binary {} bytes>", b.content.len()));
                }
                _ => {}
            }
        }

        let resp = rb.send().await.map_err(|e| format!("请求失败：{e}"))?;
        let status = resp.status();
        let mut headers = std::collections::HashMap::new();
        for (k, v) in resp.headers().iter() {
            let key = k.as_str().to_string();
            let val = v.to_str().unwrap_or("").to_string();
            headers.entry(key).and_modify(|e: &mut String| *e = format!("{e}; {val}")).or_insert(val);
        }
        let bytes = resp.bytes().await.map_err(|e| format!("读取响应失败：{e}"))?;
        let size = bytes.len() as u64;
        let time_ms = t0.elapsed().as_millis() as u64;

        let (body_text, body_b64) = match std::str::from_utf8(&bytes) {
            Ok(s) => (Some(s.to_string()), None),
            Err(_) => (
                None,
                Some(base64::engine::general_purpose::STANDARD.encode(&bytes)),
            ),
        };

        let out = HttpResponse {
            status: status.as_u16(),
            status_text: status.canonical_reason().unwrap_or("").to_string(),
            headers,
            body_text: body_text.clone(),
            body_b64,
            time_ms,
            size_bytes: size,
        };

        // 统一日志（截断超大 body，避免库膨胀）
        let clip = |s: &Option<String>| -> Option<String> {
            s.as_ref().map(|v| if v.len() > 64 * 1024 { format!("{}…", &v[..64 * 1024]) } else { v.clone() })
        };
        let _ = self.storage.http_history_add(
            &req.method,
            &req.url,
            Some(out.status as i64),
            &serde_json::to_string(&req.headers).unwrap_or_default(),
            clip(&req_body_log).as_deref(),
            &serde_json::to_string(&out.headers).unwrap_or_default(),
            clip(&body_text).as_deref(),
            out.time_ms as i64,
        );
        tracing::debug!(plugin = caller_plugin, url = %req.url, status = out.status, "http.request");
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener as StdTcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn one_shot_server(resp: &'static str) -> String {
        let listener = StdTcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            if let Ok((mut sock, _)) = listener.accept().await {
                let mut buf = [0u8; 8192];
                let _ = sock.read(&mut buf).await;
                let _ = sock.write_all(resp.as_bytes()).await;
            }
        });
        format!("http://{addr}/echo")
    }

    #[tokio::test]
    async fn http_请求_方法_头_体_回读() {
        let storage = std::sync::Arc::new(Storage::open_in_memory().unwrap());
        let svc = NetworkService::new(storage.clone());
        let url = one_shot_server(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 20\r\nConnection: close\r\n\r\n{\"echo\":\"ok-15dff2\"}",
        );
        let req = HttpRequest {
            method: "POST".into(),
            url,
            headers: [("x-custom".to_string(), "1".to_string())].into(),
            body: Some(HttpBody {
                kind: "json".into(),
                content: "{\"a\":1}".into(),
            }),
            timeout_ms: Some(3000),
        };
        let res = svc.request("dev.workos.test", &req).await.unwrap();
        assert_eq!(res.status, 200);
        assert_eq!(res.headers.get("content-type").map(String::as_str), Some("application/json"));
        assert!(res.body_text.as_deref().unwrap().contains("ok-15dff2"));

        let history = storage.http_history_list(10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].method, "POST");
        assert_eq!(history[0].status, Some(200));
    }
}
