//! `/ticket`（2026-11-03 项目主人：本机就不要凭证了，W-1089）：这台电脑上的页面自己发的（回环、不带代理的头、Host 是本机的写法、Origin
//! 和它逐字一样、带 `X-Miyu-Local: 1`、不是表单）照本机令牌问核心要一张交接票；别的一律 403；核心没在跑、要不到的 503；只认 `POST`。
//! 核心是替身（`open.rs` 那一个：`login.ticket` 照 `TICKET` 回，旧核心回空的）。

use serde_json::{Value, json};

use crate::open::{TICKET, answer, answer_with};
use crate::support::*;

/// 页面自己发的那几行头（端口 `port`），另带 `extra`；同名的照 `extra`，`extra` 里值是空的那一行去掉。
fn page(port: u16, extra: &[(&'static str, &str)]) -> Vec<(String, String)> {
    let mut lines = vec![
        ("Origin".to_string(), format!("http://127.0.0.1:{port}")),
        ("X-Miyu-Local".to_string(), "1".to_string()),
    ];
    for (name, value) in extra {
        lines.retain(|(key, _)| !key.eq_ignore_ascii_case(name));
        if !value.is_empty() {
            lines.push((name.to_string(), value.to_string()));
        }
    }
    lines
}

/// `POST /ticket`，Host 写 `host`，头照 `lines`：交回状态码、回应的 JSON（没有正文的是 `null`）和整个回应。
async fn ask(port: u16, host: &str, lines: &[(String, String)]) -> (u16, Value, Answer) {
    let extra: Vec<(&str, &str)> = lines
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let answer = request(port, "POST", "/ticket", host, &extra).await;
    let body = serde_json::from_slice(&answer.body).unwrap_or(Value::Null);
    (answer.status, body, answer)
}

#[tokio::test]
async fn the_page_on_this_computer_gets_a_ticket() {
    let home = Home::new();
    answer(fake_core(&home), false);
    let (_, port, _serving) = start(&home, 0, 600).await;
    let host = format!("127.0.0.1:{port}");
    let (status, body, answer) = ask(port, &host, &page(port, &[])).await;
    assert_eq!(status, 200);
    assert_eq!(body, json!({"ticket": TICKET}));
    assert_eq!(answer.header("content-type"), Some("application/json"));
    assert_eq!(answer.header("cache-control"), Some("no-store"));
    assert_eq!(answer.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(answer.header("referrer-policy"), Some("no-referrer"));
    assert_eq!(answer.header("set-cookie"), None);
    // `localhost`、`[::1]` 的写法也认；带 JSON 正文的类型也认
    let localhost = format!("localhost:{port}");
    let named = page(
        port,
        &[
            ("Origin", &format!("http://{localhost}")),
            ("Content-Type", "application/json"),
        ],
    );
    assert_eq!(ask(port, &localhost, &named).await.0, 200);
    let six = format!("[::1]:{port}");
    let named = page(port, &[("Origin", &format!("http://{six}"))]);
    assert_eq!(ask(port, &six, &named).await.0, 200);
}

#[tokio::test]
async fn anything_but_the_page_itself_is_refused() {
    let home = Home::new();
    answer(fake_core(&home), false);
    let (_, port, _serving) = start(&home, 0, 600).await;
    let host = format!("127.0.0.1:{port}");
    let refused = |what: &'static str| {
        move |(status, body, _): (u16, Value, Answer)| {
            assert_eq!(status, 403, "{what}");
            assert_eq!(body, Value::Null, "不说为什么：{what}");
        }
    };
    // 伪造的 Host：别的网站的域名解析到本机（DNS 重绑定）、局域网的 IP 写法、端口不对
    for forged in [
        format!("evil.example:{port}"),
        format!("192.168.1.20:{port}"),
        "127.0.0.1:1".to_string(),
    ] {
        let lines = page(port, &[("Origin", &format!("http://{forged}"))]);
        refused("伪造的 Host")(ask(port, &forged, &lines).await);
    }
    refused("Origin 不对")(
        ask(
            port,
            &host,
            &page(port, &[("Origin", "http://evil.example")]),
        )
        .await,
    );
    refused("Origin 是 null")(ask(port, &host, &page(port, &[("Origin", "null")])).await);
    let other = format!("http://localhost:{port}");
    refused("Origin 和 Host 不是逐字一样")(
        ask(port, &host, &page(port, &[("Origin", &other)])).await,
    );
    refused("没有 Origin")(ask(port, &host, &page(port, &[("Origin", "")])).await);
    refused("没有自定义头")(ask(port, &host, &page(port, &[("X-Miyu-Local", "")])).await);
    refused("自定义头不是 1")(
        ask(port, &host, &page(port, &[("X-Miyu-Local", "true")])).await,
    );
    for form in [
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
        "text/plain",
    ] {
        refused("表单的正文")(ask(port, &host, &page(port, &[("Content-Type", form)])).await);
    }
    // 同机的反向代理转进来的（发布前审计第三轮 R3S-2）：哪一种头都算远程
    for (name, value) in PROXIED {
        refused("反向代理转进来的")(ask(port, &host, &page(port, &[(name, value)])).await);
    }
    let get = request(
        port,
        "GET",
        "/ticket",
        &host,
        &[("Origin", &format!("http://{host}")), ("X-Miyu-Local", "1")],
    )
    .await;
    assert_eq!(get.status, 405, "只认 POST");
    // 拒了这么多回，对的那一种照样拿得到
    assert_eq!(ask(port, &host, &page(port, &[])).await.0, 200);
}

#[tokio::test]
async fn no_core_or_an_old_core_is_unavailable() {
    let home = Home::new();
    let (_, port, _serving) = start(&home, 0, 600).await;
    let host = format!("127.0.0.1:{port}");
    // 核心没在跑、拉不起来
    let (status, body, answer) = ask(port, &host, &page(port, &[])).await;
    assert_eq!(status, 503);
    assert!(body["error"].is_string(), "{body}");
    assert_eq!(body.get("ticket"), None);
    assert_eq!(answer.header("cache-control"), Some("no-store"));
    // 旧核心没有 `login.ticket`
    answer_with(fake_core(&home), false, false);
    let (status, body, _) = ask(port, &host, &page(port, &[])).await;
    assert_eq!(status, 503);
    assert!(body["error"].is_string(), "{body}");
}
