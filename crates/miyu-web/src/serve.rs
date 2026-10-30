//! `miyu-web serve`（`web-ui.md`「怎么走」第一条）：单实例、听 `web.listen`（默认 `127.0.0.1`，SU-1 起能听局域网）、写 `run/web` 和那一行、空闲退出；每个
//! 请求先核对 Host，`/ws` 交给 `miyu_webserve::ws`，`/media` 交给 `media`（施工 W-10），`/page`、`/p/` 交给
//! `backstage`（软件后台页，施工 F-6 下），别的当页面文件
//! （`miyu_webserve::pages`）。核对 Host、给页面、`/ws` 照转、回应的几样在共用的 `miyu-webserve`（施工 O-16，
//! `webserve.md`「搬家表」）。
//!
//! 1. 先拿 `run/web.lock`，拿不到写 `running` 走。
//! 2. 听 `web.listen` 的那个地址的端口（`run/web` 里照旧写 `http://127.0.0.1:<端口>`：本机开浏览器走回环）：被占了写 `error port <端口> in use`（`open` 认这个前缀，照人的语言说），别的起不来写 `error <原因>`。
//! 3. 地址写进 `run/web`（先写临时文件再改名），写一行 `ready`。
//! 4. 没有 WebSocket 连着、没有 `/media`、后台页在给，连续空闲到点就退出（听局域网的不退）；收到停的信号也退出。退出时先删 `run/web`、再放锁。
//! 5. `/listen` 请换地址、端口的（`listen`）：接连接的这一圈照它换监听，在听的地址、端口跟着换，端口换了重写 `run/web`。

use std::convert::Infallible;
use std::fs::{File, OpenOptions, TryLockError};
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use hyper::body::Incoming;
use hyper::header;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tokio::sync::{Notify, mpsc};

use miyu_client::connect::Ready;
use miyu_client::places::DataRoot;
use miyu_webserve::Site as _;

use crate::backstage::Backstage;
use crate::listen::{Swap, Swaps};
use crate::media::Media;
use crate::settings::Settings;
use crate::{TARGET, backstage, listen, media};

pub use miyu_client::CoreCommand;
pub(crate) use miyu_webserve::respond::{Body, empty, full, secure};

/// 单实例的锁，在 `run/` 里。
pub const LOCK: &str = "web.lock";

/// 网页的地址，在 `run/` 里：一行，`http://127.0.0.1:<端口>`。
pub const ADDRESS: &str = "web";

/// 起一个网页软件要的。
pub struct Serve {
    /// 数据根。
    pub root: DataRoot,
    /// 听哪个端口：`0` 是系统挑一个空的。
    pub port: u16,
    /// 被占了能不能往后挪：端口是出厂的才能（`web-ui.md`「怎么走」第一条第 1 款），照先后试后面 [`FALLBACK_PORTS`] 个。
    pub fallback: bool,
    /// 配置里的端口（`web.port` 的最终值）：`/listen` 照配置换监听时和它比，一样的不动端口（回退过的留着现在这个）；`--port` 起的是空的，
    /// 端口不随配置换（第一条第 11 款）。
    pub configured: Option<u16>,
    /// 页面目录。
    pub pages: PathBuf,
    /// `web.json`。
    pub settings: Settings,
    /// 核心没在跑时怎么拉起来。
    pub core: CoreCommand,
}

/// 跑着的这一个：各个连接共用。
pub(crate) struct Site {
    pub(crate) root: DataRoot,
    /// 在听的端口、地址（`/listen` 换了跟着换）。
    port: AtomicU16,
    listen: Mutex<IpAddr>,
    /// 现在的端口是照配置里哪个端口起的（[`Serve::configured`]）。
    wanted: Mutex<Option<u16>>,
    /// 请接连接的那一圈换监听。
    pub(crate) swaps: Swaps,
    pub(crate) pages: PathBuf,
    pub(crate) settings: Settings,
    pub(crate) core: CoreCommand,
    /// `/media` 的票据、连着的核心。
    pub(crate) media: Media,
    /// 软件后台页的票据（连着的核心用 `media` 那一份）。
    pub(crate) backstage: Backstage,
    /// 连着几个 WebSocket、几个 `/media`、后台页在给。
    active: AtomicUsize,
    /// 最后一个走的时候。
    quiet_since: Mutex<Instant>,
    /// 走了一个：叫醒接连接的那一圈，照新的情形算下一次几时醒。
    wake: Notify,
}

