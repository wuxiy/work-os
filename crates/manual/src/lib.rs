//! Manual Runtime（技术架构 §16）：从 Manual Plugin 的 dist 装载文档
//!
//! index.json: { "documents": [ { id, title, aliases, summary, category, tags, sections, source, contentFile? } ] }
//! 正文优先取 content/<id>.md（contentFile 可覆盖），否则使用内联 sections。

use std::path::Path;

use serde::Deserialize;
use thiserror::Error;
use workos_storage::ManualDocument;

#[derive(Debug, Error)]
pub enum ManualError {
    #[error("{0}")]
    Message(String),
    #[error("IO：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON：{0}")]
    Json(#[from] serde_json::Error),
}
pub type Result<T> = std::result::Result<T, ManualError>;

fn err<T>(msg: impl Into<String>) -> Result<T> {
    Err(ManualError::Message(msg.into()))
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManualIndexFile {
    #[serde(default)]
    pub documents: Vec<ManualIndexDoc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManualIndexDoc {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub sections: Vec<workos_storage::ManualSection>,
    #[serde(default)]
    pub source: Option<workos_storage::ManualSourceInfo>,
    #[serde(default)]
    pub content_file: Option<String>,
}

/// 校验 schema：id/title 必填且唯一（验收 L3）
pub fn validate_docs(docs: &[ManualDocument]) -> Result<()> {
    let mut ids = std::collections::HashSet::new();
    for d in docs {
        if d.id.is_empty() || d.title.is_empty() {
            return err(format!("文档缺少 id/title：{d:?}"));
        }
        if !ids.insert(d.id.clone()) {
            return err(format!("文档 id 重复：{}", d.id));
        }
    }
    Ok(())
}

/// 从插件目录读取 dist 三件套并解析为 ManualDocument（验收 L 安装链路）
pub fn load_plugin_docs(plugin_dir: &Path, index_rel: &str, content_rel: &str) -> Result<Vec<ManualDocument>> {
    let index_path = plugin_dir.join(index_rel);
    let raw = std::fs::read_to_string(&index_path)
        .map_err(|e| ManualError::Message(format!("读取 {} 失败：{e}", index_path.display())))?;
    let index: ManualIndexFile = serde_json::from_str(&raw)?;
    let content_dir = plugin_dir.join(content_rel);

    let mut out = Vec::with_capacity(index.documents.len());
    for d in index.documents {
        let content = match &d.content_file {
            Some(f) => std::fs::read_to_string(content_dir.join(f)).ok(),
            None => std::fs::read_to_string(content_dir.join(format!("{}.md", d.id))).ok(),
        };
        let mut doc = ManualDocument {
            id: d.id,
            title: d.title,
            aliases: d.aliases,
            summary: d.summary,
            category: d.category,
            tags: d.tags,
            sections: d.sections,
            source: d.source.unwrap_or(workos_storage::ManualSourceInfo {
                name: String::new(),
                url: String::new(),
                license: String::new(),
            }),
        };
        if let Some(md) = content {
            doc.sections = vec![workos_storage::ManualSection {
                heading: String::new(),
                body: md,
            }];
        }
        out.push(doc);
    }
    if out.is_empty() {
        return err("手册 index 为空");
    }
    validate_docs(&out)?;
    Ok(out)
}
