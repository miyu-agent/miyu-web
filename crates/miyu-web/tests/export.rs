//! `/export`（导出原始包，核心 SE-1 中（f8f8a9bae），设计 58，W-1098）：带登录令牌、页面自己发的才导；网页软件照本机令牌叫核心写到
//! `<temp>/miyu-webui-<pid>/`，回一张一次性的下载票据，给完删文件、票据作废；没人取的到点删；起来时清上回剩下的。
//! 核心是替身：登录令牌照 `fake::LOGIN` 认，本机令牌也认；`session.export` 照给的路径写 [`BUNDLE`]，`missing` 回 `session_not_found`。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use miyu_ipc::Listener;
use miyu_web::serve::Serve;

use crate::fake::LOGIN;
use crate::support::*;

/// 替身写的包：不是真的 ZIP，字节一样就行。
const BUNDLE: &[u8] = b"PK\x03\x04 miyu bundle \x00\xff bytes";

/// 会话编号。
const SESSION: &str = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

/// 替身收到的 `session.export`：参数、那条连接是不是出示本机令牌握的手、有没有先说 `connection.remote`。
#[derive(Debug, Clone)]
struct Asked {
    params: Value,
    local: bool,
    remote: bool,
}

/// 起核心的替身，交回它收到的 `session.export`。
fn answer(mut core: Listener) -> Arc<Mutex<Vec<Asked>>> {
    let asked = Arc::new(Mutex::new(Vec::new()));
    let seen = Arc::clone(&asked);
    tokio::spawn(async move {
        while let Ok(connection) = core.accept().await {
            let seen = Arc::clone(&seen);
            tokio::spawn(async move {
                let (read, mut write) = tokio::io::split(connection);
                let mut lines = BufReader::new(read);
                let mut line = String::new();
                let (mut local, mut remote) = (false, false);
                while lines.read_line(&mut line).await.is_ok_and(|read| read > 0) {
                    let request: Value = serde_json::from_str(&line).expect("是 JSON");
                    line.clear();
                    let params = &request["params"];
                    let reply = match request["method"].as_str() {
                        Some("connection.remote") => {
                            remote = true;
                            continue;
                        }
                        Some("hello") if params["token"].is_string() => {
                            local = true;
                            Ok(json!({"language": "zh", "protocol": 1}))
                        }
                        Some("hello") if params["login"] == json!(LOGIN) => {
                            Ok(json!({"protocol": 1}))
                        }
                        Some("hello") => Err(("bad_login", "登录已失效。")),
                        Some("session.export") => {
                            seen.lock().expect("锁得上").push(Asked {
                                params: params.clone(),
                                local,
                                remote,
                            });
                            write_bundle(params)
                        }
                        _ => Ok(json!({})),
                    };
                    let reply = match reply {
                        Ok(result) => {
                            json!({"jsonrpc": "2.0", "id": request["id"], "result": result})
                        }
                        Err((reason, message)) => json!({"jsonrpc": "2.0", "id": request["id"],
                            "error": {"code": -32000, "message": message, "data": {"reason": reason}}}),
                    };
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
    asked
}

/// 替身照真核心的规矩写包：没有的会话拒，已经有的文件不覆盖。
fn write_bundle(params: &Value) -> Result<Value, (&'static str, &'static str)> {
    if params["session"] == json!("missing")
        || params["session"] == json!("00000000-0000-0000-0000-000000000000")
    {
        return Err(("session_not_found", "没有这个会话。"));
    }
    let path = PathBuf::from(params["to"]["path"].as_str().expect("有路径"));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| ("export_exists", "文件已存在。"))?;
    std::io::Write::write_all(&mut file, BUNDLE).expect("写得进");
    Ok(
        json!({"path": path, "bytes": BUNDLE.len(), "upto": 7, "sessions": [params["session"]], "blobs": 0}),
    )
}

/// 页面自己发的头（Host 是 `127.0.0.1:<端口>`）另带 `extra`。
fn page(port: u16, extra: &[(&'static str, &'static str)]) -> Vec<(String, String)> {
    let mut lines = vec![
        ("Origin".to_string(), format!("http://127.0.0.1:{port}")),
        ("Authorization".to_string(), format!("Bearer {LOGIN}")),
        ("Content-Type".to_string(), "application/json".to_string()),
    ];
    for (name, value) in extra {
        lines.retain(|(key, _)| !key.eq_ignore_ascii_case(name));
        if !value.is_empty() {
            lines.push((name.to_string(), value.to_string()));
        }
    }
    lines
}

/// `POST /export`，头照 `lines`，正文 `body`：交回状态码、回应的 JSON（没有正文的是 `null`）。
async fn ask(port: u16, lines: &[(String, String)], body: &Value) -> (u16, Value) {
    let extra: Vec<(&str, &str)> = lines
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let host = format!("127.0.0.1:{port}");
    let answer = send(
        port,
        "POST",
        "/export",
        &host,
        &extra,
        body.to_string().as_bytes(),
    )
    .await;
    (
        answer.status,
        serde_json::from_slice(&answer.body).unwrap_or(Value::Null),
    )
}

/// `GET <url>`。
async fn fetch(port: u16, url: &str) -> Answer {
    request(port, "GET", url, &format!("127.0.0.1:{port}"), &[]).await
}

/// 网页软件自己的子目录。
fn own_dir(home: &Home) -> PathBuf {
    home.dir.join("tmp").join(format!(
        "{}{}",
        miyu_web::export::PREFIX,
        std::process::id()
    ))
}

/// 目录里有几样（没有这个目录的是 0）。
fn count(dir: &Path) -> usize {
    std::fs::read_dir(dir).map_or(0, Iterator::count)
}

/// 等到 `done` 成真，最多十秒。
async fn until(what: &str, done: impl Fn() -> bool) {
    within(what, async {
        while !done() {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await;
}

/// 起一个 `serve`：导出的没人取的过 `idle` 删，空闲 `quiet` 秒退出。
async fn start_exports(
    home: &Home,
    idle: Duration,
    quiet: u64,
) -> (u16, tokio::task::JoinHandle<Result<(), String>>) {
    let serve = Serve {
        root: home.root.clone(),
        port: 0,
        fallback: false,
        configured: None,
        follow: false,
        pages: home.pages.clone(),
        settings: settings(quiet),
        core: no_core(),
        temp: home.dir.join("tmp"),
        export_idle: idle,
    };
    let (_, port, running) = launch(home, serve).await;
    (port, running)
}

#[tokio::test]
async fn without_a_login_it_is_401() {
    let home = Home::new();
    let asked = answer(fake_core(&home));
    let (_, port, _serving) = start(&home, 0, 600).await;
    let body = json!({"session": SESSION});
    assert_eq!(
        ask(port, &page(port, &[("Authorization", "")]), &body)
            .await
            .0,
        401,
        "没带"
    );
    assert_eq!(
        ask(
            port,
            &page(port, &[("Authorization", "Bearer nope")]),
            &body
        )
        .await
        .0,
        401,
        "作废了"
    );
    assert_eq!(
        ask(port, &page(port, &[]), &json!({"session": "../etc"}))
            .await
            .0,
        400,
        "编号的写法不对"
    );
    assert_eq!(
        ask(port, &page(port, &[]), &json!({})).await.0,
        400,
        "没写会话"
    );
    assert!(asked.lock().expect("锁得上").is_empty(), "没叫核心导");
}

#[tokio::test]
async fn other_sites_cannot_trigger_it() {
    let home = Home::new();
    let asked = answer(fake_core(&home));
    let (_, port, _serving) = start(&home, 0, 600).await;
    let body = json!({"session": SESSION});
    for (what, origin) in [
        ("别的网站", "http://evil.example"),
        ("null", "null"),
        ("和 Host 不是逐字一样", "http://localhost:0"),
        ("https", "https://127.0.0.1:1"),
        ("没有 Origin", ""),
    ] {
        let (status, reply) = ask(port, &page(port, &[("Origin", origin)]), &body).await;
        assert_eq!(status, 403, "{what}");
        assert_eq!(reply, Value::Null, "不说为什么：{what}");
    }
    let wrong = request(port, "GET", "/export", &format!("127.0.0.1:{port}"), &[]).await;
    assert_eq!(wrong.status, 405, "换票据只认 POST");
    let wrong = request(
        port,
        "PUT",
        "/export/abc",
        &format!("127.0.0.1:{port}"),
        &[],
    )
    .await;
    assert_eq!(wrong.status, 405, "取只认 GET");
    assert!(asked.lock().expect("锁得上").is_empty(), "没叫核心导");
}

#[tokio::test]
async fn the_bundle_is_handed_over_once_and_removed() {
    let home = Home::new();
    let asked = answer(fake_core(&home));
    let (_, port, _serving) = start(&home, 0, 600).await;
    let dir = own_dir(&home);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&dir)
            .expect("起来就建了")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o700, "只给本人");
    }
    let (status, reply) = ask(
        port,
        &page(port, &[]),
        &json!({"session": SESSION, "name": "修 bug"}),
    )
    .await;
    assert_eq!(status, 200, "{reply}");
    assert_eq!(reply["bytes"], json!(BUNDLE.len()));
    let url = reply["url"].as_str().expect("有地址").to_string();
    assert!(
        url.starts_with("/export/") && url.len() == "/export/".len() + 64,
        "{url}"
    );
    // 网页软件自己的本机连接导的，写到自己的子目录里、随机的名字
    let got = asked.lock().expect("锁得上").clone();
    assert_eq!(got.len(), 1);
    assert!(got[0].local && !got[0].remote, "{got:?}");
    assert_eq!(got[0].params["format"], json!("bundle"));
    assert_eq!(got[0].params["session"], json!(SESSION));
    let path = PathBuf::from(got[0].params["to"]["path"].as_str().expect("有路径"));
    assert!(path.is_absolute());
    assert_eq!(path.parent(), Some(dir.as_path()));
    assert!(path.extension().is_some_and(|ext| ext == "zip"));
    assert!(path.exists());
    assert!(
        !url.contains(path.file_stem().and_then(|s| s.to_str()).expect("有名字")),
        "票据不是文件名"
    );

    let answer = fetch(port, &url).await;
    assert_eq!(answer.status, 200);
    assert_eq!(answer.body, BUNDLE, "一个字节不差");
    assert_eq!(answer.header("content-type"), Some("application/zip"));
    assert_eq!(
        answer.header("content-length"),
        Some(BUNDLE.len().to_string().as_str())
    );
    assert_eq!(
        answer.header("content-disposition"),
        Some("attachment; filename=\"_ bug.zip\"; filename*=UTF-8''%E4%BF%AE%20bug.zip")
    );
    assert_eq!(answer.header("cache-control"), Some("no-store"));
    assert_eq!(answer.header("x-content-type-options"), Some("nosniff"));
    assert_eq!(answer.header("set-cookie"), None);
    until("给完删掉文件", || !path.exists()).await;
    assert_eq!(fetch(port, &url).await.status, 404, "一次性的");
    assert_eq!(fetch(port, "/export/").await.status, 404);

    // 没写名字的照会话编号叫
    let (_, reply) = ask(port, &page(port, &[]), &json!({"session": SESSION})).await;
    let answer = fetch(port, reply["url"].as_str().expect("有地址")).await;
    let name = format!("miyu-{SESSION}.zip");
    assert!(
        answer
            .header("content-disposition")
            .is_some_and(|value| value.contains(&format!("filename=\"{name}\"")))
    );
}

#[tokio::test]
async fn refusals_say_the_core_reason_and_leave_nothing() {
    let home = Home::new();
    answer(fake_core(&home));
    let (_, port, _serving) = start(&home, 0, 600).await;
    let (status, reply) = ask(
        port,
        &page(port, &[]),
        &json!({"session": "00000000-0000-0000-0000-000000000000"}),
    )
    .await;
    assert_eq!(status, 404);
    assert_eq!(reply["reason"], json!("session_not_found"));
    assert_eq!(reply["error"], json!("没有这个会话。"));
    assert_eq!(count(&own_dir(&home)), 0, "什么都没留下");
}

#[tokio::test]
async fn lan_pages_can_export_but_the_core_is_asked_locally() {
    let home = Home::new();
    let asked = answer(fake_core(&home));
    let (_, port, _serving) = start(&home, 0, 600).await;
    // 同机的反向代理转进来的算远程（局域网来的同样）：凭登录令牌照样导，导的那条连接是网页软件自己的本机连接
    let (status, reply) = ask(
        port,
        &page(port, &[("X-Forwarded-For", "100.64.0.7")]),
        &json!({"session": SESSION}),
    )
    .await;
    assert_eq!(status, 200, "{reply}");
    let got = asked.lock().expect("锁得上").clone();
    assert!(got[0].local && !got[0].remote, "{got:?}");
    assert_eq!(
        fetch(port, reply["url"].as_str().expect("有地址"))
            .await
            .body,
        BUNDLE
    );
}

#[tokio::test]
async fn unclaimed_bundles_are_removed_in_time() {
    let home = Home::new();
    answer(fake_core(&home));
    let (port, _serving) = start_exports(&home, Duration::from_secs(1), 600).await;
    let (status, reply) = ask(port, &page(port, &[]), &json!({"session": SESSION})).await;
    assert_eq!(status, 200);
    let dir = own_dir(&home);
    assert_eq!(count(&dir), 1);
    // 不定时醒：照到点的那一刻醒来删
    until("没人取的到点删掉", || count(&dir) == 0).await;
    assert_eq!(
        fetch(port, reply["url"].as_str().expect("有地址"))
            .await
            .status,
        404
    );
}

#[tokio::test]
async fn leaving_removes_the_own_dir() {
    let home = Home::new();
    answer(fake_core(&home));
    let (port, running) = start_exports(&home, Duration::from_secs(600), 1).await;
    let (status, _) = ask(port, &page(port, &[]), &json!({"session": SESSION})).await;
    assert_eq!(status, 200);
    within("空闲到点退出", running)
        .await
        .expect("跑完了")
        .expect("正常走");
    assert!(!own_dir(&home).exists(), "没取的连子目录一起删");
}

#[tokio::test]
async fn starting_cleans_up_what_was_left() {
    let home = Home::new();
    let tmp = home.dir.join("tmp");
    let make = |name: &str, file: &str, old: bool| {
        let dir = tmp.join(name);
        std::fs::create_dir_all(&dir).expect("建得了");
        let path = dir.join(file);
        std::fs::write(&path, b"x").expect("写得进");
        if old {
            let file = std::fs::File::options()
                .write(true)
                .open(&path)
                .expect("开得了");
            file.set_modified(SystemTime::now() - Duration::from_secs(3600))
                .expect("改得了");
        }
        path
    };
    // 别的进程号、放久了的：删，删空了连目录删
    let stale = make("miyu-webui-999999999", "a.zip", true);
    // 别的进程号、刚放的（可能是别的数据根上正在跑的）：留着
    let fresh = make("miyu-webui-999999998", "b.zip", false);
    let mixed_old = make("miyu-webui-999999997", "c.zip", true);
    let mixed_new = make("miyu-webui-999999997", "d.zip", false);
    // 和自己同一个进程号的（上回的进程号重用了）：整个删掉，重新建
    let reused = make(
        &format!("miyu-webui-{}", std::process::id()),
        "e.zip",
        false,
    );
    // 名字写法不对的、别的：不碰
    let odd = make("miyu-webui-abc", "f.zip", true);
    let other = make("something-else", "g.zip", true);
    answer(fake_core(&home));
    let (_port, _serving) = start_exports(&home, Duration::from_secs(600), 600).await;
    assert!(!stale.exists() && !stale.parent().expect("有上级").exists());
    assert!(fresh.exists());
    assert!(!mixed_old.exists() && mixed_new.exists());
    assert!(
        !reused.exists() && own_dir(&home).exists(),
        "自己的重新建了"
    );
    assert_eq!(count(&own_dir(&home)), 0);
    assert!(odd.exists() && other.exists());
}
