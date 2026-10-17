//! 桌面壁纸（主题「跟随壁纸」，蓝图 `web.md`「跟着人格的外观」第 5 条）：带口令才给。matugen 生成的那份颜色优先（2026-10-11 项目主人
//! 定），没有的自己找壁纸。
//!
//! - `/wallpaper?k=口令&dark=0|1`：回 `{"sig": "…", "kind": "matugen"|"image"}`（换没换的记号，变了才重取色），是图的多一格 `seeds`：
//!   照图算好的候选色（最多 4 个 `#rrggbb`，打分高的在前；2026-10-14 项目主人定壁纸取色归头，用核心门面的 `miyu_client::seeds`，和核心算
//!   头像的同一份代码），一张图只算一次（照记号记着）；两样都没有的 404。
//! - 多带 `data=1` 的回那一份本身：matugen 的 JSON，或者图（媒体类型照文件开头认的）。
//! - `/wallpaper/events?k=口令`：一条 `text/event-stream`，壁纸来处的文件变了发一条 `changed`，页面收到再问一次 `/wallpaper`（2026-10-14
//!   项目主人定：换了壁纸跟着变，不轮询）。盯哪些文件照 crate 交的清单（[`Follow`]），每次找完照这次找到的换。
//!
//! 找、认图、盯文件在 crate `miyu-wallpaper`：找要跑命令（awww、gsettings……），放到阻塞的线程上做。

use std::io;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use miyu_wallpaper::watch::{Watch, watch_list};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::broadcast;

use crate::Site;
use crate::files::reply;
use crate::media::params;

const JSON: &str = "application/json; charset=utf-8";

/// 盯着壁纸来处的文件：变了告诉每一条开着的 `/wallpaper/events`。头一次有人问（`/wallpaper`、`/wallpaper/events`）才开始盯；起不来的
/// 记一行，以后不再试，页面只靠重新可见、拿回焦点时再问。
pub struct Follow {
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
        let Ok(mut watch) = self.watch.lock() else {
            return;
        };
        match &*watch {
            Watching::On(w) => {
                if let Err(e) = w.set(targets) {
                    eprintln!("盯不了有的壁纸文件：{e}");
                }
            }
            Watching::Failed => {}
            Watching::NotYet => {
                let changed = self.changed.clone();
                *watch = match Watch::start(targets, move || {
                    // 没有开着的 `/wallpaper/events` 时没人收，不算错
                    let _receivers = changed.send(());
                }) {
                    Ok(w) => Watching::On(w),
                    Err(e) => {
                        eprintln!("盯不了壁纸的文件，换了壁纸只在页面拿回焦点时跟上：{e}");
                        Watching::Failed
                    }
                };
            }
        }
    }

    /// 还没开始盯的照「什么都没找到」那份清单先盯上（页面先开了 `/wallpaper/events`）。
    fn ensure(&self) {
        let fresh = matches!(self.watch.lock().as_deref(), Ok(Watching::NotYet));
        if fresh {
            self.set(watch_list());
        }
    }
}

/// 回一个 `/wallpaper` 的请求。
///
/// # Errors
///
/// 写连接出错。
pub async fn serve(stream: &mut TcpStream, site: &Site, query: &str) -> io::Result<()> {
    let q = params(query);
    if q.get("k") != Some(&site.key) {
        return reply(stream, "403 Forbidden", "text/plain; charset=utf-8", b"").await;
    }
    let dark = q.get("dark").is_some_and(|v| v == "1");
    let data = q.get("data").is_some_and(|v| v == "1");
    let cache = site.wallpaper.seeds.clone();
    let got = match tokio::task::spawn_blocking(move || look(&cache, dark, data)).await {
        Ok(got) => got,
        Err(e) => Err(io::Error::other(e)),
    };
    let got = got.map(|(found, targets)| {
        site.wallpaper.set(targets);
        found
    });
    match got {
        Ok(Some(Found::Sig(sig, kind, seeds))) => {
            let mut body = serde_json::json!({ "sig": sig, "kind": kind });
            if let Some(seeds) = seeds {
                body["seeds"] = serde_json::json!(seeds);
            }
            reply(stream, "200 OK", JSON, body.to_string().as_bytes()).await
        }
        Ok(Some(Found::Data(bytes, mime))) => reply(stream, "200 OK", mime, &bytes).await,
        Ok(None) => reply(stream, "404 Not Found", JSON, b"{}").await,
        Err(e) => {
            eprintln!("读不了桌面壁纸：{e}");
            reply(stream, "404 Not Found", JSON, b"{}").await
        }
    }
}

/// 回一个 `/wallpaper/events`：开着，盯的文件变了写一条 `changed`；页面关了（读到连接结束）就退。
///
/// # Errors
///
/// 写连接出错。
pub async fn events(stream: &mut TcpStream, site: &Site, query: &str) -> io::Result<()> {
    if params(query).get("k") != Some(&site.key) {
        return reply(stream, "403 Forbidden", "text/plain; charset=utf-8", b"").await;
    }
    let mut changed = site.wallpaper.changed.subscribe();
    site.wallpaper.ensure();
    stream
        .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\n\r\n")
        .await?;
    stream.flush().await?;
    let mut sink = [0u8; 256];
    loop {
        tokio::select! {
            got = changed.recv() => match got {
                // 落下了几条也只是「变了」
                Ok(()) | Err(broadcast::error::RecvError::Lagged(_)) => {
                    stream.write_all(b"data: changed\n\n").await?;
                    stream.flush().await?;
                }
                Err(broadcast::error::RecvError::Closed) => return Ok(()),
            },
            read = stream.read(&mut sink) => match read {
                Ok(0) | Err(_) => return Ok(()),
                Ok(_) => {}
            },
        }
    }
}

/// 这张图的候选色：记号和上一次的一样的照记着的，不一样的读图算一遍（阻塞）。解不开的图是空的。
fn seeds_of(
    cache: &SeedCache,
    sig: &str,
    image: &miyu_wallpaper::Wallpaper,
) -> io::Result<Vec<String>> {
    if let Ok(cached) = cache.lock()
        && let Some((seen, seeds)) = cached.as_ref()
        && seen == sig
    {
        return Ok(seeds.clone());
    }
    let seeds: Vec<String> = miyu_client::seeds::from_image(&image.read()?)
        .unwrap_or_default()
        .iter()
        .map(|s| s.hex())
        .collect();
    if let Ok(mut cached) = cache.lock() {
        *cached = Some((sig.to_owned(), seeds.clone()));
    }
    Ok(seeds)
}

/// 找到的：记号、是哪一种、是图的候选色，或者那一份本身。
enum Found {
    Sig(String, &'static str, Option<Vec<String>>),
    Data(Vec<u8>, &'static str),
}

/// 先找 matugen 那一份，没有的找壁纸（阻塞：跑命令、读文件）；一起交回以后要盯的文件。
fn look(cache: &SeedCache, dark: bool, data: bool) -> io::Result<(Option<Found>, Vec<PathBuf>)> {
    if let Some(m) = miyu_wallpaper::matugen::find() {
        let found = if data {
            Found::Data(m.read()?, JSON)
        } else {
            Found::Sig(m.signature()?, "matugen", None)
        };
        return Ok((Some(found), watch_list()));
    }
    let Some(w) = miyu_wallpaper::find(dark)? else {
        return Ok((None, watch_list()));
    };
    let found = if data {
        Found::Data(w.read()?, w.mime)
    } else {
        let sig = w.signature()?;
        let seeds = seeds_of(cache, &sig, &w)?;
        Found::Sig(sig, "image", Some(seeds))
    };
    Ok((Some(found), w.watch))
}
