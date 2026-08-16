//! Plugin Runtime（技术架构 §7、§9、§22、§31、§32）
//!
//! 插件包安装链路：Download/Local → Validate Package → Validate Manifest → Check apiVersion
//! → Hash → Permission Prompt(由 app 层负责 UI) → Install → Register Commands / Manual Provider

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use workos_permission::{is_valid_permission, HOST_API_VERSION};
use workos_storage::{PluginRow, Storage};

#[derive(Debug, Error)]
pub enum PluginError {
    #[error("{0}")]
    Message(String),
    #[error("IO 错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("Zip 错误：{0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("JSON 错误：{0}")]
    Json(#[from] serde_json::Error),
    #[error("Manual 错误：{0}")]
    Manual(#[from] workos_manual::ManualError),
}
pub type Result<T> = std::result::Result<T, PluginError>;

fn err<T>(msg: impl Into<String>) -> Result<T> {
    Err(PluginError::Message(msg.into()))
}

// ---------- Manifest（技术架构 §9） ----------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginCommandDef {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualConfig {
    pub provider: String,
    pub index: String,
    #[serde(default)]
    pub database: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub schema_version: i64,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "type")]
    pub plugin_type: String, // ui | manual | system
    pub api_version: String,
    #[serde(default)]
    pub entry: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub commands: Vec<PluginCommandDef>,
    #[serde(default)]
    pub manual: Option<ManualConfig>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
}

/// Manifest 校验（Rust 侧，与 TS zod 双侧一致，验收 E2/E9）
pub fn validate_manifest(value: &serde_json::Value) -> Result<PluginManifest> {
    let m: PluginManifest = serde_json::from_value(value.clone())?;
    if m.schema_version != 1 {
        return err(format!("schemaVersion 必须为 1，当前 {}", m.schema_version));
    }
    if !m.id.contains('.') || !m.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-') {
        return err(format!("非法插件 id：{}", m.id));
    }
    let semver = m.version.split('.').collect::<Vec<_>>();
    if semver.len() != 3 || semver.iter().any(|p| p.parse::<u32>().is_err()) {
        return err(format!("非法版本号：{}", m.version));
    }
    if !matches!(m.plugin_type.as_str(), "ui" | "manual" | "system") {
        return err(format!("非法插件类型：{}", m.plugin_type));
    }
    let api_v: u32 = m.api_version.parse().map_err(|_| PluginError::Message(format!("非法 apiVersion：{}", m.api_version)))?;
    if api_v != HOST_API_VERSION {
        return err(format!("apiVersion {} 与宿主 {} 不兼容", m.api_version, HOST_API_VERSION));
    }
    if m.plugin_type == "manual" && m.manual.is_none() {
        return err("manual 类型插件必须声明 manual 配置");
    }
    if m.plugin_type != "manual" && m.entry.is_none() {
        return err(format!("{} 类型插件必须声明 entry", m.plugin_type));
    }
    if let Some(e) = &m.entry {
        if e.starts_with('/') || e.contains("..") {
            return err(format!("entry 必须是包内相对路径：{e}"));
        }
    }
    for p in &m.permissions {
        if !is_valid_permission(p) {
            return err(format!("非法权限（V0.1 不存在此权限）：{p}"));
        }
    }
    let mut ids = std::collections::HashSet::new();
    for c in &m.commands {
        if c.id.is_empty() || c.title.is_empty() {
            return err("命令 id/title 不能为空");
        }
        if !ids.insert(c.id.clone()) {
            return err(format!("命令 id 重复：{}", c.id));
        }
    }
    Ok(m)
}

// ---------- 安装布局 ----------
// plugins_root/<plugin_id>/current/  ← 解包后的插件内容（manifest.json 在根部）

pub struct Installer<'a> {
    pub storage: &'a Storage,
    pub plugins_root: PathBuf,
}

impl<'a> Installer<'a> {
    pub fn new(storage: &'a Storage, plugins_root: impl Into<PathBuf>) -> Self {
        Self { storage, plugins_root: plugins_root.into() }
    }

    pub fn plugin_dir(&self, plugin_id: &str) -> PathBuf {
        self.plugins_root.join(plugin_id).join("current")
    }

