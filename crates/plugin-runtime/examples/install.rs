//! 用真实 Installer 代码对应用数据库安装插件包（验收辅助工具）
//! 用法: cargo run -p workos-plugin-runtime --example install -- <db路径> <plugins根目录> <包路径> [权限逗号列表]

use std::path::PathBuf;
use std::sync::Arc;
use workos_plugin_runtime::Installer;
use workos_storage::Storage;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("用法: install <db> <plugins_root> <pkg.workos-plugin> [perms]");
        std::process::exit(2);
    }
    let db = PathBuf::from(&args[1]);
    let root = PathBuf::from(&args[2]);
    let pkg = PathBuf::from(&args[3]);
    let perms: Vec<String> = args.get(4).map(|s| s.split(',').map(String::from).filter(|p| !p.is_empty()).collect()).unwrap_or_default();

    let storage = Arc::new(Storage::open(&db).expect("open db"));
    let bytes = std::fs::read(&pkg).expect("read pkg");
    let installer = Installer::new(&storage, &root);
    let sha = workos_plugin_runtime::sha256_hex(&bytes);
    Installer::verify_sha256(&bytes, &sha).expect("sha256 self-check");
    let (manifest, _) = Installer::inspect_zip(&bytes).expect("inspect");
    let perms = if perms.is_empty() { manifest.permissions.clone() } else { perms };
    println!("→ 安装 {} v{}（权限 {:?}）", manifest.id, manifest.version, perms);
    let m = installer.install_zip(&bytes, "local", &perms).expect("install");
    println!("✓ 已安装 {} v{}，手册文档 {} 篇", m.id, m.version, storage.manual_docs_count().unwrap_or(0));
}
