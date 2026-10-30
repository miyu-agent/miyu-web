//! 发布前第二轮审查（2026-10-30）的防御性测试：现在是红的，修好了变绿。
//!
//! 1. 局域网来的 `/media` 换票据：网页软件替它连核心时也要先说 `connection.remote`，不然核心把它当本机的，
//!    `fs.read` 这类只给本机的方法（核心 `connection/reach.rs`）就放过去了。
//! 2. 请求头一直发不完的连接要有时限（hyper 没装计时器时 `header_read_timeout` 不生效）。

use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

use crate::support::*;

/// 这台机器一个不是回环的地址（照往外的路由挑，不真发东西）；没有的是空的。
fn lan_address() -> Option<std::net::IpAddr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

#[tokio::test]
async fn a_media_ticket_asked_from_another_device_reaches_the_core_as_remote() {
    let Some(lan) = lan_address() else {
        eprintln!("这台机器没有局域网地址，跳过");
        return;
    };
    let home = Home::new();
    let mut core = fake_core(&home);
    let mut settings = settings(600);
    settings.listen = lan;
    let (_, port, _serving) = start_with(&home, 0, settings).await;
    // 从局域网地址连进来，带设备令牌换一张本机文件的票据
    let body = r#"{"path":"/etc/hostname"}"#;
    let request = format!(
        "POST /media HTTP/1.1\r\nHost: {lan}:{port}\r\nAuthorization: Bearer some-device-login\r\n\
         Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let socket = tokio::net::TcpSocket::new_v4().expect("建得了");
    socket.bind((lan, 0).into()).expect("绑得上");
    let mut stream = socket.connect((lan, port).into()).await.expect("连得上");
    stream.write_all(request.as_bytes()).await.expect("写得进");
    let connection = within("核心接到连接", core.accept()).await.expect("接得到");
    let (read, _write) = tokio::io::split(connection);
    let mut lines = BufReader::new(read);
    let mut first = String::new();
    within("核心读到", lines.read_line(&mut first))
        .await
        .expect("读得到");
    let told: serde_json::Value = serde_json::from_str(&first).expect("是 JSON");
    assert_eq!(
        told["method"], "connection.remote",
        "局域网来的 /media 替它连核心时，握手以前要先说是远程的（不然 fs.read 照本机放行）；核心读到的第一行是：{first}"
    );
}

#[tokio::test]
async fn a_request_head_that_never_finishes_is_dropped() {
    let home = Home::new();
    let (_, port, _serving) = start(&home, 0, 600).await;
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("连得上");
    // 只写半截请求头，然后不动
    stream
        .write_all(format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n").as_bytes())
        .await
        .expect("写得进");
    let mut buffer = [0u8; 64];
    let closed = tokio::time::timeout(Duration::from_secs(45), stream.read(&mut buffer)).await;
    assert!(
        closed.is_ok(),
        "请求头 45 秒没发完的连接应当被关掉（一直挂着，开多了占满文件描述符）"
    );
}
