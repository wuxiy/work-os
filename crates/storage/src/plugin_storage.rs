use super::{Result, Storage};

/// Plugin Storage：按 plugin_id 强制 namespace 隔离（技术架构 §14，验收 E12）
impl Storage {
    pub fn ps_set(&self, plugin_id: &str, key: &str, value: &str) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO plugin_storage(plugin_id,key,value,updated_at) VALUES(?1,?2,?3,?4)
                 ON CONFLICT(plugin_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                rusqlite::params![plugin_id, key, value, Self::now()],
            )?;
            Ok(())
        })
    }

    pub fn ps_get(&self, plugin_id: &str, key: &str) -> Result<Option<String>> {
        use rusqlite::OptionalExtension;
        self.with_conn(|c| {
            Ok(c.query_row(
                "SELECT value FROM plugin_storage WHERE plugin_id=?1 AND key=?2",
                rusqlite::params![plugin_id, key],
                |r| r.get(0),
            )
            .optional()?)
        })
    }

    pub fn ps_remove(&self, plugin_id: &str, key: &str) -> Result<()> {
        self.with_conn(|c| {
            c.execute("DELETE FROM plugin_storage WHERE plugin_id=?1 AND key=?2", rusqlite::params![plugin_id, key])?;
            Ok(())
        })
    }

    pub fn ps_keys(&self, plugin_id: &str) -> Result<Vec<String>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT key FROM plugin_storage WHERE plugin_id=?1 ORDER BY key")?;
            let rows = stmt.query_map([plugin_id], |r| r.get(0))?.collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 插件存储按_plugin_id_隔离() {
        let s = Storage::open_in_memory().unwrap();
        s.ps_set("dev.workos.tool.a", "k", "A").unwrap();
        s.ps_set("dev.workos.tool.b", "k", "B").unwrap();
        assert_eq!(s.ps_get("dev.workos.tool.a", "k").unwrap().as_deref(), Some("A"));
        assert_eq!(s.ps_get("dev.workos.tool.b", "k").unwrap().as_deref(), Some("B"));
        assert_eq!(s.ps_get("dev.workos.tool.c", "k").unwrap(), None);
        s.ps_remove("dev.workos.tool.a", "k").unwrap();
        assert_eq!(s.ps_get("dev.workos.tool.a", "k").unwrap(), None);
        assert_eq!(s.ps_keys("dev.workos.tool.b").unwrap(), vec!["k"]);
    }
}
