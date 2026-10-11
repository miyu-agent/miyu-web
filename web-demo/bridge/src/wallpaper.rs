//! 桌面壁纸（主题「跟随壁纸」，蓝图 `web.md`「跟着人格的外观」第 5 条）：带口令才给。
//!
//! - `/wallpaper?k=口令&dark=0|1`：回 `{"sig": "…"}`（换没换的记号，页面隔一会儿问一次，变了才重取色）；读不到的 404。
//! - 多带 `image=1` 的回图本身（媒体类型照文件开头认的）。
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
    let image = q.get("image").is_some_and(|v| v == "1");
    let got = match tokio::task::spawn_blocking(move || look(dark, image)).await {
        Ok(got) => got,
        Err(e) => Err(io::Error::other(e)),
    };
    match got {
        Ok(Some(Found::Sig(sig))) => reply(stream, "200 OK", JSON, serde_json::json!({ "sig": sig }).to_string().as_bytes()).await,
        Ok(Some(Found::Image(bytes, mime))) => reply(stream, "200 OK", mime, &bytes).await,
        Ok(None) => reply(stream, "404 Not Found", JSON, b"{}").await,
        Err(e) => {
            eprintln!("读不了桌面壁纸：{e}");
            reply(stream, "404 Not Found", JSON, b"{}").await
        }
    }
}

/// 找到的：记号，或者图本身。
enum Found {
    Sig(String),
    Image(Vec<u8>, &'static str),
}

/// 找壁纸（阻塞：跑命令、读文件）。
fn look(dark: bool, image: bool) -> io::Result<Option<Found>> {
    let Some(w) = miyu_wallpaper::find(dark)? else { return Ok(None) };
    Ok(Some(if image { Found::Image(w.read()?, w.mime) } else { Found::Sig(w.signature()?) }))
}
