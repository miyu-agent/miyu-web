//! 找不到数据根、连不上、拉不起核心时给人看的那一句（核心 EN-1、EN-2）：照底层错的说法（`said()`，内核的 `core/start/<代码>`）从
//! 核心的资源目录取整句，语言照这台机器的（同 `miyu-client` 的 `open::Core::connect`：`zh`、`ja` 开头的照它，别的英文）；取不到字的
//! （资源目录找不到、读不进来、没有这一句）照底层的原话。原话是中文，留给日志。`/ws` 的 `web.error`、网页软件找数据根都经它；
//! 演示的桥另有一份（`web-demo/bridge/src/said.rs`，桥不进这个工作区）。

use std::fmt::Display;

use miyu_client::places::{DataRoot, Env, ResourceRoot};
use miyu_client::protocol::Said;
use miyu_client::texts::Human;

/// 照这台机器（[`Env::current`]、`locale`）说 `said`，说不出的照 `error` 的原话。
#[must_use]
pub fn spoken(said: Option<Said>, error: &dyn Display) -> String {
    spoken_in(
        &Env::current(),
        language(&miyu_client::open::locale()),
        said,
        error,
    )
}

/// 照 `language` 说 `said`（字照 `env` 找资源目录），说不出的照 `error` 的原话。
#[must_use]
pub fn spoken_in(env: &Env, language: &str, said: Option<Said>, error: &dyn Display) -> String {
    let words = ResourceRoot::locate(env)
        .ok()
        .and_then(|resources| Human::load(&resources, language).ok());
    said.and_then(|said| words?.say(&said))
        .unwrap_or_else(|| error.to_string())
}

/// 照 `env` 找数据根、建好骨架。
///
/// # Errors
///
/// 找不到、建不了：给人看的那一句，照 `language` 说（[`spoken_in`]）。
pub fn data_root(env: &Env, language: &str) -> Result<DataRoot, String> {
    let root = DataRoot::locate(env).map_err(|e| spoken_in(env, language, Some(e.said()), &e))?;
    root.prepare()
        .map_err(|e| spoken_in(env, language, e.said(), &e))?;
    Ok(root)
}

/// 系统的语言 `locale` 读哪一份字。
#[must_use]
pub fn language(locale: &str) -> &'static str {
    match locale {
        locale if locale.starts_with("zh") => "zh",
        locale if locale.starts_with("ja") => "ja",
        _ => "en",
    }
}

#[cfg(test)]
mod tests;
