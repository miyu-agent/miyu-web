//! `/listen`（`web-ui.md`「怎么走」第一条第 11 款，2026-10-30）：`GET` 回在听的；`POST` 要设备令牌、拿它连核心读配置，照配置换地址、端口，
//! 换不了的回 `error`、接着听原来的；听局域网时空闲到点不退。核心是替身：`hello` 认 `good` 这一个登录令牌，`config.get` 照给的配置回。

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::support::*;

/// 起核心的替身：`hello` 认登录令牌 `good`、本机令牌（`token`，网页软件自己跟配置用的）；`config.get` 照 `config`（`web.listen`、`web.port`
/// 两项的 `items`）回；订了配置推送的连接，交回的口子每叫一声推一条改了 `web.listen` 的 `config.changed`。
fn core_with(home: &Home, config: Arc<Mutex<Value>>) -> Arc<tokio::sync::Notify> {
    let mut core = fake_core(home);
    let pushes = Arc::new(tokio::sync::Notify::new());
    let pusher = Arc::clone(&pushes);
    tokio::spawn(async move {
        while let Ok(connection) = core.accept().await {
            let config = Arc::clone(&config);
            let pushes = Arc::clone(&pusher);
            tokio::spawn(async move {
                let (read, write) = tokio::io::split(connection);
                let write = Arc::new(tokio::sync::Mutex::new(write));
                let mut lines = BufReader::new(read);
                let mut line = String::new();
                while lines.read_line(&mut line).await.is_ok_and(|read| read > 0) {
                    let request: Value = serde_json::from_str(&line).expect("是 JSON");
                    let params = &request["params"];
                    let reply = match request["method"].as_str() {
                        Some("hello")
                            if params["login"] == json!("good") || params["token"].is_string() =>
                        {
                            json!({"result": {"account": "admin", "language": "zh", "protocol": 1}})
                        }
                        Some("hello") => {
                            json!({"error": {"code": -32001, "message": "登录已失效", "data": {"reason": "bad_login"}}})
                        }
                        Some("config.get") => {
                            let items = config.lock().expect("没坏").clone();
                            json!({"result": {"items": items}})
                        }
                        Some("subscribe") => {
                            let (write, pushes) = (Arc::clone(&write), Arc::clone(&pushes));
                            tokio::spawn(async move {
                                loop {
                                    pushes.notified().await;
                                    let push = json!({"jsonrpc": "2.0", "method": "config.changed", "params": {"keys": {"web.listen": {}}, "layer": "system", "via": "set"}});
                                    if write
                                        .lock()
                                        .await
                                        .write_all(format!("{push}\n").as_bytes())
                                        .await
                                        .is_err()
                                    {
                                        return;
                                    }
                                }
                            });
                            json!({"result": {}})
                        }
                        _ => json!({"result": {}}),
                    };
                    let mut reply = reply;
                    reply["jsonrpc"] = json!("2.0");
                    reply["id"] = request["id"].clone();
                    if write
                        .lock()
                        .await
                        .write_all(format!("{reply}\n").as_bytes())
                        .await
                        .is_err()
                    {
                        return;
                    }
                    line.clear();
                }
            });
        }
    });
    pushes
}

/// 配置里的两项：`web.listen` 写 `listen`，`web.port` 写 `port`（出处是系统配置）。
fn config(listen: &str, port: u16) -> Value {
    json!({
        "web.listen": {"value": listen, "origin": {"layer": "system"}},
        "web.port": {"value": port, "origin": {"layer": "system"}},
    })
}

/// `POST /listen`，带登录令牌 `login`：交回状态码和回应的 JSON（没有正文的是 `null`）。
async fn post(port: u16, login: Option<&str>) -> (u16, Value) {
    let host = format!("127.0.0.1:{port}");
    let bearer = login.map(|login| format!("Bearer {login}"));
    let extra: Vec<(&str, &str)> = bearer
        .as_deref()
        .map(|bearer| ("Authorization", bearer))
        .into_iter()
        .collect();
    let answer = request(port, "POST", "/listen", &host, &extra).await;
    let body = serde_json::from_slice(&answer.body).unwrap_or(Value::Null);
    (answer.status, body)
}

