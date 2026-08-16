use rusqlite::OptionalExtension;

use super::{Result, Storage};

impl Storage {
    pub fn setting_get(&self, key: &str) -> Result<Option<String>> {
        self.with_conn(|c| {
            Ok(c.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0))
                .optional()?)
        })
    }

    pub fn setting_set(&self, key: &str, value: &str) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [key, value],
            )?;
            Ok(())
        })
    }

    pub fn settings_all(&self) -> Result<Vec<(String, String)>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT key,value FROM settings ORDER BY key")?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}
