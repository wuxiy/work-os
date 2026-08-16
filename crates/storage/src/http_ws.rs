use serde::Serialize;

use super::{Result, Storage};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpHistoryRow {
    pub id: i64,
    pub method: String,
    pub url: String,
    pub status: Option<i64>,
    pub time_ms: Option<i64>,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsHistoryRow {
    pub id: i64,
    pub session_id: String,
    pub dir: String,
    pub data: String,
    pub binary: bool,
    pub ts: i64,
}

impl Storage {
    /// 所有经 Network Service 的 HTTP 请求统一记录（技术架构 §23 统一日志）
    #[allow(clippy::too_many_arguments)]
    pub fn http_history_add(
        &self,
        method: &str,
        url: &str,
        status: Option<i64>,
        req_headers: &str,
        req_body: Option<&str>,
        res_headers: &str,
        res_body: Option<&str>,
        time_ms: i64,
    ) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO http_history(method,url,status,req_headers,req_body,res_headers,res_body,time_ms,ts)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                rusqlite::params![
                    method,
                    url,
                    status,
                    req_headers,
                    req_body,
                    res_headers,
                    res_body,
                    time_ms,
                    Self::now()
                ],
            )?;
            Ok(())
        })
    }

    pub fn http_history_list(&self, limit: i64) -> Result<Vec<HttpHistoryRow>> {
        self.with_conn(|c| {
            let mut stmt =
                c.prepare("SELECT id,method,url,status,time_ms,ts FROM http_history ORDER BY ts DESC LIMIT ?1")?;
            let rows = stmt
                .query_map([limit], |r| {
                    Ok(HttpHistoryRow {
                        id: r.get(0)?,
                        method: r.get(1)?,
                        url: r.get(2)?,
                        status: r.get(3)?,
                        time_ms: r.get(4)?,
                        ts: r.get(5)?,
                    })
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn http_history_get(&self, id: i64) -> Result<Option<serde_json::Value>> {
        use rusqlite::OptionalExtension;
        self.with_conn(|c| {
            Ok(c.query_row(
                "SELECT id,method,url,status,req_headers,req_body,res_headers,res_body,time_ms,ts FROM http_history WHERE id=?1",
                [id],
                |r| {
                    Ok(serde_json::json!({
                        "id": r.get::<_, i64>(0)?,
                        "method": r.get::<_, String>(1)?,
                        "url": r.get::<_, String>(2)?,
                        "status": r.get::<_, Option<i64>>(3)?,
                        "reqHeaders": r.get::<_, Option<String>>(4)?,
                        "reqBody": r.get::<_, Option<String>>(5)?,
                        "resHeaders": r.get::<_, Option<String>>(6)?,
                        "resBody": r.get::<_, Option<String>>(7)?,
                        "timeMs": r.get::<_, Option<i64>>(8)?,
                        "ts": r.get::<_, i64>(9)?,
                    }))
                },
            )
            .optional()?)
        })
    }

    pub fn ws_session_upsert(&self, session_id: &str, url: &str, headers: &str) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO websocket_sessions(session_id,url,headers,created_at) VALUES(?1,?2,?3,?4)
                 ON CONFLICT(session_id) DO UPDATE SET url=excluded.url, headers=excluded.headers",
                rusqlite::params![session_id, url, headers, Self::now()],
            )?;
            Ok(())
        })
    }

    pub fn ws_sessions_list(&self, limit: i64) -> Result<Vec<(String, String)>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT session_id,url FROM websocket_sessions ORDER BY created_at DESC LIMIT ?1")?;
            let rows = stmt
                .query_map([limit], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn ws_history_add(&self, session_id: &str, dir: &str, data: &str, binary: bool) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO websocket_history(session_id,dir,data,binary,ts) VALUES(?1,?2,?3,?4,?5)",
                rusqlite::params![session_id, dir, data, binary as i64, Self::now()],
            )?;
            Ok(())
        })
    }

    pub fn ws_history_list(&self, session_id: &str, limit: i64) -> Result<Vec<WsHistoryRow>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare(
                "SELECT id,session_id,dir,data,binary,ts FROM websocket_history WHERE session_id=?1 ORDER BY ts ASC LIMIT ?2",
            )?;
            let rows = stmt
                .query_map(rusqlite::params![session_id, limit], |r| {
                    Ok(WsHistoryRow {
                        id: r.get(0)?,
                        session_id: r.get(1)?,
                        dir: r.get(2)?,
                        data: r.get(3)?,
                        binary: r.get::<_, i64>(4)? != 0,
                        ts: r.get(5)?,
                    })
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}
