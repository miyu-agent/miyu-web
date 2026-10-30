//! `/ws`（`web-ui.md`「怎么走」第一条第 7 到 9 款）：Origin 对上了才接；接了以后连核心（`connect_or_start_bare`，不读
//! 本机令牌，核心没在跑就拉起来），两头照转：文字帧加一个 `\n` 是一行，一行去掉 `\n` 是一个文字帧，不读、不改、不加。
//!
//! - 二进制帧：关，1003。一帧超过 1 MiB：关，1009（核心那头一行也就这么长）。
//! - 核心那头断了：关，1012，页面照自己的规矩重连。浏览器那头断了：核心的连接跟着关。
//! - 连不上核心：发一条 `web.error` 通知，再关。
//!
//! 一个标签页一条核心连接，不合并（`web-module.md`「起草时定的」第 3 条）。往浏览器写的都经一个写的任务：两头都可能要关它。
//!
//! 有上限的（[`Slots`]，2026-10-30 第二轮审查 W2-2、项目主人定：总共 256 条、别的机器来的 32 条）满了回 503；升级以后先等浏览器的
//! 第一帧（[`FIRST_FRAME`] 以内，就是握手），等到了才连核心：开着不说话的空连接不占核心的连接。
//!
//! 关了以后不马上放掉套接字：先关写的一半，把浏览器还在发的读掉、扔掉（最多等 `LINGER`），读到头再放。带着没读的数据
//! 关，系统回的是 RST，刚写出去的关闭帧可能被对面丢掉：一帧超过 1 MiB 时帧的正文没读，Windows 上浏览器只看到连接被重置，
//! 收不到 1009（W-9 验收时 CI 上查出来的）。

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use hyper::body::Incoming;
use hyper::header::{self, HeaderValue};
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::handshake::derive_accept_key;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, Role, WebSocketConfig};
use tokio_tungstenite::tungstenite::{Error, Message};

use crate::respond::{Body, empty};
use crate::{Site, TARGET};

/// 一帧最大多少字节：核心那头一行最长 1 MiB（`protocol.md`「一行一条」）。
const LIMIT: usize = 1 << 20;

/// 关了以后最多等多久把浏览器还在发的读掉。
const LINGER: Duration = Duration::from_secs(2);

/// 升级以后等浏览器第一帧（握手）最多多久：等不到的关掉，不连核心。
pub const FIRST_FRAME: Duration = Duration::from_secs(10);

/// 同时连着的 WebSocket 数着：一共几条、别的机器来的几条，各有上限。
pub struct Slots {
    counts: Arc<[AtomicUsize; 2]>,
    most: usize,
    most_remote: usize,
}

impl Slots {
    /// 一共最多 `most` 条，别的机器来的最多 `most_remote` 条。
    #[must_use]
    pub fn new(most: usize, most_remote: usize) -> Slots {
        Slots {
            counts: Arc::new([AtomicUsize::new(0), AtomicUsize::new(0)]),
            most,
            most_remote,
        }
    }

    /// 占一格：满了的是空的。`remote` 是别的机器来的。
    pub fn take(&self, remote: bool) -> Option<Slot> {
        let [all, far] = &*self.counts;
        if all.fetch_add(1, Ordering::AcqRel) >= self.most {
            all.fetch_sub(1, Ordering::AcqRel);
            return None;
        }
        if remote && far.fetch_add(1, Ordering::AcqRel) >= self.most_remote {
            far.fetch_sub(1, Ordering::AcqRel);
            all.fetch_sub(1, Ordering::AcqRel);
            return None;
        }
        Some(Slot {
            counts: Arc::clone(&self.counts),
            remote,
        })
    }

    /// 现在连着几条：一共、别的机器来的。
    #[must_use]
    pub fn used(&self) -> (usize, usize) {
        let [all, far] = &*self.counts;
        (all.load(Ordering::Acquire), far.load(Ordering::Acquire))
    }
}

/// 占着的一格：放下了还回去。
pub struct Slot {
    counts: Arc<[AtomicUsize; 2]>,
    remote: bool,
}

impl Drop for Slot {
    fn drop(&mut self) {
        let [all, far] = &*self.counts;
        all.fetch_sub(1, Ordering::AcqRel);
        if self.remote {
            far.fetch_sub(1, Ordering::AcqRel);
        }
    }
}

