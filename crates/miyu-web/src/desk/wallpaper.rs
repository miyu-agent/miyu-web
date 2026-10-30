//! 桌面壁纸（主题「跟随壁纸」，蓝图 `web.md`「跟着人格的外观」第 5 条；`web-ui.md`「怎么走」第五条第 4 款）：照演示的桥的
//! `/wallpaper` 做。matugen 生成的那份颜色优先，没有的自己找壁纸。
//!
//! - `/wallpaper?dark=0|1`：回 `{"sig", "kind": "matugen"|"image"}`（换没换的记号），是图的多一格 `seeds`（照图算好的候选色，用核心门面的
//!   `miyu_client::seeds`，一张图只算一次）；带 `data=1` 的回那一份本身（matugen 的 JSON，或者图）；两样都没有的 404。
//! - `/wallpaper/events`：一条 `text/event-stream`，壁纸来处的文件变了发一条 `changed`（不轮询）；开着的不算空闲。
//!
//! 找、认图、盯文件在 crate `miyu-wallpaper`：找要跑命令，放到阻塞的线程上做。

use std::io;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};

use http_body_util::{BodyExt, StreamBody};
use hyper::Response;
use hyper::body::{Bytes, Frame};
use hyper::header::{self, HeaderValue};
use miyu_wallpaper::watch::{Watch, watch_list};
use tokio::sync::{broadcast, mpsc};

use super::{json_reply, not_found};
use crate::TARGET;
use crate::serve::{Body, Site};

/// 盯着壁纸来处的文件：变了告诉每一条开着的 `/wallpaper/events`。头一次有人问才开始盯；起不来的记一行，以后不再试（页面靠重新可见、
/// 拿回焦点时再问）。
pub(crate) struct Follow {
    changed: broadcast::Sender<()>,
    watch: Mutex<Watching>,
    /// 最近一张图的记号和它的候选色（一张图只算一次）。
    seeds: Arc<SeedCache>,
}

/// 最近一张图的记号和它的候选色。
type SeedCache = Mutex<Option<(String, Vec<String>)>>;

/// 盯没盯上。
enum Watching {
    NotYet,
    On(Watch),
    Failed,
}

impl Default for Follow {
    fn default() -> Self {
        Self {
            changed: broadcast::channel(4).0,
            watch: Mutex::new(Watching::NotYet),
            seeds: Arc::default(),
        }
    }
}

impl Follow {
    /// 照这份清单盯（还没开始的开始盯）。
    fn set(&self, targets: Vec<PathBuf>) {
        let mut watch = self.watch.lock().unwrap_or_else(PoisonError::into_inner);
        match &*watch {
            Watching::On(watching) => {
                if let Err(error) = watching.set(targets) {
                    tracing::warn!(target: TARGET, error = %error, "some wallpaper files not watched");
                }
            }
            Watching::Failed => {}
            Watching::NotYet => {
                let changed = self.changed.clone();
                *watch = match Watch::start(targets, move || {
                    // 没有开着的 `/wallpaper/events` 时没人收，不算错
                    let _receivers = changed.send(());
                }) {
                    Ok(watching) => Watching::On(watching),
                    Err(error) => {
                        tracing::warn!(target: TARGET, error = %error, "wallpaper not watched");
                        Watching::Failed
                    }
                };
            }
        }
    }

    /// 还没开始盯的照「什么都没找到」那份清单先盯上（页面先开了 `/wallpaper/events`）。
    fn ensure(&self) {
        let fresh = matches!(
            *self.watch.lock().unwrap_or_else(PoisonError::into_inner),
            Watching::NotYet
        );
        if fresh {
            self.set(watch_list());
        }
    }
}

