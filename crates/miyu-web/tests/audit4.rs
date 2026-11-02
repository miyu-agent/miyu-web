//! 发布前第四轮审查（2026-11-02）的防御性测试：写的时候是红的，W4-2（W-1059）、W4-3（W-1060）修好以后是绿的。
//!
//! 1. 关了局域网（`web.listen` 换回回环）以后，别的设备已经连着的 WebSocket 还一直转给核心：局域网关了，别的设备照样能用。
//! 2. 不带任何凭据的 `/wallpaper/events` 算「有人连着」，网页软件就一直不空闲退出：这台电脑上随便哪个程序、随便哪个网页都能让它一直开着。

use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio_tungstenite::client_async;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use crate::support::*;

/// 这台机器一个不是回环的地址（照往外的路由挑，不真发东西）；没有的是空的。
fn lan_address() -> Option<std::net::IpAddr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

/// 配置里的两项：`web.listen` 写 `listen`，端口写 0（不换端口）。
fn config(listen: &str) -> Value {
    json!({
        "web.listen": {"value": listen, "origin": {"layer": "system"}},
        "web.port": {"value": 0, "origin": {"layer": "system"}},
    })
}

/// 核心的替身：带编号的一律回（`hello` 回认了，`config.get` 照 `config` 回，别的回空）；订了配置推送的连接，交回的口子每叫一声推一条
/// 改了 `web.listen` 的 `config.changed`。不带编号的（`connection.remote`）不回。
fn core_with(home: &Home, config: Arc<Mutex<Value>>) -> Arc<tokio::sync::Notify> {
    let mut core = fake_core(home);
    let pushes = Arc::new(tokio::sync::Notify::new());
    let pusher = Arc::clone(&pushes);
    tokio::spawn(async move {
        while let Ok(connection) = core.accept().await {
            let (config, pushes) = (Arc::clone(&config), Arc::clone(&pusher));
            tokio::spawn(async move {
                let (read, write) = tokio::io::split(connection);
                let write = Arc::new(tokio::sync::Mutex::new(write));
                let mut lines = BufReader::new(read);
                let mut line = String::new();
                while lines.read_line(&mut line).await.is_ok_and(|read| read > 0) {
                    let request: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
                    line.clear();
                    if request["id"].is_null() {
                        continue;
                    }
                    let result = match request["method"].as_str() {
                        Some("hello") => {
                            json!({"account": "admin", "language": "zh", "protocol": 1})
                        }
                        Some("config.get") => {
                            json!({"items": config.lock().expect("没坏").clone()})
                        }
                        Some("subscribe") => {
                            let (write, pushes) = (Arc::clone(&write), Arc::clone(&pushes));
                            tokio::spawn(async move {
                                loop {
                                    pushes.notified().await;
                                    let push = json!({"jsonrpc": "2.0", "method": "config.changed", "params": {"keys": {"web.listen": {}}, "layer": "system", "via": "set"}});
                                    let mut write = write.lock().await;
                                    if write
                                        .write_all(format!("{push}\n").as_bytes())
                                        .await
                                        .is_err()
                                    {
                                        return;
                                    }
                                }
                            });
                            json!({})
                        }
                        _ => json!({}),
                    };
                    let reply = json!({"jsonrpc": "2.0", "id": request["id"], "result": result});
                    let mut write = write.lock().await;
                    if write
                        .write_all(format!("{reply}\n").as_bytes())
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            });
        }
    });
    pushes
}

#[tokio::test]
async fn turning_the_lan_off_closes_websockets_from_other_devices() {
    let Some(lan) = lan_address() else {
        eprintln!("这台机器没有局域网地址，跳过");
        return;
    };
    let home = Home::new();
    let wanted = Arc::new(Mutex::new(config(&lan.to_string())));
    let push = core_with(&home, Arc::clone(&wanted));
    // 跟着配置换监听：起来就换到局域网地址
    let (_, port, _serving) = start_configured(&home, 0, settings(600), false, Some(0), true).await;
    within("换到局域网地址", async {
        while tokio::net::TcpStream::connect((lan, port)).await.is_err() {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await;
    // 别的设备（局域网地址）连 /ws，握手，读到核心的回话：两头通了
    let mut request = format!("ws://{lan}:{port}/ws")
        .into_client_request()
        .expect("合写法");
    request.headers_mut().insert(
        "Origin",
        format!("http://{lan}:{port}").parse().expect("合写法"),
    );
    let socket = tokio::net::TcpSocket::new_v4().expect("建得了");
    socket.bind((lan, 0).into()).expect("绑得上");
    let stream = socket.connect((lan, port).into()).await.expect("连得上");
    let (mut ws, _) = client_async(request, stream).await.expect("接了");
    let hello =
        r#"{"id":"h","jsonrpc":"2.0","method":"hello","params":{"password":"x","protocol":[1,1]}}"#;
    ws.send(Message::text(hello)).await.expect("发得出");
    let answered = within("核心的回话", ws.next()).await;
    assert!(
        matches!(answered, Some(Ok(Message::Text(_)))),
        "{answered:?}"
    );
    // 主人在设置页关了局域网：推来改动，网页软件换回只听本机
    *wanted.lock().expect("没坏") = config("127.0.0.1");
    push.notify_one();
    within("不再听局域网地址", async {
        while tokio::net::TcpStream::connect((lan, port)).await.is_ok() {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await;
    // 别的设备那条还连着的，该跟着断（关了局域网，别的设备就不该还能用）
    let after = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match ws.next().await {
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                other => return other,
            }
        }
    })
    .await;
    assert!(
        matches!(after, Ok(None | Some(Ok(Message::Close(_)) | Err(_)))),
        "关了局域网 5 秒以后，别的设备连着的 WebSocket 还开着、照样转给核心（{after:?}）"
    );
}

#[tokio::test]
async fn an_unauthenticated_wallpaper_stream_does_not_keep_the_web_software_running() {
    let home = Home::new();
    // 空闲 1 秒就退
    let (_, port, serving) = start(&home, 0, 1).await;
    // 不带设备令牌开 /wallpaper/events，开着不关
    let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("连得上");
    let text = format!("GET /wallpaper/events HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n");
    stream.write_all(text.as_bytes()).await.expect("写得进");
    let mut head = [0u8; 12];
    within("回应的头", stream.read_exact(&mut head))
        .await
        .expect("读得到");
    assert_eq!(&head, b"HTTP/1.1 200", "没令牌也给开着");
    let exited = tokio::time::timeout(Duration::from_secs(5), serving).await;
    assert!(
        exited.is_ok(),
        "空闲 1 秒就该退，一条不带任何凭据的 /wallpaper/events 开着，5 秒以后网页软件还在跑"
    );
    drop(stream);
}