/// 接一个 WebSocket：Origin 不对 403，不是升级请求 400；对的回 101，升级好以后在别的任务里转。`remote` 是从别的机器来的连接的对端地址
/// （[`crate::remote`]）：转给核心以前先说一声它是远程的（`connection.remote`，SU-1），本机来的是空的。
pub fn accept<S: Site>(
    request: Request<Incoming>,
    site: Arc<S>,
    remote: Option<std::net::IpAddr>,
) -> Response<Body> {
    let headers = request.headers();
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok());
    let allowed = origin.is_some_and(|origin| {
        origin
            .get(..7)
            .is_some_and(|scheme| scheme.eq_ignore_ascii_case("http://"))
            && site.origin_allowed(&origin[7..], host)
    });
    if !allowed {
        let host = host.unwrap_or_default();
        tracing::warn!(target: TARGET, host, origin = origin.unwrap_or_default(), "rejected");
        return empty(StatusCode::FORBIDDEN);
    }
    let upgrade = headers
        .get(header::UPGRADE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.eq_ignore_ascii_case("websocket"));
    let version = headers
        .get(header::SEC_WEBSOCKET_VERSION)
        .is_some_and(|value| value.as_bytes() == b"13");
    let Some(key) = headers
        .get(header::SEC_WEBSOCKET_KEY)
        .filter(|_| upgrade && version)
    else {
        return empty(StatusCode::BAD_REQUEST);
    };
    // 满了的不接（第二轮审查 W2-2）
    let slot = match site.slots().map(|slots| slots.take(remote.is_some())) {
        Some(None) => {
            tracing::warn!(target: TARGET, remote = remote.is_some(), "too many websockets");
            return empty(StatusCode::SERVICE_UNAVAILABLE);
        }
        Some(Some(slot)) => Some(slot),
        None => None,
    };
    let accept = derive_accept_key(key.as_bytes());
    tokio::spawn(async move {
        let _slot = slot;
        match hyper::upgrade::on(request).await {
            Ok(upgraded) => bridge(TokioIo::new(upgraded), site, remote).await,
            Err(error) => tracing::debug!(target: TARGET, error = %error, "not upgraded"),
        }
    });
    let mut response = empty(StatusCode::SWITCHING_PROTOCOLS);
    let headers = response.headers_mut();
    headers.insert(header::UPGRADE, HeaderValue::from_static("websocket"));
    headers.insert(header::CONNECTION, HeaderValue::from_static("Upgrade"));
    if let Ok(accept) = HeaderValue::from_str(&accept) {
        headers.insert(header::SEC_WEBSOCKET_ACCEPT, accept);
    }
    response
}

/// 关一个 WebSocket 的那一帧。
fn close(code: CloseCode) -> Message {
    Message::Close(Some(CloseFrame {
        code,
        reason: "".into(),
    }))
}

