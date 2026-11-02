//! 网页外观（核心 TH-1，`web-ui.md`「怎么走」第六条）：带登录令牌换票据（带网页外观的包才给），照票据一块块给网页目录里的
//! 文件；路径接在网页目录后面，走不出去；类型照表，响应头照页面的内容安全策略、同源（不放跨源）；票据只开它的包；令牌作废了
//! 票据一起作废；方法只认 POST、GET。

use std::sync::Arc;
use std::sync::atomic::Ordering;

use serde_json::{Value, json};

use crate::fake::{self, CHUNK, Core, LOGIN};
use crate::support::*;

const MANIFEST: &[u8] = br#"{"id": "look", "kind": "optional"}"#;
const SCRIPT: &[u8] = b"export function apply(ctx) {}";
/// 测试的设置里写的页面内容安全策略（`support::settings`）。
const CSP: &str = "default-src 'self'; connect-src 'self'; frame-ancestors 'none'";

/// 一个带网页外观的包 `look`（网页目录 `web`，包目录里另有一份 `package.toml`）、一个只有后台页的 `demo`、一个什么都没带的 `plain`。
fn looks() -> Core {
    Core::default()
        .theme("look", "web", "web/manifest.json", MANIFEST.to_vec())
        .theme("look", "web", "web/index.js", SCRIPT.to_vec())
        .theme("look", "web", "web/style.css", b"body{}".to_vec())
        .theme(
            "look",
            "web",
            "web/frames/a.png",
            vec![0x89, b'P', b'N', b'G'],
        )
        .theme("look", "web", "web/font.woff2", b"wOF2".to_vec())
        .theme("look", "web", "package.toml", b"[package]".to_vec())
        .page("demo", "index.html", b"demo".to_vec())
        .plain("plain")
}

async fn site(core: Core) -> (Home, Arc<Core>, u16) {
    let home = Home::new();
    let core = Arc::new(core);
    fake::serve(fake_core(&home), Arc::clone(&core));
    let (_, port, _serving) = start_with(&home, 0, settings(600)).await;
    (home, core, port)
}

fn host(port: u16) -> String {
    format!("127.0.0.1:{port}")
}

async fn post(port: u16, login: Option<&str>, body: &[u8]) -> Answer {
    let bearer = login.map(|login| format!("Bearer {login}"));
    let mut extra = vec![("Content-Type", "application/json")];
    if let Some(bearer) = &bearer {
        extra.push(("Authorization", bearer));
    }
    send(port, "POST", "/theme", &host(port), &extra, body).await
}

fn ask(package: &str) -> Vec<u8> {
    json!({ "package": package }).to_string().into_bytes()
}

/// 换到的地址：`/t/<64 位小写十六进制>/<包>/`。
fn url(answer: &Answer, package: &str) -> String {
    assert_eq!(
        answer.status,
        200,
        "{}",
        String::from_utf8_lossy(&answer.body)
    );
    let body: Value = serde_json::from_slice(&answer.body).expect("是 JSON");
    let url = body["url"].as_str().expect("有 url").to_string();
    let ticket = url
        .strip_prefix("/t/")
        .and_then(|rest| rest.strip_suffix(&format!("/{package}/")))
        .unwrap_or_else(|| panic!("地址的样子不对"));
    assert!(
        ticket.len() == 64
            && ticket
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
        "票据的样子不对"
    );
    url
}

async fn get(port: u16, path: &str) -> Answer {
    request(port, "GET", path, &host(port), &[]).await
}

#[tokio::test]
async fn a_theme_ticket_needs_a_login_and_a_web_theme() {
    let (_home, _core, port) = site(looks()).await;
    assert_eq!(post(port, None, &ask("look")).await.status, 401, "没带");
    assert_eq!(
        post(port, Some("bad"), &ask("look")).await.status,
        401,
        "带错了"
    );
    for bad in [
        &b"{}"[..],
        br#"{"package": "a b"}"#,
        br#"{"package": ""}"#,
        b"{oops",
    ] {
        assert_eq!(post(port, Some(LOGIN), bad).await.status, 400);
    }
    assert_eq!(
        post(port, Some(LOGIN), &ask("demo")).await.status,
        404,
        "只有后台页"
    );
    assert_eq!(
        post(port, Some(LOGIN), &ask("plain")).await.status,
        404,
        "没带外观"
    );
    assert_eq!(
        post(port, Some(LOGIN), &ask("nope")).await.status,
        404,
        "没有这个包"
    );
    let answer = post(port, Some(LOGIN), &ask("look")).await;
    let first = url(&answer, "look");
    assert_eq!(answer.header("content-type"), Some("application/json"));
    assert_eq!(answer.header("cache-control"), Some("no-store"));
    assert_eq!(answer.header("set-cookie"), None);
    assert_eq!(
        url(&post(port, Some(LOGIN), &ask("look")).await, "look"),
        first,
        "同一个令牌、同一个包交回同一张"
    );
    assert_eq!(get(port, "/theme").await.status, 405);
}

