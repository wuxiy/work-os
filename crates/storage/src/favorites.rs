use serde::Serialize;

use super::{Result, Storage};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteItem {
    pub kind: String,
    #[serde(rename = "ref")]
    pub reference: String,
    pub title: String,
}

impl Storage {
    pub fn add_favorite(&self, kind: &str, reference: &str, title: &str) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT OR IGNORE INTO favorites(kind,ref,title,added_at) VALUES(?1,?2,?3,?4)",
                rusqlite::params![kind, reference, title, Self::now()],
            )?;
            Ok(())
        })
    }

    pub fn remove_favorite(&self, kind: &str, reference: &str) -> Result<()> {
        self.with_conn(|c| {
            c.execute("DELETE FROM favorites WHERE kind=?1 AND ref=?2", rusqlite::params![kind, reference])?;
            Ok(())
        })
    }

    pub fn toggle_favorite(&self, kind: &str, reference: &str, title: &str) -> Result<bool> {
        if self.is_favorite(kind, reference)? {
            self.remove_favorite(kind, reference)?;
            Ok(false)
        } else {
            self.add_favorite(kind, reference, title)?;
            Ok(true)
        }
    }

    pub fn is_favorite(&self, kind: &str, reference: &str) -> Result<bool> {
        self.with_conn(|c| {
            let n: i64 = c.query_row(
                "SELECT COUNT(*) FROM favorites WHERE kind=?1 AND ref=?2",
                rusqlite::params![kind, reference],
                |r| r.get(0),
            )?;
            Ok(n > 0)
        })
    }

    pub fn favorites_list(&self) -> Result<Vec<FavoriteItem>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT kind,ref,title FROM favorites ORDER BY added_at DESC")?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(FavoriteItem {
                        kind: r.get(0)?,
                        reference: r.get(1)?,
                        title: r.get(2)?,
                    })
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}
