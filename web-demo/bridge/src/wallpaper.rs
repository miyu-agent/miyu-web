//! 桌面壁纸（主题「跟随壁纸」，蓝图 `web.md`「跟着人格的外观」第 5 条）：带口令才给。matugen 生成的那份颜色优先（2026-10-11 项目主人
//! 定），没有的自己找壁纸。
//!
//! - `/wallpaper?k=口令&dark=0|1`：回 `{"sig": "…", "kind": "matugen"|"image"}`（换没换的记号，页面隔一会儿问一次，变了才重取色）；
//!   两样都没有的 404。
//! - 多带 `data=1` 的回那一份本身：matugen 的 JSON，或者图（媒体类型照文件开头认的）。
//!
//! 找、认图在 crate `miyu-wallpaper`：要跑命令（awww、gsettings……），放到阻塞的线程上做。

use std::io;

use tokio::net::TcpStream;

use crate::Site;
use crate::files::reply;
use crate::media::params;

const JSON: &str = "application/json; charset=utf-8";

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
    let got = match tokio::task::spawn_blocking(move || look(dark, data)).await {
        Ok(got) => got,
        Err(e) => Err(io::Error::other(e)),
    };
    match got {
        Ok(Some(Found::Sig(sig, kind))) => reply(stream, "200 OK", JSON, serde_json::json!({ "sig": sig, "kind": kind }).to_string().as_bytes()).await,
        Ok(Some(Found::Data(bytes, mime))) => reply(stream, "200 OK", mime, &bytes).await,
        Ok(None) => reply(stream, "404 Not Found", JSON, b"{}").await,
        Err(e) => {
            eprintln!("读不了桌面壁纸：{e}");
            reply(stream, "404 Not Found", JSON, b"{}").await
        }
    }
}

/// 找到的：记号和是哪一种，或者那一份本身。
enum Found {
    Sig(String, &'static str),
    Data(Vec<u8>, &'static str),
}

/// 先找 matugen 那一份，没有的找壁纸（阻塞：跑命令、读文件）。
fn look(dark: bool, data: bool) -> io::Result<Option<Found>> {
    if let Some(m) = miyu_wallpaper::matugen::find() {
        return Ok(Some(if data { Found::Data(m.read()?, JSON) } else { Found::Sig(m.signature()?, "matugen") }));
    }
    let Some(w) = miyu_wallpaper::find(dark)? else { return Ok(None) };
    Ok(Some(if data { Found::Data(w.read()?, w.mime) } else { Found::Sig(w.signature()?, "image") }))
}
