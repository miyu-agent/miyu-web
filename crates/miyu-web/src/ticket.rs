//! `/ticket`（`web-ui.md`「怎么走」第一条第 12 款；2026-11-03 项目主人：本机就不要凭证了，W-1089）：这台电脑上的浏览器直接打开
//! `http://127.0.0.1:<端口>/`、手里没有凭据的（没登录过、令牌作废了），页面先 `POST /ticket` 要一张交接票，照 `#ticket=` 的路子握手。
//! 原来要输访问密码，刚装好、没设过密码的人走不下去。
//!
//! - 只给这台电脑上的浏览器（[`local`]，同一天 core1 提的几道防护）：对端是回环、不带反向代理加的头；Host 只认本机的三种写法、端口是
//!   在听的那个（听局域网时 `serve` 多认的 IP 写法这里不认：挡 DNS 重绑定）；Origin 要有、和 `http://` 加 Host 逐字一样；带
//!   `X-Miyu-Local: 1`；`Content-Type` 不是表单的三种。不是的一律 403，不说为什么。别的网站的页面带不了这个头（要先预检，网页软件不答），
//!   发表单又带不上这个头、Origin 也是它自己的。
//! - 认了的照 `miyu web` 那样（`open`）出示本机令牌连核心（没在跑就拉起来），`login.ticket` 要一张（核心的规矩：60 秒、一次性），
//!   回 `{"ticket"}`。连不上核心、要不到的（旧核心没有 `login.ticket`）回 503 和 `{"error"}`，页面退回「输入访问密码」。
//! - 取舍（项目主人知道）：同一台电脑上别的系统用户开浏览器也能进；局域网、同机反向代理转进来的照旧要访问密码。
//! - 票不进日志，网页软件不记它。

use std::net::IpAddr;
use std::sync::Arc;

use hyper::body::Incoming;
use hyper::header::{self, HeaderMap};
use hyper::{Method, Request, Response, StatusCode};
use serde_json::{Value, json};

use crate::TARGET;
use crate::serve::{Body, Site, empty};
use miyu_webserve::Site as _;

/// 页面要票时带的头：带了它的跨站请求浏览器要先预检，网页软件不答，就发不出来。
pub(crate) const LOCAL_HEADER: &str = "x-miyu-local";

/// 跨站表单能直接发的几种正文（不用预检）：带着的一律不认。
const FORM_TYPES: [&str; 3] = [
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/plain",
];

/// `POST /ticket`：`remote` 是从别的机器来的（对端不是回环，或者带着反向代理的头）那个地址，本机的是空的。
pub(crate) async fn post(
    request: Request<Incoming>,
    site: Arc<Site>,
    remote: Option<IpAddr>,
) -> Response<Body> {
    if request.method() != Method::POST {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    if remote.is_some() || !local(&site.hosts(), request.headers()) {
        tracing::warn!(target: TARGET, remote = remote.is_some(), "ticket refused");
        return empty(StatusCode::FORBIDDEN);
    }
    match issue(&site).await {
        Ok(ticket) => reply(StatusCode::OK, json!({ "ticket": ticket })),
        Err(error) => {
            tracing::warn!(target: TARGET, error = %error, "ticket unavailable");
            reply(StatusCode::SERVICE_UNAVAILABLE, json!({ "error": error }))
        }
    }
}

/// 请求头像不像这台电脑上的页面自己发的：Host 是 `hosts`（本机的三种写法，在听的端口）之一；Origin 和 `http://` 加 Host 逐字一样；
/// 带 `X-Miyu-Local: 1`；`Content-Type` 不是 [`FORM_TYPES`]。对端是不是回环由调用的看。
pub(crate) fn local(hosts: &[String], headers: &HeaderMap) -> bool {
    let text = |name| headers.get(name).and_then(|value| value.to_str().ok());
    let Some(host) = text(header::HOST).filter(|host| {
        hosts
            .iter()
            .any(|allowed| allowed.eq_ignore_ascii_case(host))
    }) else {
        return false;
    };
    let origin = text(header::ORIGIN).and_then(|origin| origin.strip_prefix("http://"));
    let marked = headers
        .get(LOCAL_HEADER)
        .is_some_and(|value| value.as_bytes() == b"1");
    let form = text(header::CONTENT_TYPE).is_some_and(|kind| {
        let kind = kind.split(';').next().unwrap_or_default().trim();
        FORM_TYPES
            .iter()
            .any(|form| form.eq_ignore_ascii_case(kind))
    });
    origin == Some(host) && marked && !form
}

/// 照 `miyu web` 那样出示本机令牌连核心（没在跑就拉起来），要一张交接票；票的写法同 `open`（十六进制）。
async fn issue(site: &Site) -> Result<String, String> {
    let mut core = miyu_client::open::Core::connect(&site.root, &site.core, "miyu-web")
        .await
        .map_err(|refused| refused.message)?;
    let got = core
        .call("ticket", "login.ticket", json!({}))
        .await
        .map_err(|refused| refused.message)?;
    // 旧核心没有 `login.ticket`：同 `open`，当要不到
    got["ticket"]
        .as_str()
        .filter(|ticket| crate::open::hex(ticket))
        .map(str::to_string)
        .ok_or_else(|| "no ticket".to_string())
}

/// 一段 JSON 的回应，不缓存（`desk::json_reply`），状态码照给的。
fn reply(status: StatusCode, body: Value) -> Response<Body> {
    let mut response = crate::desk::json_reply(body.to_string());
    *response.status_mut() = status;
    response
}

#[cfg(test)]
mod tests;
