//! 本地存储（技术架构 §14）：SQLite 单文件 + FTS5 手册索引
#![allow(clippy::module_name_repetitions)]

use std::path::Path;

use parking_lot::Mutex;
use rusqlite::Connection;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("数据库错误：{0}")]
    Db(#[from] rusqlite::Error),
    #[error("IO 错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("序列化错误：{0}")]
    Serde(#[from] serde_json::Error),
}
pub type Result<T> = std::result::Result<T, StorageError>;

pub struct Storage {
    conn: Mutex<Connection>,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL,
  api_version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  source TEXT NOT NULL,             -- builtin | registry | local | dev
  source_path TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  installed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plugin_versions (
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, version)
);
CREATE TABLE IF NOT EXISTS plugin_permissions (
  plugin_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, permission)
);
CREATE TABLE IF NOT EXISTS plugin_storage (
  plugin_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, key)
);
CREATE TABLE IF NOT EXISTS http_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS http_requests (
  id TEXT PRIMARY KEY,
  collection_id TEXT,
  name TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS http_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER,
  req_headers TEXT,
  req_body TEXT,
  res_headers TEXT,
  res_body TEXT,
  time_ms INTEGER,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS http_environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variables TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS websocket_sessions (
  session_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  headers TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS websocket_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  dir TEXT NOT NULL,
  data TEXT NOT NULL,
  binary INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS manual_sources (
  plugin_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  docs_count INTEGER NOT NULL,
  installed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS manual_documents (
  source_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  category TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  content TEXT NOT NULL,
  PRIMARY KEY (source_id, id)
);
CREATE TABLE IF NOT EXISTS favorites (
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (kind, ref)
);
CREATE TABLE IF NOT EXISTS recent_items (
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (kind, ref)
);
CREATE TABLE IF NOT EXISTS command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_id TEXT NOT NULL,
  input TEXT,
  ts INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS manual_fts USING fts5(
  doc_id UNINDEXED,
  source_id UNINDEXED,
  title,
  aliases,
  summary,
  body,
  tokenize = 'trigram'
);
"#;

impl Storage {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let conn = self.conn.lock();
        f(&conn)
    }

    pub fn now() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
}

pub mod settings;
pub mod plugins;
pub mod plugin_storage;
pub mod activity;
pub mod http_ws;
pub mod manual;
pub mod favorites;

pub use activity::RecentItem;
pub use favorites::FavoriteItem;
pub use manual::{ManualDocRow, ManualDocument, ManualSearchHit, ManualSection, ManualSourceInfo};
pub use plugins::PluginRow;
