use serde::{Deserialize, Serialize};

use super::{Result, Storage};

/// Manual Schema（技术架构 §17）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualSection {
    #[serde(default)]
    pub heading: String,
    pub body: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ManualSourceInfo {
    pub name: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub license: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualDocument {
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
    pub sections: Vec<ManualSection>,
    #[serde(default)]
    pub source: ManualSourceInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualSearchHit {
    pub source_id: String,
    pub doc_id: String,
    pub title: String,
    pub summary: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualDocRow {
    pub source_id: String,
    pub id: String,
    pub title: String,
    pub aliases: Vec<String>,
    pub summary: String,
    pub category: String,
    pub tags: Vec<String>,
    pub content: String,
}

impl Storage {
    /// 安装/更新 manual 插件时导入文档并重建 FTS 索引（原子事务）
    pub fn import_manual(&self, plugin_id: &str, name: &str, version: &str, docs: &[ManualDocument]) -> Result<()> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM manual_documents WHERE source_id=?1", [plugin_id])?;
        tx.execute("DELETE FROM manual_fts WHERE source_id=?1", [plugin_id])?;
        tx.execute("DELETE FROM manual_sources WHERE plugin_id=?1", [plugin_id])?;
        for d in docs {
            tx.execute(
                "INSERT INTO manual_documents(source_id,id,title,aliases,summary,category,tags,content) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                rusqlite::params![
                    plugin_id,
                    d.id,
                    d.title,
                    serde_json::to_string(&d.aliases)?,
                    d.summary,
                    d.category,
                    serde_json::to_string(&d.tags)?,
                    render_markdownish(d)
                ],
            )?;
            tx.execute(
                "INSERT INTO manual_fts(doc_id,source_id,title,aliases,summary,body) VALUES(?1,?2,?3,?4,?5,?6)",
                rusqlite::params![
                    d.id,
                    plugin_id,
                    d.title,
                    d.aliases.join(" "),
                    d.summary,
                    render_markdownish(d)
                ],
            )?;
        }
        tx.execute(
            "INSERT INTO manual_sources(plugin_id,name,version,docs_count,installed_at) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![plugin_id, name, version, docs.len() as i64, Self::now()],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn manual_sources_list(&self) -> Result<Vec<(String, String, String, i64)>> {
        self.with_conn(|c| {
            let mut stmt =
                c.prepare("SELECT plugin_id,name,version,docs_count FROM manual_sources ORDER BY plugin_id")?;
            let rows = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn manual_docs_count(&self) -> Result<i64> {
        self.with_conn(|c| Ok(c.query_row("SELECT COUNT(*) FROM manual_documents", [], |r| r.get(0))?))
    }

    /// 手册搜索（验收 L5）：trigram FTS 全文 + 短查询 LIKE 回退（命令名/别名/摘要）
    pub fn search_manual(&self, query: &str, limit: i64) -> Result<Vec<ManualSearchHit>> {
        let q = query.trim();
        let sql_like = "SELECT md.source_id, md.id, md.title, md.summary, md.category
            FROM manual_documents md
            WHERE md.title LIKE ?1 ESCAPE '\\'
               OR md.aliases LIKE ?1 ESCAPE '\\'
               OR md.summary LIKE ?1 ESCAPE '\\'
            ORDER BY (md.title = ?2) DESC, length(md.title) ASC
            LIMIT ?3";
        self.with_conn(|c| {
            let mut hits: Vec<ManualSearchHit> = Vec::new();
            // 精确/前缀命中优先（输入 systemctl 应第一位）
            let pattern = format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
            {
                let mut stmt = c.prepare(sql_like)?;
                let rows = stmt
                    .query_map(rusqlite::params![pattern, q, limit], |r| {
                        Ok(ManualSearchHit {
                            source_id: r.get(0)?,
                            doc_id: r.get(1)?,
                            title: r.get(2)?,
                            summary: r.get(3)?,
                            category: r.get(4)?,
                        })
                    })?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                hits.extend(rows);
            }
            // 全文检索（trigram，≥3 字符；命中中文正文）
            if q.chars().count() >= 3 {
                let mut stmt = c.prepare(
                    "SELECT f.source_id, f.doc_id, f.title, f.summary,
                        (SELECT category FROM manual_documents WHERE source_id=f.source_id AND id=f.doc_id)
                     FROM manual_fts f WHERE manual_fts MATCH ?1 LIMIT ?2",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![fts_query(q), limit], |r| {
                        Ok(ManualSearchHit {
                            source_id: r.get(0)?,
                            doc_id: r.get(1)?,
                            title: r.get(2)?,
                            summary: r.get(3)?,
                            category: r.get(4)?,
                        })
                    })?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                for h in rows {
                    if !hits.iter().any(|x| x.doc_id == h.doc_id && x.source_id == h.source_id) {
                        hits.push(h);
                    }
                }
            }
            hits.truncate(limit as usize);
            Ok(hits)
        })
    }

    pub fn manual_doc(&self, source_id: &str, doc_id: &str) -> Result<Option<ManualDocRow>> {
        use rusqlite::OptionalExtension;
        self.with_conn(|c| {
            Ok(c.query_row(
                "SELECT source_id,id,title,aliases,summary,category,tags,content FROM manual_documents WHERE source_id=?1 AND id=?2",
                rusqlite::params![source_id, doc_id],
                |r| {
                    Ok(ManualDocRow {
                        source_id: r.get(0)?,
                        id: r.get(1)?,
                        title: r.get(2)?,
                        aliases: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
                        summary: r.get(4)?,
                        category: r.get(5)?,
                        tags: serde_json::from_str(&r.get::<_, String>(6)?).unwrap_or_default(),
                        content: r.get(7)?,
                    })
                },
            )
            .optional()?)
        })
    }

    pub fn manual_doc_list(&self, source_id: &str) -> Result<Vec<ManualSearchHit>> {
        self.with_conn(|c| {
            let mut stmt = c.prepare(
                "SELECT source_id,id,title,summary,category FROM manual_documents WHERE source_id=?1 ORDER BY title",
            )?;
            let rows = stmt
                .query_map([source_id], |r| {
                    Ok(ManualSearchHit {
                        source_id: r.get(0)?,
                        doc_id: r.get(1)?,
                        title: r.get(2)?,
                        summary: r.get(3)?,
                        category: r.get(4)?,
                    })
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn manual_categories(&self, source_id: &str) -> Result<Vec<String>> {
        self.with_conn(|c| {
            let mut stmt =
                c.prepare("SELECT DISTINCT category FROM manual_documents WHERE source_id=?1 AND category != '' ORDER BY category")?;
            let rows = stmt.query_map([source_id], |r| r.get::<_, String>(0))?.collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }
}

fn fts_query(q: &str) -> String {
    // trigram 子串匹配
    format!("\"{}\"", q.replace('"', "\"\""))
}

fn render_markdownish(d: &ManualDocument) -> String {
    let mut out = String::new();
    if !d.summary.is_empty() {
        out.push_str(&d.summary);
        out.push_str("\n\n");
    }
    for s in &d.sections {
        if !s.heading.is_empty() {
            out.push_str("## ");
            out.push_str(&s.heading);
            out.push('\n');
        }
        out.push_str(&s.body);
        out.push_str("\n\n");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(id: &str, title: &str, aliases: &[&str], summary: &str, category: &str) -> ManualDocument {
        ManualDocument {
            id: id.into(),
            title: title.into(),
            aliases: aliases.iter().map(|s| s.to_string()).collect(),
            summary: summary.into(),
            category: category.into(),
            tags: vec![],
            sections: vec![ManualSection {
                heading: "示例".into(),
                body: format!("{title} 用于查看系统服务状态，例如 systemctl status nginx").repeat(3),
            }],
            source: ManualSourceInfo {
                name: "jaywcjlove/linux-command".into(),
                url: String::new(),
                license: String::new(),
            },
        }
    }

    #[test]
    fn 导入_搜索_阅读闭环() {
        let s = Storage::open_in_memory().unwrap();
        let docs = vec![
            doc("ls", "ls", &["dir"], "列出目录内容", "文件管理"),
            doc("systemctl", "systemctl", &["service"], "管理系统服务", "系统管理"),
            doc("grep", "grep", &[], "文本搜索", "文本处理"),
        ];
        s.import_manual("dev.workos.manual.linux", "Linux Manual", "1.0.0", &docs).unwrap();

        // 命令名短查询（LIKE 回退 + 正文全文命中；精确标题排第一）
        let hits = s.search_manual("systemctl", 10).unwrap();
        assert!(!hits.is_empty());
        assert_eq!(hits[0].doc_id, "systemctl");

        // 别名命中
        let hits = s.search_manual("service", 10).unwrap();
        assert!(hits.iter().any(|h| h.doc_id == "systemctl"), "{hits:?}");

        // 中文关键词（trigram ≥3 字）
        let hits = s.search_manual("管理系统服务", 10).unwrap();
        assert!(hits.iter().any(|h| h.doc_id == "systemctl"), "{hits:?}");

        // 摘要中文
        let hits = s.search_manual("列出目录", 10).unwrap();
        assert!(hits.iter().any(|h| h.doc_id == "ls"));

        // 阅读与分类
        let d = s.manual_doc("dev.workos.manual.linux", "systemctl").unwrap().unwrap();
        assert_eq!(d.title, "systemctl");
        assert_eq!(d.aliases, vec!["service"]);
        let cats = s.manual_categories("dev.workos.manual.linux").unwrap();
        assert!(cats.contains(&"系统管理".to_string()));
        assert_eq!(s.manual_docs_count().unwrap(), 3);
    }

    #[test]
    fn 重新导入覆盖旧数据() {
        let s = Storage::open_in_memory().unwrap();
        s.import_manual("dev.workos.manual.linux", "Linux Manual", "1.0.0", &[doc("ls", "ls", &[], "s", "c")])
            .unwrap();
        s.import_manual("dev.workos.manual.linux", "Linux Manual", "1.1.0", &[doc("top", "top", &[], "s", "c")])
            .unwrap();
        assert_eq!(s.manual_docs_count().unwrap(), 1);
        assert!(s.search_manual("ls", 10).unwrap().is_empty());
    }
}