/// 回一个 `/wallpaper`。
pub(crate) async fn serve(site: &Site, dark: bool, data: bool) -> Response<Body> {
    let cache = Arc::clone(&site.wallpaper.seeds);
    let got = tokio::task::spawn_blocking(move || look(&cache, dark, data))
        .await
        .unwrap_or_else(|error| Err(io::Error::other(error)));
    let found = match got {
        Ok((found, targets)) => {
            site.wallpaper.set(targets);
            found
        }
        Err(error) => {
            tracing::warn!(target: TARGET, error = %error, "wallpaper not read");
            None
        }
    };
    match found {
        Some(Found::Sig(sig, kind, seeds)) => {
            let mut body = serde_json::json!({"sig": sig, "kind": kind});
            if let Some(seeds) = seeds {
                body["seeds"] = serde_json::json!(seeds);
            }
            json_reply(body.to_string())
        }
        Some(Found::Data(bytes, mime)) => {
            let mut response = Response::new(crate::serve::full(bytes));
            let headers = response.headers_mut();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
            headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            crate::serve::secure(headers);
            response
        }
        None => not_found(),
    }
}

/// 回一个 `/wallpaper/events`：开着，盯的文件变了写一条 `changed`；页面关了（写不进去）就退。开着的不算空闲。
pub(crate) fn events(site: &Arc<Site>) -> Response<Body> {
    let mut changed = site.wallpaper.changed.subscribe();
    site.wallpaper.ensure();
    let (out, frames) = mpsc::channel::<Result<Frame<Bytes>, io::Error>>(2);
    let busy = site.busy();
    tokio::spawn(async move {
        let _busy = busy;
        loop {
            let got = tokio::select! {
                got = changed.recv() => got,
                // 页面关了：连接没了，正文跟着丢掉
                () = out.closed() => return,
            };
            match got {
                // 落下了几条也只是「变了」
                Ok(()) | Err(broadcast::error::RecvError::Lagged(_)) => {
                    let line = Frame::data(Bytes::from_static(b"data: changed\n\n"));
                    if out.send(Ok(line)).await.is_err() {
                        return;
                    }
                }
                Err(broadcast::error::RecvError::Closed) => return,
            }
        }
    });
    let stream = futures_util::stream::unfold(frames, |mut frames| async move {
        frames.recv().await.map(|frame| (frame, frames))
    });
    let mut response = Response::new(BodyExt::boxed(StreamBody::new(stream)));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/event-stream"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    crate::serve::secure(headers);
    response
}

/// 这张图的候选色：记号和上一次的一样的照记着的，不一样的读图算一遍（阻塞）。解不开的图是空的。
fn seeds_of(
    cache: &SeedCache,
    sig: &str,
    image: &miyu_wallpaper::Wallpaper,
) -> io::Result<Vec<String>> {
    if let Some((seen, seeds)) = cache
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_ref()
        && seen == sig
    {
        return Ok(seeds.clone());
    }
    let seeds: Vec<String> = miyu_client::seeds::from_image(&image.read()?)
        .unwrap_or_default()
        .iter()
        .map(|seed| seed.hex())
        .collect();
    *cache.lock().unwrap_or_else(PoisonError::into_inner) = Some((sig.to_owned(), seeds.clone()));
    Ok(seeds)
}

/// 找到的：记号、是哪一种、是图的候选色，或者那一份本身。
enum Found {
    Sig(String, &'static str, Option<Vec<String>>),
    Data(Vec<u8>, &'static str),
}

/// 先找 matugen 那一份，没有的找壁纸（阻塞：跑命令、读文件）；一起交回以后要盯的文件。
fn look(cache: &SeedCache, dark: bool, data: bool) -> io::Result<(Option<Found>, Vec<PathBuf>)> {
    if let Some(found) = miyu_wallpaper::matugen::find() {
        let found = if data {
            Found::Data(found.read()?, "application/json")
        } else {
            Found::Sig(found.signature()?, "matugen", None)
        };
        return Ok((Some(found), watch_list()));
    }
    let Some(image) = miyu_wallpaper::find(dark)? else {
        return Ok((None, watch_list()));
    };
    let found = if data {
        Found::Data(image.read()?, image.mime)
    } else {
        let sig = image.signature()?;
        let seeds = seeds_of(cache, &sig, &image)?;
        Found::Sig(sig, "image", Some(seeds))
    };
    Ok((Some(found), image.watch))
}
