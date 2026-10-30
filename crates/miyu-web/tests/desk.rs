//! 这台电脑上的几样（`web-ui.md`「怎么走」第五条，2026-10-30）：`/reveal`、`/pick-dir`、`/wallpaper` 要设备令牌，不带的、核心不认的 401；
//! 只认 `GET`；`/wallpaper/events` 不要令牌、是一条事件流；对端不是回环的 403。不真开文件管理器、选目录框：只开不在的目录。

use std::sync::Arc;
use std::sync::atomic::Ordering;

use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::fake::{self, Core, LOGIN};
use crate::support::*;

/// 起网页软件和核心的替身。
async fn site() -> (Home, Arc<Core>, u16) {
    let home = Home::new();
    let core = Arc::new(Core::default());
    fake::serve(fake_core(&home), Arc::clone(&core));
    let (_, port, _serving) = start_with(&home, 0, settings(600)).await;
    (home, core, port)
}

fn bearer(login: &str) -> String {
    format!("Bearer {login}")
}

#[tokio::test]
async fn it_needs_a_login_the_core_knows() {
    let (_home, core, port) = site().await;
    let host = format!("127.0.0.1:{port}");
    for path in [
        "/reveal?path=%2Fnowhere%2Fat%2Fall",
        "/pick-dir?title=x",
        "/wallpaper?dark=0",
    ] {
        assert_eq!(
            request(port, "GET", path, &host, &[]).await.status,
            401,
            "{path} 不带令牌"
        );
        let wrong = bearer("nope");
        let answer = request(port, "GET", path, &host, &[("Authorization", &wrong)]).await;
        assert_eq!(answer.status, 401, "{path} 核心不认");
    }
    let good = bearer(LOGIN);
    let answer = request(port, "POST", "/reveal", &host, &[("Authorization", &good)]).await;
    assert_eq!(answer.status, 405, "只认 GET");
    // 认的令牌：上一层也不在的目录不开，回「不在」
    let answer = request(
        port,
        "GET",
        "/reveal?path=%2Fnowhere%2Fat%2Fall",
        &host,
        &[("Authorization", &good)],
    )
    .await;
    assert_eq!(answer.status, 200);
    assert_eq!(answer.header("cache-control"), Some("no-store"));
    assert_eq!(String::from_utf8_lossy(&answer.body), r#"{"missing":true}"#);
    assert!(core.hellos.load(Ordering::SeqCst) >= 1);
}

#[tokio::test]
async fn wallpaper_events_stream_without_a_login() {
    let (_home, _core, port) = site().await;
    let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("连得上");
    let text = format!("GET /wallpaper/events HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n");
    stream.write_all(text.as_bytes()).await.expect("写得进");
    let mut head = vec![0u8; 1024];
    let read = within("回头", stream.read(&mut head))
        .await
        .expect("读得到");
    let head = String::from_utf8_lossy(&head[..read]).to_lowercase();
    assert!(head.starts_with("http/1.1 200"), "{head}");
    assert!(head.contains("content-type: text/event-stream"), "{head}");
}
