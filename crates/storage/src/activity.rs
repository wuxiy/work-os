use serde::Serialize;

use super::{Result, Storage};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentItem {
    pub kind: String,
    #[serde(rename = "ref")]
    pub reference: String,
    pub title: String,
    pub ts: i64,
}

impl Storage {
    pub fn add_recent(&self, kind: &str, reference: &str, title: &str) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO recent_items(kind,ref,title,ts) VALUES(?1,?2,?3,?4)
                 ON CONFLICT(kind,ref) DO UPDATE SET title=excluded.title, ts=excluded.ts",
                rusqlite::params![kind, reference, title, Self::now()],
            )?;
            Ok(())
        })
    }

    pub fn list_recent(&self, kind: Option<&str>, limit: i64) -> Result<Vec<RecentItem>> {
        const SQL_ANY: &str = "SELECT kind,ref,title,ts FROM recent_items ORDER BY ts DESC LIMIT ?1";
        const SQL_KIND: &str = "SELECT kind,ref,title,ts FROM recent_items WHERE kind=?1 ORDER BY ts DESC LIMIT ?2";
        self.with_conn(|c| {
            let map = |r: &rusqlite::Row<'_>| -> rusqlite::Result<RecentItem> {
                Ok(RecentItem {
                    kind: r.get(0)?,
                    reference: r.get(1)?,
                    title: r.get(2)?,
                    ts: r.get(3)?,
                })
            };
            let rows = match kind {
                Some(k) => {
                    let mut stmt = c.prepare(SQL_KIND)?;
                    let iter = stmt.query_map(rusqlite::params![k, limit], map)?;
                    #[allow(clippy::let_and_return)]
                    let v = iter.collect::<std::result::Result<Vec<_>, _>>()?;
                    v
                }
                None => {
                    let mut stmt = c.prepare(SQL_ANY)?;
                    let iter = stmt.query_map([limit], map)?;
                    #[allow(clippy::let_and_return)]
                    let v = iter.collect::<std::result::Result<Vec<_>, _>>()?;
                    v
                }
            };
            Ok(rows)
        })
    }

    pub fn record_command(&self, command_id: &str, input: Option<&str>) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO command_history(command_id,input,ts) VALUES(?1,?2,?3)",
                rusqlite::params![command_id, input, Self::now()],
            )?;
            Ok(())
        })
    }

    pub fn command_history_list(&self, limit: i64) -> Result<Vec<(String, Option<String>, i64)>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT command_id,input,ts FROM command_history ORDER BY ts DESC LIMIT ?1")?;
            let rows = stmt
                .query_map([limit], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 最近项_upsert_与查询() {
        let s = Storage::open_in_memory().unwrap();
        s.add_recent("tool", "dev.workos.tool.json-tools", "JSON 工具").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        s.add_recent("manual", "systemctl", "systemctl").unwrap();
        s.add_recent("tool", "dev.workos.tool.json-tools", "JSON 工具").unwrap();
        let all = s.list_recent(None, 10).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].kind, "tool"); // 刚更新过，排最前
        let tools = s.list_recent(Some("tool"), 10).unwrap();
        assert_eq!(tools.len(), 1);
    }
}
