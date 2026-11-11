//! 这台电脑上的几样（`web-ui.md`「怎么走」第五条，2026-10-30 项目主人：「打开目录」都是假的，只是复制路径）：浏览器开不了本机的文件夹、
//! 给不了本机路径、读不到桌面壁纸，由和页面在同一台电脑上的网页软件替它做。
//!
//! - 对端不是回环地址的（局域网里别的设备）一律 403：在装 Miyu 的那台电脑上开文件管理器、弹选目录框，对别的设备没意义。
//! - `/reveal`、`/pick-dir`、`/locate`、`/wallpaper` 要设备令牌（`Authorization: Bearer`），照它问核心一句（同 `/media` 那一池连接），不认的 401：别的
//!   网站能往 `127.0.0.1` 发不带头的请求，带了这个头就要先预检，网页软件不答，浏览器就不发。`/wallpaper/events` 只说变了，不要令牌：
//!   开着的不算有人连着、条数有上限（第四轮审查 W4-3）。
//! - 开目录、选目录、找文件在共用的 crate `miyu-desk`（和演示的桥一份代码）；壁纸在 [`wallpaper`]。
//! - `/locate?name=…&size=…&modified=…&near=…`（2026-11-11 项目主人定）：浏览器不给附件的路径，照名字、大小、改的时刻在这台电脑上找它，
//!   回 `{"path": "…"}`，没找到的 `{}`。`near` 是先看的地方（会话的工作区，可以写几个）；`wait` 是最多找几毫秒（没写的 2 秒，最多 15 秒）；`exact=1` 只认
//!   改的时刻也对得上的。
//!   Miyu 的数据根不进。

use std::collections::HashMap;
use std::sync::Arc;

use hyper::body::Incoming;
use hyper::header::{self, HeaderValue};
use hyper::{Method, Request, Response, StatusCode};
use serde_json::{Value, json};

use crate::media::link::Failed;
use crate::serve::{Body, Site, empty, full};

pub(crate) mod wallpaper;

/// 归这里管的几个路径。
pub(crate) const PATHS: [&str; 5] = [
    "/reveal",
    "/pick-dir",
    "/locate",
    "/wallpaper",
    "/wallpaper/events",
];

/// 一个请求：`remote` 是对端不是回环地址时的那个地址。
pub(crate) async fn handle(
    request: Request<Incoming>,
    site: Arc<Site>,
    remote: Option<std::net::IpAddr>,
) -> Response<Body> {
    if remote.is_some() {
        return empty(StatusCode::FORBIDDEN);
    }
    if request.method() != Method::GET {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    let path = request.uri().path().to_string();
    let query = query(request.uri().query().unwrap_or_default());
    if path == "/wallpaper/events" {
        return wallpaper::events(&site);
    }
    let Some(login) = crate::media::bearer(&request) else {
        return empty(StatusCode::UNAUTHORIZED);
    };
    if let Err(status) = check(&site, &login, None).await {
        return empty(status);
    }
    let said = |key: &str| query.get(key).map(String::as_str);
    match path.as_str() {
        "/reveal" => {
            let got = miyu_desk::reveal::reveal(said("path").unwrap_or_default()).await;
            json_reply(got.json().to_string())
        }
        "/pick-dir" => {
            // 等人点完，不限时；等着的时候不算空闲
            let _busy = site.busy();
            let start = said("start").filter(|start| !start.is_empty());
            let got = miyu_desk::pick::pick_dir(said("title").unwrap_or_default(), start).await;
            json_reply(got.json())
        }
        "/locate" => {
            let _busy = site.busy();
            let got = miyu_desk::locate::locate(
                wanted(&query),
                near(request.uri().query().unwrap_or_default()),
                vec![site.root.path().to_path_buf()],
                wait(&query),
            )
            .await;
            json_reply(got.json())
        }
        _ => wallpaper::serve(&site, said("dark") == Some("1"), said("data") == Some("1")).await,
    }
}

/// 照设备令牌问核心一句：握手过了的过，不认的 401，连不上的 502。`remote` 是请求从别的机器来的对端地址（这里的几样只给本机，是空的；
/// `/export` 照它问，W-1098）。
pub(crate) async fn check(
    site: &Site,
    login: &str,
    remote: Option<std::net::IpAddr>,
) -> Result<(), StatusCode> {
    let asked = site
        .media
        .cores
        .call(
            &site.root,
            &site.core,
            login,
            remote,
            "config.get",
            json!({"keys": ["web.port"]}),
        )
        .await;
    match asked {
        // 握手过了就是认这个令牌：这一问本身答没答都不要紧
        Ok(_) | Err(Failed::Refused(_)) => Ok(()),
        Err(Failed::BadLogin) => Err(StatusCode::UNAUTHORIZED),
        Err(Failed::Unreachable(_)) => Err(StatusCode::BAD_GATEWAY),
    }
}

/// `/locate` 要找的那个文件：`name` 必写，`size`、`modified`（Unix 毫秒）写了数的才比；`exact=1` 只认改的时刻也对得上的。
fn wanted(query: &HashMap<String, String>) -> miyu_desk::locate::Wanted {
    let number = |key: &str| query.get(key).and_then(|text| text.parse::<u64>().ok());
    miyu_desk::locate::Wanted {
        name: query.get("name").cloned().unwrap_or_default(),
        size: number("size"),
        modified_ms: number("modified"),
        exact: query.get("exact").is_some_and(|flag| flag == "1"),
    }
}

/// `/locate` 最多找多久：`wait`（毫秒）写了数的照它，没写的照出厂的；封顶在 `miyu-desk` 里。
fn wait(query: &HashMap<String, String>) -> std::time::Duration {
    query
        .get("wait")
        .and_then(|text| text.parse::<u64>().ok())
        .map_or(miyu_desk::locate::LIMIT, std::time::Duration::from_millis)
}

/// `/locate` 先看的几处：查询串里的每一个 `near`（同名的键能写几次，[`query`] 只留最后一个，这里另拆）。
fn near(text: &str) -> Vec<std::path::PathBuf> {
    text.split('&')
        .filter_map(|pair| pair.strip_prefix("near="))
        .filter_map(|value| miyu_webserve::pages::decode(&value.replace('+', " ")))
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
        .collect()
}

/// 拆查询串：`+` 是空格，`%xx` 解开；解不开的那一项不要。
fn query(text: &str) -> HashMap<String, String> {
    text.split('&')
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            let decode = |part: &str| miyu_webserve::pages::decode(&part.replace('+', " "));
            Some((decode(key)?, decode(value)?))
        })
        .collect()
}

/// 一段 JSON 的回应，不缓存。
pub(crate) fn json_reply(body: String) -> Response<Body> {
    let mut response = Response::new(full(body));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    crate::serve::secure(headers);
    response
}

/// 没找到的 JSON（`{}`，404）。
pub(crate) fn not_found() -> Response<Body> {
    let mut response = json_reply(Value::Object(serde_json::Map::new()).to_string());
    *response.status_mut() = StatusCode::NOT_FOUND;
    response
}

#[cfg(test)]
mod tests;