/// 连着的一个：数着，走的时候减掉、记下时刻。
pub(crate) struct Busy(Arc<Site>);

impl Drop for Busy {
    fn drop(&mut self) {
        *self
            .0
            .quiet_since
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Instant::now();
        self.0.active.fetch_sub(1, Ordering::AcqRel);
        self.0.wake.notify_one();
    }
}

impl Site {
    /// 数上一个。
    pub(crate) fn busy(self: &Arc<Site>) -> Busy {
        self.active.fetch_add(1, Ordering::AcqRel);
        Busy(Arc::clone(self))
    }

    /// 配置里的端口成了 `configured`：要换到哪个端口（不换的是空的：一样的、`--port` 起的、核心没说的）。
    pub(crate) fn port_for(&self, configured: Option<u16>) -> Option<u16> {
        let wanted = *self.wanted.lock().unwrap_or_else(PoisonError::into_inner);
        configured.filter(|port| wanted.is_some_and(|wanted| wanted != *port))
    }

    /// 照配置里的端口 `port` 换过去了：记下。
    pub(crate) fn wanted(&self, port: u16) {
        *self.wanted.lock().unwrap_or_else(PoisonError::into_inner) = Some(port);
    }

    /// 换了监听：记下在听的地址、端口，端口换了重写 `run/web`。
    fn listening(&self, at: SocketAddr) {
        *self.listen.lock().unwrap_or_else(PoisonError::into_inner) = at.ip();
        if self.port.swap(at.port(), Ordering::AcqRel) != at.port() {
            let url = format!("http://127.0.0.1:{}", at.port());
            if let Err(error) = write_address(&self.root.run(), &url) {
                tracing::warn!(target: TARGET, error = %error, "address not written");
            }
        }
        tracing::info!(target: TARGET, listen = %at.ip(), port = at.port(), "listening");
    }

    /// 照空闲 `idle` 算几时该退出；有连着的、不退的（`idle` 是空的）、听局域网的是空的。
    fn quiet_until(&self, idle: Option<Duration>) -> Option<Instant> {
        let idle = idle?;
        if !miyu_webserve::Site::listen(self).is_loopback() {
            return None;
        }
        if self.active.load(Ordering::Acquire) > 0 {
            return None;
        }
        Some(
            *self
                .quiet_since
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                + idle,
        )
    }
}

/// `/ws` 照它连核心、数忙；Host、Origin 照它的端口核对（`miyu_webserve::Site` 的两个默认方法）。
impl miyu_webserve::Site for Site {
    type Busy = Busy;

    fn root(&self) -> &DataRoot {
        &self.root
    }

    fn port(&self) -> u16 {
        self.port.load(Ordering::Acquire)
    }