/// 这台机器一个不是回环的地址（照往外的路由挑，不真发东西）；没有的是空的。
fn lan_address() -> Option<std::net::IpAddr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

#[tokio::test]
async fn get_tells_what_is_listened_on() {
    let home = Home::new();
    let (_, port, _serving) = start(&home, 0, 600).await;
    let answer = request(port, "GET", "/listen", &format!("127.0.0.1:{port}"), &[]).await;
    assert_eq!(answer.status, 200);
    assert_eq!(answer.header("content-type"), Some("application/json"));
    let body: Value = serde_json::from_slice(&answer.body).expect("是 JSON");
    assert_eq!(
        body,
        json!({"listen": "127.0.0.1", "port": port, "lan": null})
    );
    let other = request(port, "GET", "/listen", "evil.example:80", &[]).await;
    assert_eq!(other.status, 403, "Host 照旧核对");
}

#[tokio::test]
async fn post_needs_a_login_and_a_core() {
    let home = Home::new();
    let (_, port, _serving) =
        start_configured(&home, 0, settings(600), false, Some(0), false).await;
    assert_eq!(post(port, None).await.0, 401, "不带设备令牌的不认");
    // 核心没在跑：回原因，接着听原来的
    let (status, body) = post(port, Some("good")).await;
    assert_eq!(status, 200);
    assert!(body["error"].is_string(), "{body}");
    assert_eq!(body["listen"], json!("127.0.0.1"));
    assert_eq!(body["port"], json!(port));
    // 核心不认这个令牌：401
    core_with(&home, Arc::new(Mutex::new(config("127.0.0.1", 0))));
    assert_eq!(post(port, Some("bad")).await.0, 401);
    // 配置没变：什么都不动
    let (status, body) = post(port, Some("good")).await;
    assert_eq!(status, 200);
    assert_eq!(
        body,
        json!({"listen": "127.0.0.1", "port": port, "lan": null})
    );
}

