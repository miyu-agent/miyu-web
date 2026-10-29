//! `miyu web` 印给人看的字（`web-module.md`「给人看的字」第二张表）：照核心握手回的 `language`，中文、英文。

/// 用哪种语言：`zh` 是中文，别的都是英文。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Language {
    Zh,
    En,
}

impl Language {
    /// 照握手回的 `language`。
    pub(crate) fn of(language: Option<&str>) -> Language {
        match language {
            Some("zh") => Language::Zh,
            _ => Language::En,
        }
    }

    /// 问不到核心时照这台机器的语言（`LC_ALL`、`LC_MESSAGES`、`LANG` 的头一个）：`zh` 打头的中文，别的英文。
    pub(crate) fn of_locale(locale: &str) -> Language {
        match locale.starts_with("zh") {
            true => Language::Zh,
            false => Language::En,
        }
    }

    fn pick(self, zh: &str, en: &str) -> String {
        match self {
            Language::Zh => zh.to_string(),
            Language::En => en.to_string(),
        }
    }

    /// 交给了浏览器。
    pub(crate) fn opened(self, url: &str) -> String {
        self.pick(
            &format!("网页开在 {url}，已经交给浏览器打开。"),
            &format!("The web UI is at {url} and has been opened in your browser."),
        )
    }

    /// 带着一次性码开的：浏览器没打开怎么办。
    pub(crate) fn print_hint(self) -> String {
        self.pick(
            "浏览器没打开的话，用 miyu web --print。",
            "If the browser did not open, use miyu web --print.",
        )
    }

    /// 第一次：还没设过密码。
    pub(crate) fn first(self) -> String {
        self.pick(
            "还没设过网页的登录密码：带着一次性码打开网页，在网页上设用户名和密码。",
            "No web password yet: opening the web UI with a one-time code to set a username and password.",
        )
    }

    /// `--print`。
    pub(crate) fn open_this(self, reset: bool) -> String {
        match reset {
            true => self.pick(
                "在浏览器里打开，重设用户名和密码：",
                "Open this in a browser to reset the username and password:",
            ),
            false => self.pick("在浏览器里打开：", "Open this in a browser:"),
        }
    }

    /// `--print` 带了码的提醒。
    pub(crate) fn code_warning(self) -> String {
        self.pick(
            "这个链接 5 分钟内有效，只能用一次，别发给别人。",
            "This link works once within 5 minutes. Do not share it.",
        )
    }

    /// `--print` 带了交接票的提醒（网页-乙）。
    pub(crate) fn ticket_warning(self) -> String {
        self.pick(
            "这个链接 60 秒内有效，只能用一次，别发给别人。",
            "This link works once within 60 seconds. Do not share it.",
        )
    }

    /// 端口被占。
    pub(crate) fn port_in_use(self, port: &str) -> String {
        self.pick(
            &format!("端口 {port} 被占了。换一个：miyu web --port <端口>"),
            &format!("Port {port} is in use. Pick another: miyu web --port <port>"),
        )
    }

    /// 网页软件起不来。
    pub(crate) fn not_started(self, reason: &str) -> String {
        self.pick(
            &format!("网页软件起不来：{reason}"),
            &format!("The web UI could not start: {reason}"),
        )
    }

    /// 连不上核心。
    pub(crate) fn no_core(self, reason: &str) -> String {
        self.pick(
            &format!("连不上核心：{reason}"),
            &format!("Could not reach the core: {reason}"),
        )
    }

    /// 核心没在跑、要拉起它，主程序不在那里（打成包装进数据根的、核心没给 `MIYU_PROGRAM` 的）。
    pub(crate) fn no_program(self, path: &str) -> String {
        self.pick(
            &format!("找不到主程序 miyu（{path}）：用 miyu web 打开网页，或者把 miyu-web 放在 miyu 旁边。"),
            &format!(
                "Could not find the main program miyu ({path}): open the web UI with miyu web, or put miyu-web next to miyu."
            ),
        )
    }

    /// `--logout`。
    pub(crate) fn logged_out(self, count: u64) -> String {
        self.pick(
            &format!("作废了 {count} 个登录，浏览器要用密码再登一次。"),
            &format!(
                "Signed out {count} logins; browsers need to sign in with the password again."
            ),
        )
    }
}
