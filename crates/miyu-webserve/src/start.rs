//! `/ws` 怎么连核心（核心 CS-5，`connection.md`「头怎么拉起核心」；`web-ui.md`「怎么走」第一条第 7 款）：页面刚打开、点了「启动」的是人要用，
//! 照 `connect_or_start_bare` 连，核心没在跑就拉起来；页面断线以后自己重连的在地址上带 `again=1`，照 `reconnect_or_start_bare` 连：
//! 人停的核心（`miyu core stop`、托盘的「退出」）不拉起，回一条带 `reason: "stopped_by_user"` 的 `web.error`，页面出「核心已停止」
//! 的卡和「启动」。崩了、空闲退出的照旧拉起。两样都不读本机令牌。

use miyu_client::connect::{Connection, StartError};
use miyu_client::protocol::Said;

use crate::Site;

/// 地址上的这一段说「这是页面断线以后自己重连」。
const AGAIN: &str = "again=1";

/// `/ws` 的查询串里有没有 `again=1` 那一段（别的段照旧不看）。
#[must_use]
pub fn again(query: Option<&str>) -> bool {
    query.is_some_and(|query| query.split('&').any(|part| part == AGAIN))
}

/// 连核心：`again`（页面自己重连）的人停的不拉起，别的没在跑就拉起来。
///
/// # Errors
///
/// 连不上、拉不起来；`again` 的、核心是人停的是 [`StartError::StoppedByUser`]。
pub async fn core<S: Site>(site: &S, again: bool) -> Result<Connection, StartError> {
    let start = || (site.core())();
    match again {
        true => miyu_client::connect::reconnect_or_start_bare(site.root(), start).await,
        false => miyu_client::connect::connect_or_start_bare(site.root(), start).await,
    }
}

/// 连不上、拉不起核心时推给页面的那一条 `web.error`：原因照 `speak` 说（[`crate::said::spoken`]：核心那一整句，照这台机器的语言）；
/// 人停的（[`StartError::StoppedByUser`]）多一格 `reason: "stopped_by_user"`，页面照它出「核心已停止」的卡。
pub(crate) fn unreachable(
    error: &StartError,
    speak: impl Fn(Option<Said>, &dyn std::fmt::Display) -> String,
) -> serde_json::Value {
    let mut params = serde_json::json!({"message": speak(error.said(), error)});
    if matches!(error, StartError::StoppedByUser) {
        params["reason"] = serde_json::json!("stopped_by_user");
    }
    serde_json::json!({"jsonrpc": "2.0", "method": "web.error", "params": params})
}
