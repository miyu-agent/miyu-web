//! 网页软件的数（施工 9-1 下）：默认值照清单 `packages/web/package.toml`，常量照 `packages/web/web.json`；核心交回的最终值盖上去，不合范围的
//! 照旧。

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde_json::json;

use super::*;

/// 出厂的资源目录照装好的样子拼一份（仓库拆开以后）：这个仓库的 `package/`（清单、`web.json`）放进 `packages/web/`。一个进程拼一次。
fn shipped_root() -> &'static Path {
    static ROOT: OnceLock<PathBuf> = OnceLock::new();
    ROOT.get_or_init(|| {
        let root = std::env::temp_dir().join(format!("miyu-web-shipped-{}", std::process::id()));
        std::fs::create_dir_all(root.join(DIR)).unwrap();
        let ours = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../package");
        std::fs::copy(ours.join("package.toml"), root.join(MANIFEST)).unwrap();
        std::fs::copy(ours.join("web.json"), root.join(FILE)).unwrap();
        root
    })
}

fn shipped() -> Settings {
    Settings::load(shipped_root()).unwrap()
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
    assert_eq!(hidden, [false, true, true, true], "端口露，别的不露");
}
