//! `miyu web --stop`（W-1091）：停掉这个数据根上在跑的网页软件。2026-11-03 托盘 AP-2 在 Windows 虚拟机上测出来的：托盘「停止」「退出
//! Miyu」照 `miyu core stop` 停了核心，开着的页面一重连，网页软件就照 `connect_or_start` 把核心又拉了起来；托盘蓝图写的是「网页服务、
//! im 这些跟着停」，托盘先 `miyu web --stop`、再停核心。
//!
//! - `serve` 起来时在运行时目录写一把钥匙（[`KEY`]，32 个随机字节，Unix 上只给本人读），退出时删掉。
//! - `--stop` 不连核心（`open` 一上来就连，会把核心拉起来）：没在跑的说一句、退出码 0；在跑的读地址和钥匙，照回环 `POST /stop`、头
//!   `X-Miyu-Stop` 带钥匙；`serve` 照常收尾（删地址、删钥匙、放锁，运行日志 `stopped reason=stop`），`--stop` 等锁放掉（最多
//!   [`WAIT`]）再走。
//! - `/stop` 只认：对端是回环、不带反向代理的头、不带 Origin（浏览器发 `POST` 都带）、钥匙逐字对上；不是的一律 403，不说为什么。
//! - 不发信号、不结束进程：仓库不许 `unsafe`，Windows 上也没有能让它照常收尾的信号。

use std::fs::OpenOptions;
use std::io::Write;
use std::net::{IpAddr, Ipv4Addr};
use std::path::{Path, PathBuf};
use std::time::Duration;

use http_body_util::Empty;
use hyper::body::{Bytes, Incoming};
use hyper::{Method, Request, Response, StatusCode, header};
use hyper_util::rt::TokioIo;
use tokio::sync::oneshot;

use miyu_client::places::DataRoot;

use crate::TARGET;
use crate::serve::{Body, LOCK, Site, address, empty, running, runtime};
use crate::texts::Language;

/// 钥匙，在网页包的运行时目录里：一行，64 位小写十六进制。
pub const KEY: &str = "stop-key";

/// 带钥匙的头。
const KEY_HEADER: &str = "x-miyu-stop";

/// 叫停以后等锁放掉最多多久。
pub const WAIT: Duration = Duration::from_secs(10);

/// 停的结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Stopped {
    /// 本来就没在跑。
    NotRunning,
    /// 停了：锁放掉了。
    Stopped,
    /// 没停成：为什么（没有地址、没有钥匙的旧版、连不上、不认、到点还没停）。
    Failed(String),
}

/// `--stop`：停掉在跑的网页软件，结果照这台机器的语言印在 `err` 上，交回退出码（停了、本来没在跑的 0，没停成的 1）。
pub async fn command(root: &DataRoot, err: &mut dyn Write) -> u8 {
    let language = Language::of_locale(&miyu_client::open::locale());
    let (said, code) = match stop(root).await {
        Stopped::Stopped => (language.web_stopped(), 0),
        Stopped::NotRunning => (language.web_not_running(), 0),
        Stopped::Failed(reason) => (language.web_not_stopped(&reason), 1),
    };
    if writeln!(err, "{said}").is_err() {
        // 标准错误关了：照样交回退出码。
    }
    code
}

/// 停掉在跑的网页软件：叫停，再等锁放掉。
pub async fn stop(root: &DataRoot) -> Stopped {
    if !running(root) {
        return Stopped::NotRunning;
    }
    let run = runtime(root);
    let Some(port) = address(root).and_then(|url| {
        url.rsplit(':')
            .next()
            .and_then(|port| port.parse::<u16>().ok())
    }) else {
        return Stopped::Failed("no address".to_string());
    };
    let key = match std::fs::read_to_string(run.join(KEY)) {
        Ok(key) => key.trim().to_string(),
        Err(error) => return Stopped::Failed(format!("{KEY} not read: {error}")),
    };
    if let Err(reason) = ask(port, &key).await {
        return Stopped::Failed(reason);
    }
    released(run.join(LOCK)).await
}