    fn listen(&self) -> IpAddr {
        *self.listen.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn core(&self) -> &CoreCommand {
        &self.core
    }

    fn busy(self: &Arc<Self>) -> Busy {
        Site::busy(self)
    }
}

/// 出厂端口被占时往后试几个（2026-10-30 项目主人：固定端口配端口回退）：8300 被占试 8301 到 8309。
pub const FALLBACK_PORTS: u16 = 9;

/// 照先后要试的端口：`port` 本身；能回退的（`fallback`，`0` 不算）再接后面 [`FALLBACK_PORTS`] 个，到 65535 为止。
pub fn candidates(port: u16, fallback: bool) -> Vec<u16> {
    let more = match fallback && port != 0 {
        true => FALLBACK_PORTS,
        false => 0,
    };
    (0..=more)
        .filter_map(|step| port.checked_add(step))
        .collect()
}

/// 听端口：照 [`candidates`] 的先后，头一个绑得上的；都被占的说第一个被占（人认得的那个），别的错照原话。
pub(crate) async fn bind(listen: IpAddr, port: u16, fallback: bool) -> Result<TcpListener, String> {
    for one in candidates(port, fallback) {
        match TcpListener::bind((listen, one)).await {
            Ok(listener) => {
                if one != port {
                    tracing::info!(target: crate::TARGET, wanted = port, port = one, "port in use, fell back");
                }
                return Ok(listener);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Err(format!("port {port} in use"))
}

/// 跑起来，直到空闲到点、收到停的信号。`said` 交那一行：起来了、已经有一个在跑、起不来。
///
/// # Errors
///
/// 起不来（锁、端口、写 `run/web`）：原话已经交给了 `said`。
pub async fn run(serve: Serve, said: impl FnOnce(Ready)) -> Result<(), String> {
    let run = serve.root.run();
    let _lock = match lock(&run.join(LOCK)) {
        Ok(Some(lock)) => lock,
        Ok(None) => {
            said(Ready::Running);
            return Ok(());
        }
        Err(error) => {
            said(Ready::Failed(error.clone()));
            return Err(error);
        }
    };
    let listen = serve.settings.listen;
    let listener = match bind(listen, serve.port, serve.fallback).await {
        Ok(listener) => listener,
        Err(reason) => {
            said(Ready::Failed(reason.clone()));
            return Err(reason);
        }
    };
    let at = listener.local_addr().map_err(|error| error.to_string())?;
    let port = at.port();
    let url = format!("http://127.0.0.1:{port}");
    if let Err(error) = write_address(&run, &url) {
        said(Ready::Failed(error.clone()));
        return Err(error);
    }
    said(Ready::Ready);
    tracing::info!(target: TARGET, url = %url, listen = %listen, "listening");
    let media = Media::new(&serve.settings);
    let backstage = Backstage::new(&serve.settings);
    let (swaps, asked) = mpsc::channel(4);
    let site = Arc::new(Site {
        root: serve.root,
        port: AtomicU16::new(port),
        listen: Mutex::new(at.ip()),
        wanted: Mutex::new(serve.configured),
        swaps,
        pages: serve.pages,
        settings: serve.settings,
        core: serve.core,
        media,
        backstage,
        active: AtomicUsize::new(0),
        quiet_since: Mutex::new(Instant::now()),
        wake: Notify::new(),
    });
    let reason = accept(listener, asked, &site).await;
    remove_address(&run);
    tracing::info!(target: TARGET, reason, "stopped");
    Ok(())
}

/// 接连接，直到空闲到点、收到停的信号：交回为什么停。不定时醒（2026-10-15 设计 00「避免轮询」）：每一圈打扫一次，再睡到下一件到点的事
/// （空闲到点、核心连接到点该关）；没有到点的事就只等连接来、连着的走（`Busy` 走时叫醒）。票据换、找时也顺手丢过期的。`/listen` 请换
/// 监听的（`asked`）在这一圈换（`listen::swap`）：换了以后接新的那一个，已经连着的不断。
async fn accept(
    mut listener: TcpListener,
    mut asked: mpsc::Receiver<Swap>,
    site: &Arc<Site>,
) -> &'static str {
    let idle = site.settings.idle();
    let stop = stopped();
    tokio::pin!(stop);
    loop {
        let links = site.media.sweep();
        site.backstage.sweep();
        let quiet = site.quiet_until(idle);
        if quiet.is_some_and(|at| at <= Instant::now()) {
            return "idle";
        }
        let next = quiet.into_iter().chain(links).min();
        let swap = tokio::select! {
            accepted = listener.accept() => {
                if let Ok((stream, peer)) = accepted {
                    serve_one(stream, peer, site);
                }
                continue;
            }
            Some(swap) = asked.recv() => swap,
            () = site.wake.notified() => continue,
            () = until(next) => continue,
            () = &mut stop => return "signal",
        };
        let (kept, done) = listen::swap(listener, swap.listen, swap.port).await;
        let Some(kept) = kept else {
            if swap.done.send(done).is_err() {
                // 问的那头走了。
            }
            return "listener lost";
        };
        listener = kept;
        if done.is_ok()
            && let Ok(at) = listener.local_addr()
        {
            site.listening(at);
        }
        if swap.done.send(done).is_err() {
            // 问的那头走了：照样换了。
        }
    }
}

/// 一个连进来的：一个任务里照 HTTP/1 给，能升级成 WebSocket。
fn serve_one(stream: tokio::net::TcpStream, peer: SocketAddr, site: &Arc<Site>) {
    let site = Arc::clone(site);
    // 从别的机器来的（对端不是回环）：转给核心以前要说一声（`connection.remote`，SU-1）
    let remote = miyu_webserve::remote(peer);
    tokio::spawn(async move {
        let service =
            hyper::service::service_fn(move |request| handle(request, Arc::clone(&site), remote));
        let served = hyper::server::conn::http1::Builder::new()
            .serve_connection(TokioIo::new(stream), service)
            .with_upgrades()
            .await;
        if let Err(error) = served {
            tracing::debug!(target: TARGET, error = %error, "connection ended");
        }
    });
}

/// 睡到 `at`；空的一直睡。
async fn until(at: Option<Instant>) {
    match at {
        Some(at) => tokio::time::sleep_until(at.into()).await,
        None => std::future::pending().await,
    }
}

/// 一个请求：先核对 Host；`/ws` 交给 WebSocket；`/listen` 在听的、换监听；`/media` 换票据、照票据给；`GET`、`HEAD` 当页面文件；别的方法 405。
async fn handle(
    request: Request<Incoming>,
    site: Arc<Site>,
    remote: Option<std::net::IpAddr>,
) -> Result<Response<Body>, Infallible> {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok());
    if !site.host_allowed(host) {
        let origin = request
            .headers()
            .get(header::ORIGIN)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        tracing::warn!(target: TARGET, host = host.unwrap_or_default(), origin, "rejected");
        return Ok(empty(StatusCode::FORBIDDEN));
    }
    let path = request.uri().path();
    if path == "/ws" {
        return Ok(miyu_webserve::ws::accept(request, site, remote));
    }
    if path == "/listen" {
        return Ok(listen::handle(request, site).await);
    }
    if path == "/media" {
        return Ok(media::post(request, site).await);
    }
    if path.starts_with("/media/") {
        return Ok(media::get(request, site).await);
    }
    if path == "/page" {
        return Ok(backstage::post(request, site).await);
    }
    if path.starts_with("/p/") {
        return Ok(backstage::get(request, site).await);
    }
    let settings = &site.settings;
    Ok(miyu_webserve::pages::serve(&request, &site.pages, &settings.csp, &settings.types).await)
}

/// 拿单实例的锁：拿不到（有一个在跑）是空的。
fn lock(path: &std::path::Path) -> Result<Option<File>, String> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|error| format!("{} not opened: {error}", path.display()))?;
    match file.try_lock() {
        Ok(()) => Ok(Some(file)),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(error)) => Err(format!("{} not locked: {error}", path.display())),
    }
}

