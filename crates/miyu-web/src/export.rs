//! `/export`（`web-ui.md`「怎么走」第七条；核心 SE-1 中（f8f8a9bae），设计 58，W-1098）：页面要把一个会话导成原始包（ZIP）下载下来。
//! 核心的 `session.export {format: "bundle", to: {path}}` 只往本机路径写，局域网来的连接调它回 `local_machine_only`；页面也不该知道、
//! 不该挑本机的路径。所以由网页软件做：
//!
//! - `POST /export`（带登录令牌，正文 `{session, name?}`）：只认页面自己发的（Origin 和 Host 逐字一样，同 `/ticket`）；登录令牌照 `/media`
//!   的办法问核心一句（没带、作废了 401）。认了的用网页软件**自己的本机连接**（出示本机令牌，同 `ticket.rs`）叫核心写到系统临时目录下
//!   网页软件自己的子目录 `<temp>/miyu-webui-<pid>/<随机名>.zip`（数据根里核心拒 `export_in_data_root`；同名拒 `export_exists`，所以每次随机），
//!   回 `{url, bytes}`：一张一次性的下载票据。
//! - `GET /export/<票据>`：把文件交给浏览器（`attachment`、`application/zip`、`no-store`），给完删文件；票据一取就作废。
//! - 没人取的过 [`IDLE`] 删；网页软件起来时先清上回剩下的（`Exports::new`），退出时整个子目录删掉。

use std::collections::HashMap;
use std::io;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use http_body_util::{BodyExt, Limited, StreamBody};
use hyper::body::{Bytes, Frame, Incoming};
use hyper::header::{self, HeaderMap, HeaderValue};
use hyper::{Method, Request, Response, StatusCode};
use serde_json::{Value, json};
use tokio::io::AsyncReadExt;
use tokio::sync::mpsc;

use crate::TARGET;
use crate::media::insert;
use crate::serve::{Body, Busy, Site, empty};
use clean::{clean, make};

mod clean;

/// 导出的原始包没人取的过多久删（W-1098 定的：页面换到票据马上就取，取不走的多半是浏览器关了；包里有她碰过的文件内容，不在临时目录里久放）。
pub const IDLE: Duration = Duration::from_secs(10 * 60);

/// 网页软件放原始包的子目录的名字开头：后面接进程号。
pub const PREFIX: &str = "miyu-webui-";

/// 同时等着取的最多几份（一份可能很大，多了丢最早的、删它的文件）。
const MOST: usize = 8;

/// 一次读多少字节给浏览器。
const CHUNK: usize = 512 * 1024;

/// 存下来叫什么最多几个字（不算 `.zip`）。
const NAME_MAX: usize = 120;

/// 一份等着取的。
struct Waiting {
    file: PathBuf,
    /// 存下来叫什么（带 `.zip`）。
    name: String,
    made: Instant,
}

/// 网页软件导出的原始包：自己的子目录、等着取的几份。
pub(crate) struct Exports {
    /// `<temp>/miyu-webui-<pid>/`：建不成的是空的，`/export` 一律回 503。
    dir: Option<PathBuf>,
    idle: Duration,
    waiting: Mutex<HashMap<String, Waiting>>,
}

impl Exports {
    /// 起来时：先清 `temp` 下上回剩下的（[`clean()`]），再建自己的子目录（Unix 上 0700）。
    pub(crate) fn new(temp: &Path, idle: Duration) -> Exports {
        let own = std::process::id();
        clean(temp, own, idle);
        let dir = temp.join(format!("{PREFIX}{own}"));
        let dir = match make(&dir) {
            Ok(()) => Some(dir),
            Err(error) => {
                tracing::warn!(target: TARGET, error = %error, "export dir not made");
                None
            }
        };
        Exports {
            dir,
            idle,
            waiting: Mutex::new(HashMap::new()),
        }
    }

    fn waiting(&self) -> std::sync::MutexGuard<'_, HashMap<String, Waiting>> {
        self.waiting.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// 照票据记下一份等着取的；满了丢最早的那一份（删它的文件）。
    fn keep(&self, ticket: String, file: PathBuf, name: String) {
        let mut waiting = self.waiting();
        while waiting.len() >= MOST {
            let Some(oldest) = waiting
                .iter()
                .min_by_key(|(_, one)| one.made)
                .map(|(ticket, _)| ticket.clone())
            else {
                break;
            };
            if let Some(one) = waiting.remove(&oldest) {
                remove(&one.file);
            }
        }
        let made = Instant::now();
        waiting.insert(ticket, Waiting { file, name, made });
    }

    /// 照票据取走（取了就作废）。
    fn take(&self, ticket: &str) -> Option<Waiting> {
        self.waiting().remove(ticket)
    }

