//! 网页外观（`web-ui.md`「怎么走」第六条；核心 TH-1，`packages.md`「外观包」）：外观包的 `[theme.web] dir` 是一个普通的网页包，
//! 页面照内置的包那样加载它（清单、`index.js`、样式、字体、图都照相对地址取）。页面带登录令牌 `POST /theme` 换一张票据，
//! `GET /t/<票据>/<包>/<路径>` 拿网页目录里的一份文件：网页软件在路径前面接上网页目录，照 `package.file` 一块块给（同软件后台页，
//! `backstage::stream`）。和后台页不同，这些文件是页面自己加载、同源跑的（项目主人 2026-11-02 定：外观包的脚本不设限、不问），
//! 响应头照页面的内容安全策略，不放进框里。

#[cfg(test)]
mod tests;

use std::net::IpAddr;
use std::sync::Arc;

use hyper::body::Incoming;
use hyper::{Method, Request, Response, StatusCode};
use serde_json::{Value, json};

use crate::backstage::{self, Kind, Page, valid_package};
use crate::media::bearer;
use crate::media::tickets::{self, Owned};
use crate::serve::{Body, Site, empty};

/// 一张外观票据管的：谁换的、哪个包（读文件照它），网页目录在包里的哪。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Theme {
    page: Page,
    /// `[theme.web] dir`：包目录里的相对目录，换票据时照 `package.list` 记下。
    dir: String,
}

impl Owned for Theme {
    fn login(&self) -> &str {
        self.page.login()
    }
}

/// `POST /theme`：这个包带网页外观的，换一张票据，回 `{"url": "/t/<票据>/<包>/"}`。
pub(crate) async fn post(
    request: Request<Incoming>,
    site: Arc<Site>,
    remote: Option<IpAddr>,
) -> Response<Body> {
    if request.method() != Method::POST {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    let Some(login) = bearer(&request) else {
        return empty(StatusCode::UNAUTHORIZED);
    };
    let Some(package) = backstage::read_body(request).await else {
        return empty(StatusCode::BAD_REQUEST);
    };
    let listed = match backstage::ask(&site, &login, remote, "package.list", json!({})).await {
        Ok(listed) => listed,
        Err(failed) => return backstage::refused(&site, &login, &failed),
    };
    let Some(dir) = web_dir(&listed, &package) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let mut fresh = tickets::fresh();
    let ticket = site.backstage.themes().issue(
        Theme {
            page: Page::new(login, package.clone(), remote),
            dir,
        },
        || fresh.take().unwrap_or_default(),
    );
    backstage::issued(&ticket, &format!("/t/{ticket}/{package}/"))
}

/// `GET /t/<票据>/<包>/<路径>`：照票据给这个包网页目录里的一份文件。
pub(crate) async fn get(
    request: Request<Incoming>,
    site: Arc<Site>,
    remote: Option<IpAddr>,
) -> Response<Body> {
    let busy = site.busy();
    if request.method() != Method::GET {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    let Some((ticket, package, file)) = split(request.uri().path()) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let Some(theme) = site.backstage.themes().find(&ticket) else {
        return empty(StatusCode::NOT_FOUND);
    };
    if theme.page.package() != package {
        return empty(StatusCode::NOT_FOUND);
    }
    let Some(file) = file else {
        return empty(StatusCode::BAD_REQUEST);
    };
    let remote = remote.or(theme.page.remote());
    let login = theme.page.login().to_string();
    let path = format!("{}/{file}", theme.dir);
    backstage::stream(site, theme.page, remote, path, Kind::Theme, busy)
        .await
        .unwrap_or_else(|(site, failed)| backstage::refused(&site, &login, &failed))
}

/// `package.list` 里这个包的网页目录（`theme.web.dir`，去掉结尾的 `/`）；没有这个包、没带网页外观的是空的。
fn web_dir(listed: &Value, package: &str) -> Option<String> {
    let row = listed["packages"]
        .as_array()?
        .iter()
        .find(|row| row["package"] == json!(package))?;
    let dir = row["theme"]["web"]["dir"].as_str()?.trim_end_matches('/');
    (!dir.is_empty()).then(|| dir.to_string())
}

/// `/t/<票据>/<包>/<路径>` 拆成三段，路径的 `%xx` 换回来。票据、包不对的（解不开的也算）是空的；路径不收的（空的、以 `/`
/// 开头或结尾、有空段、`.`、`..`、`\`、`:`、控制字符）第三段是空的：接在网页目录后面不能走出它，核心另照真实路径查一遍。
fn split(path: &str) -> Option<(String, String, Option<String>)> {
    let rest = path.strip_prefix("/t/")?;
    let (ticket, rest) = rest.split_once('/')?;
    let (package, file) = rest.split_once('/').unwrap_or((rest, ""));
    if ticket.is_empty() || !valid_package(package) {
        return None;
    }
    let file = miyu_webserve::pages::decode(file)?;
    let good = !file.is_empty()
        && file.split('/').all(|segment| {
            !segment.is_empty()
                && segment != "."
                && segment != ".."
                && !segment.contains(['\\', ':'])
                && !segment.chars().any(char::is_control)
        });
    Some((
        ticket.to_string(),
        package.to_string(),
        good.then_some(file),
    ))
}
