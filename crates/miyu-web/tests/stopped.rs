//! 人停的核心（核心 CS-5，`connection.md`「头怎么拉起核心」；`web.md`「连核心」第 1 条）：页面断线以后自己重连（`/ws?again=1`）的，
//! 核心是人停的（数据根 `run/stopped`）不拉起，回 `web.error` 带 `reason: "stopped_by_user"`；页面刚打开、点了「启动」的（不带
//! `again`）照旧去拉；没有记号的（崩了、空闲退出）自己重连也照旧去拉。开着的页面取文件（`/media`）也是页面自己发的，人停的不拉。
//! 核心命令数着自己被叫了几次（去拉了才叫它），叫到的是拉不起来的程序。

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::net::TcpStream;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{WebSocketStream, client_async};

use miyu_web::serve::Serve;

use crate::fake::LOGIN;
use crate::support::*;

/// 起一个 `serve`，核心命令数着去拉了几次；`stopped` 的先留下「人停的」记号。交回端口、数、跑着的任务。
async fn counted(
    home: &Home,
    stopped: bool,
) -> (u16, Arc<AtomicUsize>, JoinHandle<Result<(), String>>) {
    if stopped {
        std::fs::write(home.root.run().join("stopped"), b"").expect("写得进记号");
    }
    let launched = Arc::new(AtomicUsize::new(0));
    let count = Arc::clone(&launched);
    let serve = Serve {
        root: home.root.clone(),
        port: 0,
        fallback: false,
        configured: None,
        follow: false,
        pages: home.pages.clone(),
        settings: settings(600),
        core: Arc::new(move || {
            count.fetch_add(1, Ordering::SeqCst);
            std::process::Command::new("/nonexistent/miyu-core-for-tests")
        }),
        temp: home.dir.join("tmp"),
        export_idle: miyu_web::export::IDLE,
    };
    let (_, port, serving) = launch(home, serve).await;
    (port, launched, serving)
}

/// 照浏览器的样子连 `/ws<query>`、说一句握手，交回推来的那一条 `web.error` 的 `params`。
async fn told(port: u16, query: &str) -> serde_json::Value {
    let mut request = format!("ws://127.0.0.1:{port}/ws{query}")
        .into_client_request()
        .expect("合写法");
    request.headers_mut().insert(
        "Origin",
        format!("http://127.0.0.1:{port}").parse().expect("合写法"),
    );
    let stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("连得上");
    let (mut ws, _): (WebSocketStream<TcpStream>, _) =
        client_async(request, stream).await.expect("接了");
    ws.send(Message::text("{}")).await.expect("发得出");
    loop {
        match within("推来的那一条", ws.next()).await {
            Some(Ok(Message::Text(text))) => {
                let notice: serde_json::Value =
                    serde_json::from_str(text.as_str()).expect("是 JSON");
                assert_eq!(notice["method"], "web.error", "{notice}");
                return notice["params"].clone();
            }
            Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
            other => panic!("{other:?}"),
        }
    }
}

#[tokio::test]
async fn reconnecting_does_not_start_a_core_the_user_stopped() {
    let home = Home::new();
    let (port, launched, _serving) = counted(&home, true).await;
    let stopped = told(port, "?again=1").await;
    assert_eq!(stopped["reason"], "stopped_by_user", "{stopped}");
    assert!(stopped["message"].is_string());
    assert_eq!(launched.load(Ordering::SeqCst), 0, "人停的没去拉");
    // 页面刚打开、点了「启动」的：照旧去拉（这里的程序拉不起来）
    let asked = told(port, "").await;
    assert!(asked.get("reason").is_none(), "{asked}");
    assert_eq!(launched.load(Ordering::SeqCst), 1, "人要用的去拉了");
}

#[tokio::test]
async fn reconnecting_still_starts_a_core_that_was_not_stopped_by_the_user() {
    let home = Home::new();
    let (port, launched, _serving) = counted(&home, false).await;
    let crashed = told(port, "?again=1").await;
    assert!(crashed.get("reason").is_none(), "{crashed}");
    assert_eq!(launched.load(Ordering::SeqCst), 1, "没有记号的照旧去拉");
}

#[tokio::test]
async fn fetching_media_does_not_start_a_core_the_user_stopped() {
    let home = Home::new();
    let (port, launched, _serving) = counted(&home, true).await;
    let bearer = format!("Bearer {LOGIN}");
    let host = format!("127.0.0.1:{port}");
    let extra = [
        ("Content-Type", "application/json"),
        ("Authorization", bearer.as_str()),
    ];
    let body = json!({"blob": "sha256:small"}).to_string();
    let answer = send(port, "POST", "/media", &host, &extra, body.as_bytes()).await;
    assert_eq!(answer.status, 502);
    assert_eq!(launched.load(Ordering::SeqCst), 0, "人停的没去拉");
}