    /// 打扫：删掉到点没人取的；交回下一份几时到点。
    pub(crate) fn sweep(&self) -> Option<Instant> {
        let mut waiting = self.waiting();
        let idle = self.idle;
        waiting.retain(|_, one| {
            let keep = one.made.elapsed() < idle;
            if !keep {
                tracing::info!(target: TARGET, "export expired");
                remove(&one.file);
            }
            keep
        });
        waiting.values().map(|one| one.made + idle).min()
    }

    /// 退出时：整个子目录删掉（给到一半的也不留）。
    pub(crate) fn remove_all(&self) {
        self.waiting().clear();
        if let Some(dir) = &self.dir
            && let Err(error) = std::fs::remove_dir_all(dir)
            && error.kind() != io::ErrorKind::NotFound
        {
            tracing::warn!(target: TARGET, error = %error, "export dir not removed");
        }
    }
}

/// `/export`、`/export/<票据>`：`remote` 是从别的机器来的那个地址，本机的是空的。
pub(crate) async fn handle(
    request: Request<Incoming>,
    site: Arc<Site>,
    remote: Option<IpAddr>,
) -> Response<Body> {
    if request.uri().path() == "/export" {
        post(request, &site, remote).await
    } else {
        get(&request, &site)
    }
}

/// `POST /export`：叫核心导出、换一张下载票据。
async fn post(
    request: Request<Incoming>,
    site: &Arc<Site>,
    remote: Option<IpAddr>,
) -> Response<Body> {
    if request.method() != Method::POST {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    if !same_origin(request.headers()) {
        tracing::warn!(target: TARGET, remote = remote.is_some(), "export refused");
        return empty(StatusCode::FORBIDDEN);
    }
    let Some(login) = crate::media::bearer(&request) else {
        return empty(StatusCode::UNAUTHORIZED);
    };
    if let Err(status) = crate::desk::check(site, &login, remote).await {
        return empty(status);
    }
    let Some((session, name)) = read_body(request).await else {
        return empty(StatusCode::BAD_REQUEST);
    };
    // 导着的时候不算空闲；走的时候叫醒接连接的那一圈，照新记下的这一份算几时到点
    let _busy = site.busy();
    let Some(dir) = &site.exports.dir else {
        return failed(
            StatusCode::SERVICE_UNAVAILABLE,
            "export_unwritable",
            "no export dir",
        );
    };
    let (Some(file), Some(ticket)) = (
        crate::media::tickets::fresh(),
        crate::media::tickets::fresh(),
    ) else {
        tracing::warn!(target: TARGET, "no random bytes for a ticket");
        return empty(StatusCode::INTERNAL_SERVER_ERROR);
    };
    let file = dir.join(format!("{}.zip", &file[..32]));
    let bytes = match bundle(site, &session, &file).await {
        Ok(bytes) => bytes,
        Err((status, reason, message)) => {
            tracing::warn!(target: TARGET, reason = %reason, "export failed");
            remove(&file);
            return failed(status, &reason, &message);
        }
    };
    tracing::info!(target: TARGET, bytes, "export ready");
    site.exports
        .keep(ticket.clone(), file, file_name(name.as_deref(), &session));
    crate::desk::json_reply(json!({"url": format!("/export/{ticket}"), "bytes": bytes}).to_string())
}

/// 照本机令牌连核心（同 `ticket.rs`：没在跑就拉起来），`session.export` 写到 `file`；交回包多大。没成的交回状态码、原因码、原话。
async fn bundle(
    site: &Site,
    session: &str,
    file: &Path,
) -> Result<u64, (StatusCode, String, String)> {
    let unreachable = |refused: miyu_client::open::Refused| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            refused.reason,
            refused.message,
        )
    };
    let mut core = miyu_client::open::Core::connect(&site.root, &site.core, "miyu-web")
        .await
        .map_err(unreachable)?;
    let path = file.to_string_lossy();
    let params = json!({"session": session, "format": "bundle", "to": {"path": path}});
    let got = core
        .call("export", "session.export", params)
        .await
        .map_err(|refused| {
            let status = match refused.reason.as_str() {
                "session_not_found" => StatusCode::NOT_FOUND,
                "bad_params" => StatusCode::BAD_REQUEST,
                _ => StatusCode::BAD_GATEWAY,
            };
            (status, refused.reason, refused.message)
        })?;
    Ok(got["bytes"].as_u64().unwrap_or_default())
}

