//! 网页软件的数（施工 9-1 下）：默认值照清单 `packages/miyu-webui/package.toml`，常量照 `packages/miyu-webui/web.json`；核心交回的最终值盖上去，不合范围的
//! 照旧。

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde_json::json;

use super::*;

/// 网页包的文件夹照装好的样子拼一份（仓库拆开以后）：这个仓库的 `miyu-webui/` 里的清单、`web.json`。一个进程拼一次。
fn shipped_root() -> &'static Path {
    static ROOT: OnceLock<PathBuf> = OnceLock::new();
    ROOT.get_or_init(|| {
        let root = std::env::temp_dir().join(format!("miyu-web-shipped-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let ours = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../miyu-webui");
        std::fs::copy(ours.join("package.toml"), root.join(MANIFEST)).unwrap();
        std::fs::copy(ours.join("web.json"), root.join(FILE)).unwrap();
        root
    })
}

fn shipped() -> Settings {
    Settings::load(shipped_root()).unwrap()
}

#[test]
fn the_package_folder_is_what_the_core_gave_then_the_one_holding_the_program_in_bin() {
    let scratch = std::env::temp_dir().join(format!("miyu-web-package-dir-{}", std::process::id()));
    let given = scratch.join("given");
    let installed = scratch.join("installed");
    std::fs::create_dir_all(installed.join("bin")).unwrap();
    std::fs::create_dir_all(&given).unwrap();
    std::fs::write(installed.join(FILE), "{}").unwrap();
    let exe = installed.join("bin").join("miyu-web");
    // 核心给的那个里面没有 web.json：照程序带着装的那个
    assert_eq!(
        package_dir(Some(&given), Some(&exe)),
        Some(installed.clone())
    );
    std::fs::write(given.join(FILE), "{}").unwrap();
    assert_eq!(
        package_dir(Some(&given), Some(&exe)),
        Some(given.clone()),
        "核心给的在前"
    );
    assert_eq!(
        package_dir(Some(Path::new("given")), Some(&exe)),
        Some(installed.clone()),
        "相对的不认"
    );
    // 程序不在 bin/ 里（随 Miyu 装在主程序旁边、开发时在 target/ 里）：交 None，照资源目录找
    let loose = scratch.join("deploy").join("miyu-web");
    assert_eq!(package_dir(None, Some(&loose)), None);
    assert_eq!(package_dir(None, None), None);
    std::fs::remove_dir_all(&scratch).unwrap();
}

#[test]
fn the_defaults_come_from_the_manifest_and_the_constants_from_web_json() {
    let settings = shipped();
    assert_eq!(
        (
            settings.port,
            settings.idle_seconds,
            settings.ticket_idle_seconds,
            settings.most_tickets
        ),
        (8300, 600, 43_200, 4096)
    );
    assert!(settings.csp.starts_with("default-src 'self'"));
    assert_eq!(
        settings.types.get("html").map(String::as_str),
        Some("text/html; charset=utf-8")
    );
}

#[test]
fn final_values_from_the_core_win_and_odd_ones_are_ignored() {
    let items = json!({
        "web.port": {"value": 9000, "origin": {"layer": "system"}},
        "web.idle_seconds": {"value": 30},
        "web.most_tickets": {"value": -1},
    });
    let settings = shipped().configured(&items);
    assert_eq!(settings.port, 9000);
    assert_eq!(settings.idle_seconds, 30);
    assert_eq!(settings.ticket_idle_seconds, 43_200, "没交的照旧");
    assert_eq!(settings.most_tickets, 4096, "不合范围的照旧");
    assert_eq!(
        shipped()
            .configured(&json!({"web.port": {"value": 70000}}))
            .port,
        8300
    );
}

#[test]
fn every_key_asked_for_is_declared_in_the_manifest() {
    let text = std::fs::read_to_string(shipped_root().join(MANIFEST)).unwrap();
    let manifest = miyu_client::manifest::read(&text).unwrap();
    let declared: Vec<String> = manifest
        .settings
        .iter()
        .map(|setting| format!("web.{}", setting.name))
        .collect();
    assert_eq!(declared, KEYS);
    let hidden: Vec<bool> = manifest
        .settings
        .iter()
        .map(|setting| setting.hidden)
        .collect();
    assert_eq!(
        hidden,
        [false, false, true, true, true],
        "端口、听的地址露，别的不露"
    );
}

#[test]
fn the_listen_address_defaults_to_this_computer_and_takes_a_configured_address() {
    let localhost: std::net::IpAddr = "127.0.0.1".parse().unwrap();
    assert_eq!(shipped().listen, localhost, "默认只有这台电脑");
    let lan = shipped().configured(&json!({"web.listen": {"value": "0.0.0.0"}}));
    assert_eq!(lan.listen, "0.0.0.0".parse::<std::net::IpAddr>().unwrap());
    let one = shipped().configured(&json!({"web.listen": {"value": " 192.168.1.20 "}}));
    assert_eq!(
        one.listen,
        "192.168.1.20".parse::<std::net::IpAddr>().unwrap(),
        "前后的空白不算"
    );
    let odd = shipped().configured(&json!({"web.listen": {"value": "my-laptop"}}));
    assert_eq!(odd.listen, localhost, "不是地址的照旧");
}
