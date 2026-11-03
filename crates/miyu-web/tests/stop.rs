//! `miyu web --stop`、`/stop`（W-1091：托盘「停止」「退出」先停网页软件，免得开着的页面一重连又把核心拉起来）：叫停的照常收尾（删地址、
//! 删钥匙、放锁）；没在跑的照实说；钥匙不对、带 Origin、从别的机器来的、不是 `POST` 的不认，照旧跑着。

use crate::support::*;
use miyu_web::serve::{address, running, runtime};
use miyu_web::shutdown::{KEY, Stopped, stop};

/// 一种叫法：方法、另带的头、该回的状态码。
type Case<'a> = (&'a str, Vec<(&'a str, &'a str)>, u16);

/// 起着的那一个的钥匙。
fn key(home: &Home) -> String {
    std::fs::read_to_string(runtime(&home.root).join(KEY))
        .expect("写了钥匙")
        .trim()
        .to_string()
}

#[tokio::test]
async fn stop_ends_the_running_one_and_cleans_up() {
    let home = Home::new();
    let (_, port, serving) = start(&home, 0, 600).await;
    assert!(port > 0);
    assert_eq!(key(&home).len(), 64, "32 个随机字节");
    assert_eq!(within("停", stop(&home.root)).await, Stopped::Stopped);
    assert_eq!(within("收尾", serving).await.expect("没崩"), Ok(()));
    assert!(!running(&home.root), "放了锁");
    assert_eq!(address(&home.root), None, "删了地址");
    assert!(!exists(&runtime(&home.root).join(KEY)), "删了钥匙");
}

#[tokio::test]
async fn stop_says_nothing_was_running() {
    let home = Home::new();
    assert_eq!(stop(&home.root).await, Stopped::NotRunning);
}

#[tokio::test]
async fn wrong_key_origin_remote_or_method_are_refused() {
    let home = Home::new();
    let (_, port, serving) = start(&home, 0, 600).await;
    let host = format!("127.0.0.1:{port}");
    let key = key(&home);
    let origin = format!("http://{host}");
    let zeros = "0".repeat(64);
    let cases: [Case; 5] = [
        ("POST", vec![], 403),
        ("POST", vec![("X-Miyu-Stop", &zeros)], 403),
        (
            "POST",
            vec![("X-Miyu-Stop", &key), ("Origin", &origin)],
            403,
        ),
        ("POST", vec![("X-Miyu-Stop", &key), PROXIED[1]], 403),
        ("GET", vec![("X-Miyu-Stop", &key)], 405),
    ];
    for (method, lines, want) in cases {
        let answer = request(port, method, "/stop", &host, &lines).await;
        assert_eq!(answer.status, want, "{method} {lines:?}");
    }
    assert!(running(&home.root), "照旧跑着");
    assert!(!serving.is_finished());
    let answer = request(port, "POST", "/stop", &host, &[("X-Miyu-Stop", &key)]).await;
    assert_eq!(answer.status, 204, "钥匙对上了");
    assert_eq!(within("收尾", serving).await.expect("没崩"), Ok(()));
}
