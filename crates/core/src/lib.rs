//! 应用核心状态（组合各服务 crate）

use std::sync::Arc;
use std::time::Instant;

use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use workos_network::{NetworkService, WsManager};
use workos_permission::PermissionBroker;
use workos_storage::Storage;

static GLOBAL: OnceCell<Arc<AppState>> = OnceCell::new();

/// 全局状态（setup 时设置一次；简化 async 命令中的借用）
pub fn set_global(state: Arc<AppState>) {
    let _ = GLOBAL.set(state);
}

pub fn global() -> Arc<AppState> {
    GLOBAL.get().expect("AppState 未初始化").clone()
}

/// 性能埋点（技术架构 §38）：统一输出 `[perf]` 前缀日志，供验收读取
pub struct PerfLog;

impl PerfLog {
    pub fn span(name: &'static str) -> PerfSpan {
        PerfSpan { name, t0: Instant::now() }
    }
}

pub struct PerfSpan {
    name: &'static str,
    t0: Instant,
}

impl PerfSpan {
    pub fn finish(self) -> f64 {
        let ms = self.t0.elapsed().as_secs_f64() * 1000.0;
        tracing::info!("[perf] {} {:.1}ms", self.name, ms);
        ms
    }
}

pub struct AppState {
    pub storage: Arc<Storage>,
    pub broker: PermissionBroker,
    pub network: NetworkService,
    pub ws: WsManager,
    /// webview label "plugin:<id>" → 最近一次进入事件（插件 ready 前暂存）
    pub pending_enter: Mutex<std::collections::HashMap<String, serde_json::Value>>,
    /// 已 ready 的插件 webview
    pub plugin_ready: Mutex<std::collections::HashSet<String>>,
}

impl AppState {
    pub fn new(storage: Arc<Storage>) -> Self {
        let broker = PermissionBroker::new();
        let network = NetworkService::new(storage.clone());
        let s = Self {
            storage,
            broker,
            network,
            ws: WsManager::new(),
            pending_enter: Mutex::new(std::collections::HashMap::new()),
            plugin_ready: Mutex::new(std::collections::HashSet::new()),
        };
        s.reload_grants();
        s
    }

    /// 从持久化层重载插件授权表（安装/引导/启停后调用）
    pub fn reload_grants(&self) {
        let all = self.storage.permissions_all().unwrap_or_default();
        let mut map = std::collections::HashMap::new();
        for (pid, perm) in all {
            let e = map.entry(pid).or_insert_with(|| (1u32, std::collections::HashSet::new()));
            e.1.insert(perm);
        }
        self.broker.load(map);
    }

    /// 从 webview label 解析插件 id（插件无法伪造，验收 E6 Resolve Plugin ID）
    /// label 形如 plugin:dev/workos/tool/json-tools（id 中的 . 映射为 /，Tauri label 不允许 .）
    pub fn plugin_id_from_label(label: &str) -> Option<String> {
        label.strip_prefix("plugin:").map(|s| s.replace('/', "."))
    }

    /// 插件 id → webview label
    pub fn plugin_label(plugin_id: &str) -> String {
        format!("plugin:{}", plugin_id.replace('.', "/"))
    }

    pub fn host_label(label: &str) -> bool {
        label == "workbench" || label == "launcher"
    }
}