#[tokio::test]
async fn a_new_address_is_listened_on_at_once_and_the_idle_exit_waits() {
    let Some(lan) = lan_address() else {
        eprintln!("这台机器没有局域网地址，跳过");
        return;
    };
    let home = Home::new();
    // 空闲 1 秒就退：听了局域网就不退
    let wanted = Arc::new(Mutex::new(config(&lan.to_string(), 0)));
    let push = core_with(&home, Arc::clone(&wanted));
    let (_, port, serving) = start_configured(&home, 0, settings(1), false, Some(0), true).await;
    // 网页软件起来就跟着配置换到局域网地址；这时本机还连得上就等它换完
    within("换到局域网地址", async {
        while tokio::net::TcpStream::connect((lan, port)).await.is_err() {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await;
    let host = format!("{lan}:{port}");
    let (status, body) = send_to(lan, port, &host, "GET").await;
    assert_eq!(status, 200);
    assert_eq!(
        body,
        json!({"listen": lan.to_string(), "port": port, "lan": format!("http://{lan}:{port}")}),
        "端口不变，换了地址"
    );
    // 局域网来的 POST /listen 不认（第二轮审查 W2-1：它替请求连核心不说远程）
    assert_eq!(send_to(lan, port, &host, "POST").await.0, 403);
    tokio::time::sleep(Duration::from_millis(2500)).await;
    assert!(!serving.is_finished(), "听局域网的空闲到点不退");
    // 换回回环（推来改动）：照旧空闲退出
    *wanted.lock().expect("没坏") = config("127.0.0.1", 0);
    push.notify_one();
    within("空闲退出", serving)
        .await
        .expect("没崩")
        .expect("正常退");
}

/// 从 `ip` 连进来 `<method> /listen`（Host 写 `host`），带好的登录令牌：交回状态码和回应的 JSON（不是 JSON 的是 `null`）。
async fn send_to(ip: std::net::IpAddr, port: u16, host: &str, method: &str) -> (u16, Value) {
    let mut stream = tokio::net::TcpStream::connect((ip, port))
        .await
        .expect("连得上");
    let text = format!(
        "{method} /listen HTTP/1.1\r\nHost: {host}\r\nAuthorization: Bearer good\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(text.as_bytes()).await.expect("写得进");
    let mut bytes = Vec::new();
    tokio::io::AsyncReadExt::read_to_end(&mut stream, &mut bytes)
        .await
        .expect("读得到");
    let split = bytes
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("有头");
    let status = String::from_utf8_lossy(&bytes[..split])
        .split(' ')
        .nth(1)
        .and_then(|code| code.parse().ok())
        .expect("有状态码");
    (
        status,
        serde_json::from_slice(&bytes[split + 4..]).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn a_new_port_moves_the_address_file_and_lets_the_old_one_go() {
    let home = Home::new();
    let (_, old, _serving) = start_configured(&home, 0, settings(600), false, Some(0), false).await;
    let fresh = {
        let probe = std::net::TcpListener::bind("127.0.0.1:0").expect("听得上");
        probe.local_addr().expect("有地址").port()
    };
    core_with(&home, Arc::new(Mutex::new(config("127.0.0.1", fresh))));
    let (status, body) = post(old, Some("good")).await;
    assert_eq!(status, 200);
    assert_eq!(
        body,
        json!({"listen": "127.0.0.1", "port": fresh, "lan": null})
    );
    assert_eq!(
        miyu_web::serve::address(&home.root),
        Some(format!("http://127.0.0.1:{fresh}")),
        "run/web 照新端口写"
    );
    assert!(
        tokio::net::TcpStream::connect(("127.0.0.1", old))
            .await
            .is_err(),
        "旧端口放掉了"
    );
    let answer = request(fresh, "GET", "/listen", &format!("127.0.0.1:{fresh}"), &[]).await;
    assert_eq!(answer.status, 200, "新端口照新端口核对 Host");
    // 端口又写回起来时那个（这里是 0）以外的同一个：不动
    let (_, again) = post(fresh, Some("good")).await;
    assert_eq!(again["port"], json!(fresh));
}

#[tokio::test]
async fn a_port_given_on_the_command_line_stays() {
    let home = Home::new();
    // `--port` 起的（configured 是空的）：配置里的端口不管
    let (_, port, _serving) = start(&home, 0, 600).await;
    core_with(&home, Arc::new(Mutex::new(config("127.0.0.1", 1))));
    let (status, body) = post(port, Some("good")).await;
    assert_eq!(status, 200);
    assert_eq!(body["port"], json!(port), "{body}");
    assert!(body.get("error").is_none(), "{body}");
}

#[tokio::test]
async fn it_follows_the_core_without_any_page_asking() {
    let Some(lan) = lan_address() else {
        eprintln!("这台机器没有局域网地址，跳过");
        return;
    };
    let home = Home::new();
    // 核心先在跑、配置里已经写了局域网地址：起来以后读一遍就换过去
    let wanted = Arc::new(Mutex::new(config(&lan.to_string(), 0)));
    let push = core_with(&home, Arc::clone(&wanted));
    let (_, port, _serving) = start_configured(&home, 0, settings(600), false, Some(0), true).await;
    // 听的是这一个局域网地址：连得上它、回环连不上
    let open = |ip: std::net::IpAddr| async move {
        tokio::net::TcpStream::connect((ip, port)).await.is_ok()
    };
    let loopback = std::net::IpAddr::from([127, 0, 0, 1]);
    within("换到局域网地址", async {
        while !open(lan).await || open(loopback).await {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await;
    // 别处关了（设置页、miyu config set）：推来一条，当场换回回环
    *wanted.lock().expect("没坏") = config("127.0.0.1", 0);
    push.notify_one();
    within("换回回环", async {
        while !open(loopback).await {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await;
    assert!(
        tokio::net::TcpStream::connect((lan, port)).await.is_err(),
        "局域网地址不再听"
    );
}
