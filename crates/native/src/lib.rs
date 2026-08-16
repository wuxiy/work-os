//! macOS Keychain Secret Store（技术架构 §15）
//!
//! Secret 永不写入 SQLite，按插件 namespace（plugin_id::key）存入系统 Keychain。

use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("Keychain 错误：{0}")]
    Keychain(String),
    #[error("Secret 不存在：{0}")]
    NotFound(String),
}
pub type Result<T> = std::result::Result<T, SecretError>;

const SERVICE: &str = "dev.workos.desktop.plugin-secrets";

fn account(plugin_id: &str, key: &str) -> String {
    format!("{plugin_id}::{key}")
}

/// SecretStore 抽象（技术架构 §15 trait 的 macOS 实现）
pub struct KeychainSecretStore;

impl KeychainSecretStore {
    pub fn set(plugin_id: &str, key: &str, value: &str) -> Result<()> {
        set_generic_password(SERVICE, &account(plugin_id, key), value.as_bytes())
            .map_err(|e| SecretError::Keychain(e.to_string()))
    }

    pub fn get(plugin_id: &str, key: &str) -> Result<Option<String>> {
        match get_generic_password(SERVICE, &account(plugin_id, key)) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|e| SecretError::Keychain(e.to_string())),
            Err(_) => Ok(None),
        }
    }

    pub fn remove(plugin_id: &str, key: &str) -> Result<()> {
        delete_generic_password(SERVICE, &account(plugin_id, key)).map_err(|e| SecretError::Keychain(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keychain_读写删除往返() {
        let (pid, key) = ("dev.workos.test.plugin", format!("test-key-{}", std::process::id()));
        KeychainSecretStore::set(pid, &key, "s3cret-值").unwrap();
        assert_eq!(KeychainSecretStore::get(pid, &key).unwrap().as_deref(), Some("s3cret-值"));
        KeychainSecretStore::remove(pid, &key).unwrap();
        assert_eq!(KeychainSecretStore::get(pid, &key).unwrap(), None);
    }
}
