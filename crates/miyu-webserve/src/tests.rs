//! 共用的几样单独测（施工 O-16，`webserve.md`「守着它的」）：Host 的三种写法、听局域网时的 IP 写法（SU-1）、Origin；远程的连接；类型照扩展名；页面路径解不开、带 `..` 的
//! 不要。整套的规矩由网页软件、桥的测试经 HTTP 测。

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;

use miyu_store::root::DataRoot;

use crate::pages::{find, type_of};
use crate::{CoreCommand, Site};

/// 只交出端口、听的地址的一个：别的用不上。
struct Port(u16, DataRoot, CoreCommand, std::net::IpAddr);

impl Site for Port {
    type Busy = ();

    fn root(&self) -> &DataRoot {
        &self.1
    }

    fn port(&self) -> u16 {
        self.0
    }

    fn listen(&self) -> std::net::IpAddr {
        self.3
    }

    fn core(&self) -> &CoreCommand {
        &self.2
    }

    fn busy(self: &Arc<Self>) {}
}

fn site(port: u16) -> Port {
    listening(port, "127.0.0.1")
}

fn listening(port: u16, listen: &str) -> Port {
    let env = miyu_store::env::Env {
        platform: miyu_store::env::Platform::current(),
        miyu_home: Some(
            std::env::temp_dir()
                .join("miyu-webserve-unused")
                .into_os_string(),
        ),
        home: None,
        xdg_cache_home: None,
        local_app_data: None,
        miyu_resources: None,
        exe: None,
    };
    let root = DataRoot::locate(&env).expect("绝对路径");
    Port(
        port,
        root,
        Arc::new(|| std::process::Command::new("miyu")),
        listen.parse().expect("是地址"),
    )
}

#[test]
fn only_the_three_loopback_spellings_with_this_port_are_hosts() {
    let site = site(8302);
    assert_eq!(
        site.hosts(),
        ["127.0.0.1:8302", "localhost:8302", "[::1]:8302"].map(String::from)
    );
    for good in [
        "127.0.0.1:8302",
        "localhost:8302",
        "LocalHost:8302",
        "[::1]:8302",
    ] {
        assert!(site.host_allowed(Some(good)), "{good}");
    }
    for bad in [
        None,
        Some(""),
        Some("127.0.0.1"),
        Some("127.0.0.1:8300"),
        Some("evil.example:8302"),
        Some("127.0.0.1:8302.evil.example"),
        Some("0.0.0.0:8302"),
    ] {
        assert!(!site.host_allowed(bad), "{bad:?}");
    }
}

#[test]
fn listening_on_the_lan_also_takes_ip_hosts_with_this_port_but_never_names() {
    let any = listening(8300, "0.0.0.0");
    for good in [
        "192.168.1.20:8300",
        "10.0.0.5:8300",
        "127.0.0.1:8300",
        "localhost:8300",
        "[fe80::1]:8300",
    ] {
        assert!(any.host_allowed(Some(good)), "{good}");
    }
    for bad in [
        Some("192.168.1.20:8301"),
        Some("192.168.1.20"),
        Some("my-laptop:8300"),
        Some("evil.example:8300"),
        Some("192.168.1.20:8300.evil.example"),
        None,
    ] {
        assert!(!any.host_allowed(bad), "{bad:?}");
    }
    // 听某一个地址的只认它（和本机的三种写法）
    let one = listening(8300, "192.168.1.20");
    assert!(one.host_allowed(Some("192.168.1.20:8300")));
    assert!(!one.host_allowed(Some("10.0.0.5:8300")));
    // 只听本机的：照旧只有三种写法
    assert!(!site(8300).host_allowed(Some("192.168.1.20:8300")));
}

#[test]
fn the_origin_must_be_a_known_host_and_on_the_lan_the_same_as_the_host() {
    let any = listening(8300, "0.0.0.0");
    assert!(any.origin_allowed("127.0.0.1:8300", Some("127.0.0.1:8300")));
    assert!(any.origin_allowed("192.168.1.20:8300", Some("192.168.1.20:8300")));
    assert!(
        !any.origin_allowed("192.168.1.20:8300", Some("10.0.0.5:8300")),
        "和 Host 不一样"
    );
    assert!(!any.origin_allowed("evil.example:8300", Some("evil.example:8300")));
    assert!(!site(8300).origin_allowed("192.168.1.20:8300", Some("192.168.1.20:8300")));
}

#[test]
fn only_connections_from_other_machines_are_remote() {
    let at = |text: &str| text.parse::<std::net::SocketAddr>().expect("是地址");
    assert_eq!(crate::remote(at("127.0.0.1:5000")), None);
    assert_eq!(crate::remote(at("[::1]:5000")), None);
    assert_eq!(
        crate::remote(at("[::ffff:127.0.0.1]:5000")),
        None,
        "映射进 IPv6 的回环也是本机"
    );
    assert_eq!(
        crate::remote(at("192.168.1.30:5000")),
        Some("192.168.1.30".parse().unwrap())
    );
    assert_eq!(
        crate::remote(at("[::ffff:192.168.1.30]:5000")),
        Some("192.168.1.30".parse().unwrap())
    );
}

#[test]
fn the_type_comes_from_the_extension_and_is_never_guessed() {
    let types = BTreeMap::from([
        ("html".to_string(), "text/html; charset=utf-8".to_string()),
        (
            "js".to_string(),
            "text/javascript; charset=utf-8".to_string(),
        ),
    ]);
    assert_eq!(
        type_of(&types, Path::new("a/index.html")),
        "text/html; charset=utf-8"
    );
    assert_eq!(
        type_of(&types, Path::new("APP.JS")),
        "text/javascript; charset=utf-8"
    );
    for unknown in ["style.css", "README", "x.html.bak", ".js"] {
        assert_eq!(
            type_of(&types, Path::new(unknown)),
            "application/octet-stream",
            "{unknown}"
        );
    }
}

#[test]
fn paths_that_leave_or_cannot_be_read_find_nothing() {
    let dir = std::env::temp_dir().join(format!("miyu-webserve-pages-{}", std::process::id()));
    let pages = dir.join("pages");
    std::fs::create_dir_all(pages.join("sub")).expect("建得了");
    std::fs::write(pages.join("index.html"), "i").expect("写得进");
    std::fs::write(pages.join("sub/a b.js"), "a").expect("写得进");
    std::fs::write(dir.join("secret.txt"), "s").expect("写得进");
    let real = |relative: &str| std::fs::canonicalize(pages.join(relative)).ok();
    assert_eq!(find(&pages, "/"), real("index.html"));
    assert_eq!(find(&pages, "/sub/a%20b.js"), real("sub/a b.js"));
    for bad in [
        "/../secret.txt",
        "/%2e%2e/secret.txt",
        "/sub/../index.html",
        "/./index.html",
        "/sub//a%20b.js",
        "/sub\\..\\index.html",
        "/sub%5c..%5cindex.html",
        "/%zz",
        "/%e4",
        "/index.html%00",
        "/sub",
        "/nope",
    ] {
        assert_eq!(find(&pages, bad), None, "{bad}");
    }
    if std::fs::remove_dir_all(&dir).is_err() {
        // 删不掉就留在临时目录里，不影响测试。
    }
}