    /// 解析 zip 内 manifest（安装前校验，不落盘）
    pub fn inspect_zip(bytes: &[u8]) -> Result<(PluginManifest, serde_json::Value)> {
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)?;
        let mut manifest_raw: Option<serde_json::Value> = None;
        for i in 0..archive.len() {
            let mut f = archive.by_index(i)?;
            if f.name() == "manifest.json" {
                let mut buf = String::new();
                f.read_to_string(&mut buf)?;
                manifest_raw = Some(serde_json::from_str(&buf)?);
                break;
            }
        }
        let raw = manifest_raw.ok_or_else(|| PluginError::Message("包内缺少 manifest.json".into()))?;
        let m = validate_manifest(&raw)?;
        Ok((m, raw))
    }

    /// 校验 sha256（验收 E11/F5/L 包完整性）
    pub fn verify_sha256(bytes: &[u8], expected: &str) -> Result<()> {
        let digest = hex::encode(Sha256::digest(bytes));
        if digest.eq_ignore_ascii_case(expected.trim()) {
            Ok(())
        } else {
            err(format!("sha256 校验失败：期望 {expected}，实际 {digest}"))
        }
    }

    /// 安装 zip 包（bytes 已通过 hash 校验；granted_perms 为用户确认后的权限）
    pub fn install_zip(&self, bytes: &[u8], source: &str, granted_perms: &[String]) -> Result<PluginManifest> {
        let (manifest, raw) = Self::inspect_zip(bytes)?;
        // manual 插件：先解包并导入文档索引，全部成功后才落库注册（失败不留脏数据）
        if manifest.plugin_type == "manual" {
            let probe = tempfile::tempdir()?;
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = zip::ZipArchive::new(cursor)?;
            for i in 0..archive.len() {
                let mut f = archive.by_index(i)?;
                if f.name().contains("..") {
                    continue;
                }
                let out_path = probe.path().join(f.name());
                if f.is_dir() {
                    std::fs::create_dir_all(&out_path)?;
                } else if f.name() == "manifest.json" || !f.name().starts_with('.') {
                    if let Some(parent) = out_path.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    let mut buf = Vec::new();
                    f.read_to_end(&mut buf)?;
                    std::fs::write(&out_path, buf)?;
                }
            }
            if let Some(cfg) = &manifest.manual {
                let docs = workos_manual::load_plugin_docs(probe.path(), &cfg.index, &cfg.content)?;
                self.storage
                    .import_manual(&manifest.id, &manifest.name, &manifest.version, &docs)
                    .map_err(|e| PluginError::Message(format!("手册导入失败：{e}")))?;
            }
        }
        let dest = self.plugin_dir(&manifest.id);
        if dest.exists() {
            std::fs::remove_dir_all(&dest)?;
        }
        std::fs::create_dir_all(&dest)?;
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)?;
        for i in 0..archive.len() {
            let mut f = archive.by_index(i)?;
            // 路径穿越防护
            if f.name().contains("..") {
                continue;
            }
            let out_path = dest.join(f.name());
            if f.is_dir() {
                std::fs::create_dir_all(&out_path)?;
            } else if f.name() == "manifest.json" || !f.name().starts_with('.') {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut buf = Vec::new();
                f.read_to_end(&mut buf)?;
                std::fs::write(&out_path, buf)?;
            }
        }
        self.register(&manifest, &raw, source, None, granted_perms)?;
        if manifest.plugin_type == "manual" {
            // 导入已通过 probe 验证；此处基于最终目录重建索引（内容一致）
            if let Some(cfg) = &manifest.manual {
                let docs = workos_manual::load_plugin_docs(&dest, &cfg.index, &cfg.content)?;
                self.storage
                    .import_manual(&manifest.id, &manifest.name, &manifest.version, &docs)
                    .map_err(|e| PluginError::Message(format!("手册导入失败：{e}")))?;
                tracing::info!(plugin = %manifest.id, docs = docs.len(), "manual imported");
            }
        }
        Ok(manifest)
    }

    /// Developer Mode：从本地开发目录加载（未打包 dist）
    pub fn install_dev(&self, dir: &Path) -> Result<PluginManifest> {
        let manifest_path = dir.join("manifest.json");
        if !manifest_path.exists() {
            // 兼容 dist 内的 manifest
            let alt = dir.join("dist").join("manifest.json");
            if alt.exists() {
                return self.install_dev_inner(&dir.join("dist"), dir);
            }
            return err(format!("目录缺少 manifest.json：{}", dir.display()));
        }
        self.install_dev_inner(dir, dir)
    }

    fn install_dev_inner(&self, content_dir: &Path, origin: &Path) -> Result<PluginManifest> {
        let raw: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(content_dir.join("manifest.json"))?)?;
        let manifest = validate_manifest(&raw)?;
        self.register(&manifest, &raw, "dev", Some(&origin.to_string_lossy()), &manifest.permissions)?;
        if manifest.plugin_type == "manual" {
            if let Some(cfg) = &manifest.manual {
                let docs = workos_manual::load_plugin_docs(content_dir, &cfg.index, &cfg.content)?;
                self.storage
                    .import_manual(&manifest.id, &manifest.name, &manifest.version, &docs)
                    .map_err(|e| PluginError::Message(format!("手册导入失败：{e}")))?;
            }
        }
        Ok(manifest)
    }

    fn register(
        &self,
        m: &PluginManifest,
        raw: &serde_json::Value,
        source: &str,
        source_path: Option<&str>,
        granted_perms: &[String],
    ) -> Result<()> {
        let row = PluginRow {
            id: m.id.clone(),
            name: m.name.clone(),
            version: m.version.clone(),
            plugin_type: m.plugin_type.clone(),
            api_version: m.api_version.parse().unwrap_or(0),
            manifest_json: serde_json::to_string(raw)?,
            source: source.to_string(),
            source_path: source_path.map(String::from),
            enabled: true,
            installed_at: Storage::now(),
        };
        self.storage.plugins_upsert(&row).map_err(|e| PluginError::Message(e.to_string()))?;
        self.storage
            .permissions_grant(&m.id, granted_perms)
            .map_err(|e| PluginError::Message(e.to_string()))?;
        Ok(())
    }

    /// 内置插件引导：随应用分发的 *.workos-plugin 安装到插件目录（首启自动，权限预授）
    pub fn bootstrap_builtin(&self, resource_plugins_dir: &Path) -> Result<Vec<String>> {
        let mut installed = Vec::new();
        let entries = match std::fs::read_dir(resource_plugins_dir) {
            Ok(e) => e,
            Err(_) => return Ok(installed),
        };
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) != Some("workos-plugin") {
                continue;
            }
            let bytes = match std::fs::read(&p) {
                Ok(b) => b,
                Err(e2) => {
                    tracing::warn!("读取内置插件失败 {}: {e2}", p.display());
                    continue;
                }
            };
            let (m, _) = match Self::inspect_zip(&bytes) {
                Ok(v) => v,
                Err(e2) => {
                    tracing::warn!("内置插件 manifest 无效 {}: {e2}", p.display());
                    continue;
                }
            };
            // 已有同版本则跳过；老版本则升级
            if let Some(existing) = self.storage.plugin_row(&m.id).map_err(|e| PluginError::Message(e.to_string()))? {
                if existing.version == m.version {
                    continue;
                }
            }
            match self.install_zip(&bytes, "builtin", &m.permissions) {
                Ok(_) => {
                    installed.push(m.id.clone());
                    tracing::info!("内置插件已安装/升级：{} {}", m.id, m.version);
                }
                Err(e2) => tracing::warn!("内置插件安装失败 {}: {e2}", p.display()),
            }
        }
        Ok(installed)
    }

    pub fn uninstall(&self, plugin_id: &str) -> Result<()> {
        self.storage.plugin_delete(plugin_id).map_err(|e| PluginError::Message(e.to_string()))?;
        let dir = self.plugins_root.join(plugin_id);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
        Ok(())
    }

    /// 汇总所有已启用插件的命令（Launcher 的插件命令来源，验收 C1/D1）
    pub fn collect_commands(&self) -> Result<Vec<PluginCommandInfo>> {
        let rows = self
            .storage
            .plugins_list(true)
            .map_err(|e| PluginError::Message(e.to_string()))?;
        let mut out = Vec::new();
        for row in rows {
            let raw: serde_json::Value = serde_json::from_str(&row.manifest_json)?;
            let m: PluginManifest = serde_json::from_value(raw)?;
            for c in m.commands {
                out.push(PluginCommandInfo {
                    plugin_id: row.id.clone(),
                    plugin_name: row.name.clone(),
                    command: c,
                });
            }
        }
        Ok(out)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCommandInfo {
    pub plugin_id: String,
    pub plugin_name: String,
    pub command: PluginCommandDef,
}

// ---------- 静态 Registry（技术架构 §22） ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryPlugin {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub version: String,
    #[serde(rename = "type", default)]
    pub plugin_type: String,
    pub download: String,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryDoc {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub updated: String,
    pub plugins: Vec<RegistryPlugin>,
}

pub async fn fetch_registry(url: &str) -> Result<RegistryDoc> {
    let resp = reqwest::get(url).await.map_err(|e| PluginError::Message(format!("registry 拉取失败：{e}")))?;
    let text = resp.text().await.map_err(|e| PluginError::Message(e.to_string()))?;
    let doc: RegistryDoc = serde_json::from_str(&text)?;
    Ok(doc)
}

pub async fn download_plugin(url: &str) -> Result<Vec<u8>> {
    let resp = reqwest::get(url).await.map_err(|e| PluginError::Message(format!("插件下载失败：{e}")))?;
    let bytes = resp.bytes().await.map_err(|e| PluginError::Message(e.to_string()))?;
    Ok(bytes.to_vec())
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_json(id: &str, ptype: &str) -> serde_json::Value {
        let mut v = serde_json::json!({
            "schemaVersion": 1,
            "id": id,
            "name": "测试插件",
            "version": "0.1.0",
            "type": ptype,
            "apiVersion": "1",
        });
        if ptype == "manual" {
            v["manual"] = serde_json::json!({"provider":"static","index":"dist/index.json","content":"dist/content"});
        } else {
            v["entry"] = serde_json::json!("dist/index.html");
        }
        v
    }

    #[test]
    fn manifest_校验_合法与非法() {
        assert!(validate_manifest(&manifest_json("dev.workos.tool.a", "ui")).is_ok());
        assert!(validate_manifest(&manifest_json("dev.workos.manual.linux", "manual")).is_ok());

        let mut bad = manifest_json("dev.workos.tool.a", "ui");
        bad["type"] = "widget".into();
        assert!(validate_manifest(&bad).is_err());

        let mut bad = manifest_json("dev.workos.tool.a", "ui");
        bad["apiVersion"] = "2".into();
        assert!(validate_manifest(&bad).is_err());

        let mut bad = manifest_json("dev.workos.tool.a", "ui");
        bad["permissions"] = serde_json::json!(["shell.execute"]);
        assert!(validate_manifest(&bad).is_err());

        // ui 类型缺 entry 被拒
        let mut bad = manifest_json("dev.workos.tool.a", "ui");
        bad.as_object_mut().unwrap().remove("entry");
        assert!(validate_manifest(&bad).is_err());

        // manual 类型缺 manual 配置被拒
        let mut bad = manifest_json("dev.workos.tool.a", "ui");
        bad["type"] = "manual".into();
        assert!(validate_manifest(&bad).is_err());

        let mut bad = manifest_json("dev.workos.tool.a", "ui");
        bad["entry"] = "../../etc/passwd".into();
        assert!(validate_manifest(&bad).is_err());
    }

    #[test]
    fn zip_安装链路与_sha256() {
        let storage = Storage::open_in_memory().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let installer = Installer::new(&storage, dir.path().join("plugins"));

        let bytes = test_zip(manifest_json("dev.workos.tool.z", "ui"));
        // hash 校验失败被拒
        assert!(Installer::verify_sha256(&bytes, "deadbeef").is_err());
        Installer::verify_sha256(&bytes, &sha256_hex(&bytes)).unwrap();
        let m = installer.install_zip(&bytes, "local", &["clipboard.write".into()]).unwrap();
        assert_eq!(m.id, "dev.workos.tool.z");
        assert!(installer.plugin_dir("dev.workos.tool.z").join("manifest.json").exists());

        let rows = storage.plugins_list(false).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(storage.permissions_list("dev.workos.tool.z").unwrap(), vec!["clipboard.write"]);

        // 命令收集
        let cmds = installer.collect_commands().unwrap();
        assert!(cmds.is_empty()); // 该 manifest 无 commands

        // 卸载
        installer.uninstall("dev.workos.tool.z").unwrap();
        assert!(storage.plugins_list(false).unwrap().is_empty());
        assert!(!installer.plugin_dir("dev.workos.tool.z").exists());
    }

    #[test]
    fn 坏包_缺_manifest_被拒() {
        use std::io::Write;
        let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        w.start_file("readme.txt", zip::write::SimpleFileOptions::default()).unwrap();
        w.write_all(b"hello").unwrap();
        let bytes = w.finish().unwrap().into_inner();
        assert!(Installer::inspect_zip(&bytes).is_err());
    }

    fn test_zip(manifest: serde_json::Value) -> Vec<u8> {
        use std::io::Write;
        let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        w.start_file("manifest.json", zip::write::SimpleFileOptions::default()).unwrap();
        w.write_all(serde_json::to_string(&manifest).unwrap().as_bytes()).unwrap();
        w.start_file("dist/index.html", zip::write::SimpleFileOptions::default()).unwrap();
        w.write_all(b"<html></html>").unwrap();
        w.finish().unwrap().into_inner()
    }
}