#[tokio::test]
async fn files_come_from_the_web_dir_with_page_headers() {
    let (_home, _core, port) = site(looks()).await;
    let base = url(&post(port, Some(LOGIN), &ask("look")).await, "look");
    let manifest = get(port, &format!("{base}manifest.json")).await;
    assert_eq!(manifest.status, 200);
    assert_eq!(manifest.body, MANIFEST, "照网页目录读：路径前面接上 web/");
    assert_eq!(
        manifest.header("content-type"),
        Some("application/octet-stream"),
        "测试的表里没有 json"
    );
    let script = get(port, &format!("{base}index.js")).await;
    assert_eq!(script.body, SCRIPT);
    assert_eq!(
        script.header("content-type"),
        Some("text/javascript; charset=utf-8")
    );
    assert_eq!(
        script.header("content-security-policy"),
        Some(CSP),
        "照页面的"
    );
    assert_eq!(script.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(script.header("referrer-policy"), Some("no-referrer"));
    assert_eq!(script.header("cache-control"), Some("no-cache"));
    assert_eq!(
        script.header("access-control-allow-origin"),
        None,
        "页面同源加载，不放跨源"
    );
    assert_eq!(script.header("set-cookie"), None);
    let css = get(port, &format!("{base}style.css")).await;
    assert_eq!(css.header("content-type"), Some("text/css; charset=utf-8"));
    let frame = get(port, &format!("{base}frames/a.png")).await;
    assert_eq!(frame.header("content-type"), Some("image/png"));
    assert_eq!(frame.body, [0x89, b'P', b'N', b'G']);
    assert_eq!(
        get(port, &format!("{base}font.woff2"))
            .await
            .header("content-type"),
        Some("application/octet-stream"),
        "表里没有的"
    );
    assert_eq!(
        get(port, &format!("{base}missing.css")).await.status,
        404,
        "核心 not_found"
    );
    assert_eq!(
        request(port, "POST", &format!("{base}index.js"), &host(port), &[])
            .await
            .status,
        405
    );
}

#[tokio::test]
async fn paths_stay_inside_the_web_dir() {
    let (_home, core, port) = site(looks()).await;
    let base = url(&post(port, Some(LOGIN), &ask("look")).await, "look");
    core.reads.lock().expect("没崩").clear();
    for bad in [
        "",
        "../package.toml",
        "%2e%2e/package.toml",
        "%2E%2E/package.toml",
        "frames/../../package.toml",
        "./index.js",
        "a//b",
        "frames/",
        "%2Fetc%2Fpasswd",
        "a%5Cb",
        "c:x",
    ] {
        let answer = get(port, &format!("{base}{bad}")).await;
        assert_eq!(answer.status, 400, "{bad}");
    }
    assert!(
        core.reads.lock().expect("没崩").is_empty(),
        "不收的路径不问核心"
    );
}

#[tokio::test]
async fn tickets_only_open_their_own_package() {
    let core = looks().theme("other", "skin", "skin/index.js", b"other".to_vec());
    let (_home, _core, port) = site(core).await;
    let base = url(&post(port, Some(LOGIN), &ask("look")).await, "look");
    let ticket = base.trim_start_matches("/t/").trim_end_matches("/look/");
    assert_eq!(
        get(port, &format!("/t/{ticket}/other/index.js"))
            .await
            .status,
        404,
        "票据是 look 的"
    );
    assert_eq!(
        get(port, &format!("/t/{}/look/index.js", "0".repeat(64)))
            .await
            .status,
        404,
        "不认识的票据"
    );
    assert_eq!(
        get(port, &format!("/t/{ticket}/bad%20name/index.js"))
            .await
            .status,
        404
    );
    let page = send(
        port,
        "POST",
        "/page",
        &host(port),
        &[("Authorization", &format!("Bearer {LOGIN}"))],
        &ask("demo"),
    )
    .await;
    let page: Value = serde_json::from_slice(&page.body).expect("是 JSON");
    let page = page["url"].as_str().expect("有 url");
    let page_ticket = page.trim_start_matches("/p/").trim_end_matches("/demo/");
    assert_eq!(
        get(port, &format!("/t/{page_ticket}/demo/index.html"))
            .await
            .status,
        404,
        "后台页的票据开不了外观"
    );
    assert_eq!(
        get(port, &format!("/p/{ticket}/look/")).await.status,
        404,
        "外观的票据开不了后台页"
    );
}

#[tokio::test]
async fn big_files_come_in_chunks() {
    let big: Vec<u8> = (0..(CHUNK * 2 + 7)).map(|at| (at % 253) as u8).collect();
    let (_home, core, port) =
        site(looks().theme("look", "web", "web/sprite.png", big.clone())).await;
    let base = url(&post(port, Some(LOGIN), &ask("look")).await, "look");
    core.reads.lock().expect("没崩").clear();
    let answer = get(port, &format!("{base}sprite.png")).await;
    assert_eq!(answer.status, 200);
    assert_eq!(
        answer.header("content-length"),
        Some(big.len().to_string().as_str())
    );
    assert!(answer.body == big, "一个字节不差");
    let offsets: Vec<u64> = core
        .reads
        .lock()
        .expect("没崩")
        .iter()
        .map(|(offset, _)| *offset)
        .collect();
    assert_eq!(offsets, [0, CHUNK as u64, 2 * CHUNK as u64], "一块一块问");
}

#[tokio::test]
async fn a_revoked_login_drops_its_theme_tickets() {
    let (_home, core, port) = site(looks()).await;
    let base = url(&post(port, Some(LOGIN), &ask("look")).await, "look");
    assert_eq!(get(port, &format!("{base}index.js")).await.status, 200);
    core.revoked.store(true, Ordering::SeqCst);
    assert_eq!(
        get(port, &format!("{base}index.js")).await.status,
        401,
        "握手被拒"
    );
    core.revoked.store(false, Ordering::SeqCst);
    assert_eq!(
        get(port, &format!("{base}index.js")).await.status,
        404,
        "这个令牌的票据一起作废了"
    );
}
