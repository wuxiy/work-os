use serde::{Deserialize, Serialize};

use super::{Result, Storage};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRow {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "type")]
    pub plugin_type: String,
    pub api_version: i64,
    pub manifest_json: String,
    pub source: String,
    pub source_path: Option<String>,
    pub enabled: bool,
    pub installed_at: i64,
}

impl Storage {
    pub fn plugins_upsert(&self, p: &PluginRow) -> Result<()> {
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO plugins(id,name,version,type,api_version,manifest_json,source,source_path,enabled,installed_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name, version=excluded.version, type=excluded.type,
                   api_version=excluded.api_version, manifest_json=excluded.manifest_json, source=excluded.source,
                   source_path=excluded.source_path, enabled=excluded.enabled",
                rusqlite::params![
                    p.id,
                    p.name,
                    p.version,
                    p.plugin_type,
                    p.api_version,
                    p.manifest_json,
                    p.source,
                    p.source_path,
                    p.enabled as i64,
                    p.installed_at
                ],
            )?;
            c.execute(
                "INSERT OR IGNORE INTO plugin_versions(plugin_id,version,installed_at) VALUES(?1,?2,?3)",
                rusqlite::params![p.id, p.version, p.installed_at],
            )?;
            Ok(())
        })
    }

    pub fn plugins_list(&self, only_enabled: bool) -> Result<Vec<PluginRow>> {
        self.with_conn(|c| {
            let sql = if only_enabled {
                "SELECT id,name,version,type,api_version,manifest_json,source,source_path,enabled,installed_at FROM plugins WHERE enabled=1 ORDER BY name"
            } else {
                "SELECT id,name,version,type,api_version,manifest_json,source,source_path,enabled,installed_at FROM plugins ORDER BY name"
            };
            let mut stmt = c.prepare(sql)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(PluginRow {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        version: r.get(2)?,
                        plugin_type: r.get(3)?,
                        api_version: r.get(4)?,
                        manifest_json: r.get(5)?,
                        source: r.get(6)?,
                        source_path: r.get(7)?,
                        enabled: r.get::<_, i64>(8)? != 0,
                        installed_at: r.get(9)?,
                    })
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn plugin_row(&self, id: &str) -> Result<Option<PluginRow>> {
        use rusqlite::OptionalExtension;
        self.with_conn(|c| {
            Ok(c
                .query_row(
                    "SELECT id,name,version,type,api_version,manifest_json,source,source_path,enabled,installed_at FROM plugins WHERE id=?1",
                    [id],
                    |r| {
                        Ok(PluginRow {
                            id: r.get(0)?,
                            name: r.get(1)?,
                            version: r.get(2)?,
                            plugin_type: r.get(3)?,
                            api_version: r.get(4)?,
                            manifest_json: r.get(5)?,
                            source: r.get(6)?,
                            source_path: r.get(7)?,
                            enabled: r.get::<_, i64>(8)? != 0,
                            installed_at: r.get(9)?,
                        })
                    },
                )
                .optional()?)
        })
    }

    pub fn plugin_set_enabled(&self, id: &str, enabled: bool) -> Result<()> {
        self.with_conn(|c| {
            c.execute("UPDATE plugins SET enabled=?2 WHERE id=?1", rusqlite::params![id, enabled as i64])?;
            Ok(())
        })
    }

    pub fn plugin_delete(&self, id: &str) -> Result<()> {
        self.with_conn(|c| {
            c.execute("DELETE FROM plugins WHERE id=?1", [id])?;
            c.execute("DELETE FROM plugin_versions WHERE plugin_id=?1", [id])?;
            c.execute("DELETE FROM plugin_permissions WHERE plugin_id=?1", [id])?;
            c.execute("DELETE FROM plugin_storage WHERE plugin_id=?1", [id])?;
            c.execute("DELETE FROM manual_documents WHERE source_id=?1", [id])?;
            c.execute("DELETE FROM manual_fts WHERE source_id=?1", [id])?;
            c.execute("DELETE FROM manual_sources WHERE plugin_id=?1", [id])?;
            Ok(())
        })
    }

    pub fn permissions_grant(&self, plugin_id: &str, perms: &[String]) -> Result<()> {
        self.with_conn(|c| {
            for p in perms {
                c.execute(
                    "INSERT OR IGNORE INTO plugin_permissions(plugin_id,permission,granted_at) VALUES(?1,?2,?3)",
                    rusqlite::params![plugin_id, p, Self::now()],
                )?;
            }
            Ok(())
        })
    }

    pub fn permissions_list(&self, plugin_id: &str) -> Result<Vec<String>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT permission FROM plugin_permissions WHERE plugin_id=?1 ORDER BY permission")?;
            let rows = stmt
                .query_map([plugin_id], |r| r.get(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    /// 供 Permission Broker 启动时加载全量授权（plugin_id, permission 平铺对）
    pub fn permissions_all(&self) -> Result<Vec<(String, String)>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare("SELECT plugin_id,permission FROM plugin_permissions")?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}

/// manifest 的 Rust 侧最小结构（完整校验见 plugin-runtime crate）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestRef {
    #[serde(rename = "schemaVersion")]
    pub schema_version: i64,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "type")]
    pub plugin_type: String,
    #[serde(rename = "apiVersion")]
    pub api_version: String,
}
