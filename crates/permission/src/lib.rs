//! Permission Broker（技术架构 §13）
//!
//! 链路：Plugin API Call → Resolve Plugin ID → Validate API Version → Validate Permission → Native Service

use std::collections::{HashMap, HashSet};

use thiserror::Error;

/// 宿主支持的 Plugin API 大版本
pub const HOST_API_VERSION: u32 = 1;

/// V0.1 权限集（技术架构 §13）。高危权限 filesystem/shell 刻意不存在。
pub const V01_PERMISSIONS: &[&str] = &[
    "clipboard.read",
    "clipboard.write",
    "storage.read",
    "storage.write",
    "network.request",
    "secret.read",
    "secret.write",
    "dialog.open",
    "dialog.save",
    "notification.show",
];

pub fn is_valid_permission(p: &str) -> bool {
    V01_PERMISSIONS.contains(&p)
}

/// API 调用名 → 所需权限
pub fn api_permission(api: &str) -> Option<&'static str> {
    Some(match api {
        "clipboard.readText" => "clipboard.read",
        "clipboard.writeText" => "clipboard.write",
        "storage.get" | "storage.keys" => "storage.read",
        "storage.set" | "storage.remove" => "storage.write",
        "http.request" | "ws.connect" | "ws.send" | "ws.close" => "network.request",
        "secret.get" => "secret.read",
        "secret.set" | "secret.remove" => "secret.write",
        "dialog.open" => "dialog.open",
        "dialog.save" => "dialog.save",
        "notification.show" => "notification.show",
        // 以下为宿主内建能力，不经过权限（元信息/生命周期）
        "theme.get" | "window.setTitle" | "commands.execute" | "lifecycle.ready" => {
            return None
        }
        _ => return None,
    })
}

#[derive(Debug, Error)]
pub enum PermissionError {
    #[error("未知插件：{0}")]
    UnknownPlugin(String),
    #[error("API 版本不兼容：插件 {plugin} 声明 {declared}，宿主支持 {host}")]
    ApiVersion { plugin: String, declared: String, host: u32 },
    #[error("权限不足：{plugin} 未获得 {permission} 授权")]
    Denied { plugin: String, permission: String },
    #[error("未知 API：{0}")]
    UnknownApi(String),
}

/// 插件调用上下文：由宿主从 WebView label 解析，插件无法伪造
#[derive(Debug, Clone)]
pub struct PluginCaller {
    pub plugin_id: String,
    pub api_version: u32,
}

#[derive(Default)]
pub struct PermissionBroker {
    /// plugin_id -> (api_version, granted permissions)
    grants: parking_lot::RwLock<HashMap<String, (u32, HashSet<String>)>>,
}

impl PermissionBroker {
    pub fn new() -> Self {
        Self::default()
    }

    /// 从持久化层加载授权表
    pub fn load(&self, all: HashMap<String, (u32, HashSet<String>)>) {
        let mut g = self.grants.write();
        *g = all;
    }

    pub fn grant(&self, plugin_id: &str, api_version: u32, permissions: &[String]) {
        let mut g = self.grants.write();
        let e = g.entry(plugin_id.to_string()).or_insert((api_version, HashSet::new()));
        e.0 = api_version;
        for p in permissions {
            e.1.insert(p.clone());
        }
    }

    pub fn revoke_all(&self, plugin_id: &str) {
        self.grants.write().remove(plugin_id);
    }

    pub fn permissions_of(&self, plugin_id: &str) -> Vec<String> {
        self.grants
            .read()
            .get(plugin_id)
            .map(|(_, set)| set.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn is_granted(&self, plugin_id: &str, permission: &str) -> bool {
        self.grants
            .read()
            .get(plugin_id)
            .map(|(_, set)| set.contains(permission))
            .unwrap_or(false)
    }

    /// 完整校验链（验收 E6/E7）
    pub fn check(&self, caller: &PluginCaller, api: &str) -> Result<(), PermissionError> {
        if !caller.plugin_id.starts_with("dev.workos.") && !caller.plugin_id.contains('.') {
            return Err(PermissionError::UnknownPlugin(caller.plugin_id.clone()));
        }
        if caller.api_version != HOST_API_VERSION {
            return Err(PermissionError::ApiVersion {
                plugin: caller.plugin_id.clone(),
                declared: caller.api_version.to_string(),
                host: HOST_API_VERSION,
            });
        }
        match api_permission(api) {
            None => Ok(()),
            Some(p) => {
                if self.is_granted(&caller.plugin_id, p) {
                    Ok(())
                } else {
                    Err(PermissionError::Denied {
                        plugin: caller.plugin_id.clone(),
                        permission: p.to_string(),
                    })
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caller(v: u32) -> PluginCaller {
        PluginCaller {
            plugin_id: "dev.workos.tool.json-tools".into(),
            api_version: v,
        }
    }

    #[test]
    fn 权限集不包含高危权限() {
        assert!(!is_valid_permission("filesystem.read"));
        assert!(!is_valid_permission("shell.execute"));
        assert!(is_valid_permission("clipboard.read"));
    }

    #[test]
    fn 未授权调用被拒绝() {
        let b = PermissionBroker::new();
        let err = b.check(&caller(1), "http.request").unwrap_err();
        assert!(err.to_string().contains("权限不足"), "{err}");
        assert!(err.to_string().contains("network.request"));
    }

    #[test]
    fn 授权后放行且未授权项仍拒绝() {
        let b = PermissionBroker::new();
        b.grant("dev.workos.tool.json-tools", 1, &["network.request".into()]);
        b.check(&caller(1), "http.request").unwrap();
        assert!(b.check(&caller(1), "secret.get").is_err());
    }

    #[test]
    fn api_版本不匹配被拒绝() {
        let b = PermissionBroker::new();
        b.grant("dev.workos.tool.json-tools", 1, &["network.request".into()]);
        assert!(matches!(
            b.check(&caller(2), "http.request"),
            Err(PermissionError::ApiVersion { .. })
        ));
    }

    #[test]
    fn 内建元信息_api_不要求权限() {
        let b = PermissionBroker::new();
        b.check(&caller(1), "theme.get").unwrap();
        b.check(&caller(1), "lifecycle.ready").unwrap();
    }

    #[test]
    fn revoke_all_后全部拒绝() {
        let b = PermissionBroker::new();
        b.grant("dev.workos.tool.json-tools", 1, &["clipboard.write".into()]);
        b.revoke_all("dev.workos.tool.json-tools");
        assert!(b.check(&caller(1), "clipboard.writeText").is_err());
    }
}