/// 有没有一个网页软件在跑：锁有人拿着。
pub fn running(root: &DataRoot) -> bool {
    matches!(lock(&root.run().join(LOCK)), Ok(None))
}

/// 地址写进 `run/web`：先写临时文件再改名。
fn write_address(run: &std::path::Path, url: &str) -> Result<(), String> {
    let temp = run.join(format!("{ADDRESS}.{}.tmp", std::process::id()));
    std::fs::write(&temp, format!("{url}\n"))
        .and_then(|()| std::fs::rename(&temp, run.join(ADDRESS)))
        .map_err(|error| format!("run/{ADDRESS} not written: {error}"))
}

/// 删 `run/web`：没有的不要紧。
fn remove_address(run: &std::path::Path) {
    if let Err(error) = std::fs::remove_file(run.join(ADDRESS))
        && error.kind() != std::io::ErrorKind::NotFound
    {
        tracing::warn!(target: TARGET, error = %error, "address not removed");
    }
}

/// 读 `run/web` 里的地址：没有的、读不了的是空的。
pub fn address(root: &DataRoot) -> Option<String> {
    let text = std::fs::read_to_string(root.run().join(ADDRESS)).ok()?;
    let url = text.trim();
    (!url.is_empty()).then(|| url.to_string())
}

/// 收到停的信号：Ctrl+C，Unix 上另有 SIGTERM。
async fn stopped() {
    #[cfg(unix)]
    {
        let Ok(mut term) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        else {
            return std::future::pending().await;
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        if tokio::signal::ctrl_c().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}