/// `GET /export/<票据>`：一次性的，取了就作废；给完删文件。
fn get(request: &Request<Incoming>, site: &Arc<Site>) -> Response<Body> {
    if request.method() != Method::GET {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    let ticket = request.uri().path().trim_start_matches("/export/");
    let Some(one) = site.exports.take(ticket) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let (file, size) = match std::fs::File::open(&one.file).and_then(|file| {
        let size = file.metadata()?.len();
        Ok((file, size))
    }) {
        Ok(opened) => opened,
        Err(error) => {
            tracing::warn!(target: TARGET, error = %error, "export not found");
            remove(&one.file);
            return empty(StatusCode::NOT_FOUND);
        }
    };
    let (out, frames) = mpsc::channel::<Result<Frame<Bytes>, io::Error>>(2);
    let stream = futures_util::stream::unfold(frames, |mut frames| async move {
        frames.recv().await.map(|frame| (frame, frames))
    });
    let mut response = Response::new(BodyExt::boxed(StreamBody::new(stream)));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    insert(headers, header::CONTENT_LENGTH, &size.to_string());
    insert(
        headers,
        header::CONTENT_DISPOSITION,
        &disposition(&one.name),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("sandbox; default-src 'none'"),
    );
    crate::serve::secure(headers);
    tokio::spawn(pour(
        tokio::fs::File::from_std(file),
        one.file,
        out,
        site.busy(),
    ));
    response
}

/// 一块块读给浏览器；读完、浏览器走了、读不下去都删文件（先关了再删：Windows 上开着的删不掉）。
async fn pour(
    mut file: tokio::fs::File,
    path: PathBuf,
    out: mpsc::Sender<Result<Frame<Bytes>, io::Error>>,
    _busy: Busy,
) {
    let mut buffer = vec![0u8; CHUNK];
    loop {
        match file.read(&mut buffer).await {
            Ok(0) => break,
            Ok(read) => {
                let frame = Frame::data(Bytes::copy_from_slice(&buffer[..read]));
                if out.send(Ok(frame)).await.is_err() {
                    // 浏览器走了：不再读。
                    break;
                }
            }
            Err(error) => {
                tracing::warn!(target: TARGET, error = %error, "export cut short");
                if out
                    .send(Err(io::Error::other("export cut short")))
                    .await
                    .is_err()
                {
                    // 浏览器已经走了。
                }
                break;
            }
        }
    }
    drop(file);
    remove(&path);
}

/// 页面自己发的：Origin 和 `http://` 加 Host 逐字一样（Host 在 `serve` 那里核对过；同 `/ticket`）。别的网站的页面带的是它自己的 Origin。
pub(crate) fn same_origin(headers: &HeaderMap) -> bool {
    let text = |name| headers.get(name).and_then(|value| value.to_str().ok());
    let origin = text(header::ORIGIN).and_then(|origin| origin.strip_prefix("http://"));
    matches!((text(header::HOST), origin), (Some(host), Some(origin)) if host == origin)
}

/// 正文：`session` 是字符串（照核心会话编号的写法：十六进制和 `-`，最多 64 个），`name`（存下来叫什么）可以不写。
async fn read_body(request: Request<Incoming>) -> Option<(String, Option<String>)> {
    let bytes = Limited::new(request.into_body(), crate::media::MOST_BODY)
        .collect()
        .await
        .ok()?
        .to_bytes();
    let body: Value = serde_json::from_slice(&bytes).ok()?;
    let session = body.get("session")?.as_str()?;
    let shaped = !session.is_empty()
        && session.len() <= 64
        && session
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-');
    if !shaped {
        return None;
    }
    let name = match body.get("name") {
        None | Some(Value::Null) => None,
        Some(Value::String(name)) => Some(name.clone()),
        Some(_) => return None,
    };
    Some((session.to_string(), name))
}

/// 存下来叫什么：页面给的名字（只留最后一段、去掉控制字符和前后空白，最多 [`NAME_MAX`] 个字），没给的、剩下空的照会话编号写
/// `miyu-<编号>`；后面接 `.zip`（已经有的不再接）。
pub(crate) fn file_name(name: Option<&str>, session: &str) -> String {
    let given: String = name
        .and_then(|name| name.rsplit(['/', '\\']).next())
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(NAME_MAX)
        .collect();
    let base = if given.is_empty() || given == "." || given == ".." {
        format!("miyu-{session}")
    } else {
        given
    };
    if base.to_ascii_lowercase().ends_with(".zip") {
        base
    } else {
        format!("{base}.zip")
    }
}

/// `Content-Disposition`：`filename="…"` 写 ASCII 的样子（别的字、`"`、`\`、`%` 换成 `_`），`filename*` 照 RFC 5987 写原样。
pub(crate) fn disposition(name: &str) -> String {
    let plain: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_graphic() && !matches!(c, '"' | '\\' | '%') || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!(
        "attachment; filename=\"{plain}\"; filename*=UTF-8''{}",
        crate::media::range::escape(name)
    )
}

/// 删一份：没有的不要紧，删不掉的记一行。
fn remove(file: &Path) {
    if let Err(error) = std::fs::remove_file(file)
        && error.kind() != io::ErrorKind::NotFound
    {
        tracing::warn!(target: TARGET, error = %error, "export not removed");
    }
}

/// 没成：`{"reason": 原因码, "error": 原话}`，不缓存。
fn failed(status: StatusCode, reason: &str, message: &str) -> Response<Body> {
    let mut response =
        crate::desk::json_reply(json!({"reason": reason, "error": message}).to_string());
    *response.status_mut() = status;
    response
}

#[cfg(test)]
mod tests;
