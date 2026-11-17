//! 找不到数据根、连不上、拉不起核心时说的那一句（核心 EN-1、EN-2）：照底层错的说法（`said()`，内核的 `core/start/<代码>`）从核心
//! 的资源目录取整句，语言照这台机器的（同 `miyu-client` 的 `open::Core::connect`：`zh`、`ja` 开头的照它，别的英文）；取不到字的
//! （资源目录找不到、读不进来、没有这一句）照底层的原话。原话是中文，留给日志。

use std::fmt::Display;

use miyu_client::places::{Env, ResourceRoot};
use miyu_client::protocol::Said;
use miyu_client::texts::Human;

/// 照 `language` 说 `said`（字照 `env` 找资源目录），说不出的照 `error` 的原话。
pub(crate) fn spoken(env: &Env, language: &str, said: Option<Said>, error: &dyn Display) -> String {
    let words = match ResourceRoot::locate(env) {
        Ok(resources) => Human::load(&resources, language),
        // 找不到资源目录：没有字可取，照原话说
        Err(_) => return error.to_string(),
    };
    match words {
        Ok(words) => told(said, error, Some(&words)),
        // 读不进来：同上
        Err(_) => error.to_string(),
    }
}

/// 照 `words` 说 `said`，取不到的照 `error` 的原话。
fn told(said: Option<Said>, error: &dyn Display, words: Option<&Human>) -> String {
    said.and_then(|said| words?.say(&said))
        .unwrap_or_else(|| error.to_string())
}

/// 系统的语言 `locale` 读哪一份字。
pub(crate) fn language(locale: &str) -> &'static str {
    match locale {
        locale if locale.starts_with("zh") => "zh",
        locale if locale.starts_with("ja") => "ja",
        _ => "en",
    }
}

#[cfg(test)]
mod tests {
    use super::language;

    #[test]
    fn the_machine_language_picks_the_words() {
        assert_eq!(language("ja_JP.UTF-8"), "ja");
        assert_eq!(language("zh_CN.UTF-8"), "zh");
        assert_eq!(language("C"), "en");
        assert_eq!(language(""), "en");
    }
}