/// 两头照转，直到一头断了。远程的（`remote`）在转浏览器的第一行以前先写一行 `connection.remote`（核心 `connection.md`「网页」）。
async fn bridge<I, S: Site>(io: I, site: Arc<S>, remote: Option<std::net::IpAddr>)
where
    I: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let _busy = site.busy();
    let config = WebSocketConfig::default()
        .max_message_size(Some(LIMIT))
        .max_frame_size(Some(LIMIT));
    let ws = WebSocketStream::from_raw_socket(io, Role::Server, Some(config)).await;
    let (mut sink, mut frames) = ws.split();
    // 往浏览器写的都经它：两头都可能要关。
    let (out, mut outgoing) = mpsc::channel::<Message>(64);
    let writer = tokio::spawn(async move {
        while let Some(message) = outgoing.recv().await {
            let closing = matches!(message, Message::Close(_));
            if sink.send(message).await.is_err() || closing {
                break;
            }
        }
        if let Err(error) = sink.close().await {
            tracing::debug!(target: TARGET, error = %error, "websocket not closed cleanly");
        }
        sink
    });
    // 先等浏览器的第一帧（握手）：等不到的关掉，不连核心（第二轮审查 W2-2）
    let first = match tokio::time::timeout(FIRST_FRAME, frames.next()).await {
        Ok(Some(Ok(Message::Text(text)))) => text,
        Ok(Some(Ok(Message::Binary(_)))) => {
            send(&out, close(CloseCode::Unsupported)).await;
            drop(out);
            finish(writer, frames).await;
            return;
        }
        Ok(Some(Err(Error::Capacity(_)))) => {
            send(&out, close(CloseCode::Size)).await;
            drop(out);
            finish(writer, frames).await;
            return;
        }
        _ => {
            tracing::debug!(target: TARGET, "websocket said nothing");
            send(&out, close(CloseCode::Policy)).await;
            drop(out);
            finish(writer, frames).await;
            return;
        }
    };
    let core =
        match miyu_client::connect::connect_or_start_bare(site.root(), || (site.core())()).await {
            Ok(core) => core,
            Err(error) => {
                tracing::warn!(target: TARGET, error = %error, "core unreachable");
                let notice = serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": "web.error",
                    "params": {"message": error.to_string()},
                });
                send(&out, Message::text(notice.to_string())).await;
                send(&out, close(CloseCode::Normal)).await;
                drop(out);
                finish(writer, frames).await;
                return;
            }
        };
    tracing::debug!(target: TARGET, "websocket connected");
    let (read, mut write) = tokio::io::split(core);
    if let Some(from) = remote {
        let notice = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "connection.remote",
            "params": {"from": from.to_string()},
        });
        let told = async {
            write.write_all(format!("{notice}\n").as_bytes()).await?;
            write.flush().await
        };
        if told.await.is_err() {
            tracing::warn!(target: TARGET, "remote not told to the core");
            send(&out, close(CloseCode::Restart)).await;
            drop(out);
            finish(writer, frames).await;
            return;
        }
    }
    // 等到的第一帧照常转过去
    let written = async {
        write.write_all(first.as_bytes()).await?;
        write.write_all(b"\n").await?;
        write.flush().await
    };
    if written.await.is_err() {
        send(&out, close(CloseCode::Restart)).await;
        drop(out);
        finish(writer, frames).await;
        return;
    }
    // 核心 → 浏览器：一行一个文字帧；核心断了关 1012，叫浏览器那头的循环停下。
    let (gone, core_gone) = oneshot::channel::<()>();
    let to_browser = out.clone();
    let reader = tokio::spawn(async move {
        let mut lines = BufReader::new(read);
        loop {
            let mut line = Vec::new();
            match lines.read_until(b'\n', &mut line).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if line.last() == Some(&b'\n') {
                        line.pop();
                    }
                    let text = String::from_utf8_lossy(&line).into_owned();
                    if !send(&to_browser, Message::text(text)).await {
                        return;
                    }
                }
            }
        }
        send(&to_browser, close(CloseCode::Restart)).await;
        if gone.send(()).is_err() {
            // 浏览器那头的循环已经停了：没有人等。
        }
    });
    // 浏览器 → 核心：一个文字帧加一个换行是一行。
    tokio::pin!(core_gone);
    loop {
        tokio::select! {
            frame = frames.next() => match frame {
                Some(Ok(Message::Text(text))) => {
                    let written = async {
                        write.write_all(text.as_bytes()).await?;
                        write.write_all(b"\n").await?;
                        write.flush().await
                    };
                    if written.await.is_err() {
                        send(&out, close(CloseCode::Restart)).await;
                        break;
                    }
                }
                Some(Ok(Message::Binary(_))) => {
                    send(&out, close(CloseCode::Unsupported)).await;
                    break;
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(Error::Capacity(_))) => {
                    send(&out, close(CloseCode::Size)).await;
                    break;
                }
                Some(Err(_)) => break,
            },
            _ = &mut core_gone => break,
        }
    }
    reader.abort();
    // 核心的连接跟着关：写的一半关掉，读的一半随任务丢掉。
    if let Err(error) = write.shutdown().await {
        tracing::debug!(target: TARGET, error = %error, "core connection not shut down");
    }
    drop(out);
    finish(writer, frames).await;
    tracing::debug!(target: TARGET, "websocket closed");
}

/// 放进写的队列：写的任务已经走了的交回假。
async fn send(out: &mpsc::Sender<Message>, message: Message) -> bool {
    out.send(message).await.is_ok()
}

/// 等写的任务写完（它崩了的记一行），再把浏览器还在发的读掉才放（[`LINGER`]）。
async fn finish<S>(
    writer: tokio::task::JoinHandle<futures_util::stream::SplitSink<WebSocketStream<S>, Message>>,
    frames: futures_util::stream::SplitStream<WebSocketStream<S>>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let sink = match writer.await {
        Ok(sink) => sink,
        Err(error) => {
            if error.is_panic() {
                tracing::error!(target: TARGET, error = %error, "websocket writer panicked");
            }
            return;
        }
    };
    let Ok(mut ws) = frames.reunite(sink) else {
        return;
    };
    linger(ws.get_mut()).await;
}

/// 关写的一半，读掉、扔掉对面还在发的，读到头、出错或者到 [`LINGER`] 为止。只用一块定长的缓冲，发多少都不占内存。
async fn linger<S>(io: &mut S)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    if let Err(error) = io.shutdown().await {
        tracing::debug!(target: TARGET, error = %error, "websocket not shut down");
    }
    let mut buffer = [0u8; 8192];
    let drained = tokio::time::timeout(LINGER, async {
        while io.read(&mut buffer).await.is_ok_and(|read| read > 0) {}
    });
    if drained.await.is_err() {
        tracing::debug!(target: TARGET, "browser still sending after close");
    }
}
