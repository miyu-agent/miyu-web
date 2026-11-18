//! 页面文件：落在页面目录里的才给，桥自己的源码和编出来的东西不给。

use super::resolve;

/// 页面目录的替身：一个页面、桥的一份源码。交回照真实路径解析过的目录。
fn site() -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("miyu-web-bridge-files-{}", std::process::id()));
    std::fs::create_dir_all(root.join("bridge/src")).expect("建得了目录");
    std::fs::write(root.join("index.html"), "").expect("写得进");
    std::fs::write(root.join("bridge/src/main.rs"), "").expect("写得进");
    root.canonicalize().expect("解析得了")
}

#[test]
fn the_bridge_source_is_not_served_however_the_path_is_written() {
    let dir = site();
    assert!(resolve(&dir, "/index.html").is_some(), "页面照给");
    // 审计 #079：原来只看开头是不是 `bridge/`，`/./bridge/…` 绕过去以后解析回桥的源码照给
    for path in [
        "/bridge/src/main.rs",
        "//bridge/src/main.rs",
        "/./bridge/src/main.rs",
        "/././bridge/src/main.rs",
        "/.//bridge/src/main.rs",
        "/src/../bridge/src/main.rs",
    ] {
        assert_eq!(resolve(&dir, path), None, "{path}");
    }
    std::fs::remove_dir_all(&dir).expect("删得掉");
}

#[test]
fn the_app_manifest_comes_as_a_manifest() {
    // 审计 #087：页面带的应用清单 `manifest.webmanifest`（蓝图 `web.md`「装成应用」）原来照 `application/octet-stream` 给
    assert_eq!(
        super::kind(std::path::Path::new("/web-demo/manifest.webmanifest")),
        "application/manifest+json"
    );
}
