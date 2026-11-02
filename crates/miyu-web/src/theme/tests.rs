//! 网页外观的地址怎么拆、网页目录照 `package.list` 怎么找（核心 TH-1）。

use serde_json::json;

use super::{split, web_dir};

#[test]
fn paths_split_into_ticket_package_and_file() {
    let three =
        |f: Option<&str>| Some(("abc".to_string(), "look".to_string(), f.map(str::to_string)));
    assert_eq!(split("/t/abc/look/index.js"), three(Some("index.js")));
    assert_eq!(
        split("/t/abc/look/fonts/a.woff2"),
        three(Some("fonts/a.woff2"))
    );
    assert_eq!(split("/t/abc/look/%E4%B8%AD.css"), three(Some("中.css")));
    for bad in [
        "/t/abc/look/",
        "/t/abc/look",
        "/t/abc/look/sub/",
        "/t/abc/look/a//b",
        "/t/abc/look/../package.toml",
        "/t/abc/look/%2e%2e/package.toml",
        "/t/abc/look/a/%2E%2E/%2e%2e/x",
        "/t/abc/look/./index.js",
        "/t/abc/look//etc/passwd",
        "/t/abc/look/a%5Cb",
        "/t/abc/look/c:x",
        "/t/abc/look/a%0Ab",
    ] {
        assert_eq!(split(bad), three(None), "{bad}");
    }
    assert_eq!(split("/t//look/index.js"), None, "没有票据");
    assert_eq!(
        split("/t/abc/bad%20name/index.js"),
        None,
        "包的编号写法不对"
    );
    assert_eq!(split("/t/abc/look/%00"), None, "NUL");
    assert_eq!(split("/t/abc/look/%ff"), None, "不是 UTF-8");
    assert_eq!(split("/p/abc/look/index.js"), None);
}

#[test]
fn the_web_dir_comes_from_the_package_list() {
    let listed = json!({"packages": [
        {"package": "look", "kind": "theme", "theme": {"tui": {"file": "theme.json"}, "web": {"dir": "web/"}}},
        {"package": "tui-only", "kind": "theme", "theme": {"tui": {"file": "theme.json"}}},
        {"package": "plain", "status": "ready"},
        {"package": "odd", "theme": {"web": {"dir": ""}}},
    ]});
    assert_eq!(web_dir(&listed, "look").as_deref(), Some("web"));
    assert_eq!(web_dir(&listed, "tui-only"), None);
    assert_eq!(web_dir(&listed, "plain"), None);
    assert_eq!(web_dir(&listed, "odd"), None);
    assert_eq!(web_dir(&listed, "nope"), None);
    assert_eq!(web_dir(&json!({}), "look"), None);
}