/// 照回环 `POST /stop`：认了的、发出去以后连接断了的（收到就收尾退出，回应可能来不及发）是好的。
async fn ask(port: u16, key: &str) -> Result<(), String> {
    let stream = tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(|error| format!("port {port} not reached: {error}"))?;
    let (mut sender, connection) = hyper::client::conn::http1::handshake(TokioIo::new(stream))
        .await
        .map_err(|error| error.to_string())?;
    tokio::spawn(async move {
        if connection.await.is_err() {
            // 那头收尾退出了：照 `send_request` 的结果说。
        }
    });
    let request = Request::post("/stop")
        .header(header::HOST, format!("127.0.0.1:{port}"))
        .header(KEY_HEADER, key)
        .body(Empty::<Bytes>::new())
        .map_err(|error| error.to_string())?;
    match sender.send_request(request).await {
        Ok(response) if response.status() == StatusCode::NO_CONTENT => Ok(()),
        Ok(response) => Err(format!("refused: {}", response.status().as_u16())),
        Err(_) => Ok(()),
    }
}

/// 等锁放掉，最多 [`WAIT`]：另起一个线程拿锁（拿得到就是那一个退了），拿到了马上放。不用 `spawn_blocking`：到点了那个线程还卡着，
/// 运行时收尾时会一直等它。
async fn released(lock: PathBuf) -> Stopped {
    let (got, heard) = oneshot::channel();
    std::thread::spawn(move || {
        let locked = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock)
            .and_then(|file| file.lock());
        if got.send(locked.map_err(|error| error.to_string())).is_err() {
            // 等的那头到点走了。
        }
    });
    match tokio::time::timeout(WAIT, heard).await {
        Ok(Ok(Ok(()))) => Stopped::Stopped,
        Ok(Ok(Err(error))) => Stopped::Failed(format!("{LOCK} not locked: {error}")),
        Ok(Err(_)) => Stopped::Failed("lock waiter lost".to_string()),
        Err(_) => Stopped::Failed(format!("still running after {} s", WAIT.as_secs())),
    }
}

/// 起来时写钥匙（先写临时文件再改名，Unix 上只给本人读）：写不成的记一行、是空的（`--stop` 停不了它，空闲到点照样退）。
pub(crate) fn write_key(run: &Path) -> Option<String> {
    let Some(key) = crate::media::tickets::fresh() else {
        tracing::warn!(target: TARGET, "no random bytes for the stop key");
        return None;
    };
    let temp = run.join(format!("{KEY}.{}.tmp", std::process::id()));
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let written = options
        .open(&temp)
        .and_then(|mut file| writeln!(file, "{key}"))
        .and_then(|()| std::fs::rename(&temp, run.join(KEY)));
    match written {
        Ok(()) => Some(key),
        Err(error) => {
            tracing::warn!(target: TARGET, error = %error, "stop key not written");
            None
        }
    }
}

/// 退出时删钥匙：没有的不要紧。
pub(crate) fn remove_key(run: &Path) {
    if let Err(error) = std::fs::remove_file(run.join(KEY))
        && error.kind() != std::io::ErrorKind::NotFound
    {
        tracing::warn!(target: TARGET, error = %error, "stop key not removed");
    }
}

/// `POST /stop`：`remote` 是从别的机器来的那个地址，本机的是空的。认了的叫接连接的那一圈收尾，回 204。
pub(crate) fn post(
    request: &Request<Incoming>,
    site: &Site,
    remote: Option<IpAddr>,
) -> Response<Body> {
    if request.method() != Method::POST {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    let given = request
        .headers()
        .get(KEY_HEADER)
        .map(|value| value.as_bytes());
    let keyed = match (site.key.as_deref(), given) {
        (Some(key), Some(given)) => same(key.as_bytes(), given),
        _ => false,
    };
    if remote.is_some() || request.headers().contains_key(header::ORIGIN) || !keyed {
        tracing::warn!(target: TARGET, remote = remote.is_some(), "stop refused");
        return empty(StatusCode::FORBIDDEN);
    }
    site.stopping.notify_one();
    empty(StatusCode::NO_CONTENT)
}

/// 逐字一样，比完每一个字节（不照第一处不同就走，猜不出前几位对没对）。
fn same(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .fold(0u8, |differ, (a, b)| differ | (a ^ b))
            == 0
}

#[cfg(test)]
mod tests;
