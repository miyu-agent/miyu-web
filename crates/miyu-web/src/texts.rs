//! `miyu web` 印给人看的字（`web-module.md`「给人看的字」第二张表，照核心设计 47「命令行文案」）：照核心握手回的 `language`，中文、英文。

/// 网址带着哪种凭据（提示照它说）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Carried {
    /// `--reset` 的一次性码。
    Reset,
    /// 交接票。
    Ticket,
}

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

    /// 交给了浏览器：结果行，带着整个网址（码、票也在里面，2026-10-29 项目主人要的）。
    pub(crate) fn opened(self, url: &str) -> String {
        self.pick(
            &format!("已在浏览器中打开：{url}"),
            &format!("opened in browser: {url}"),
        )
    }

    /// 交不给浏览器（没有图形界面这类）：网址已经印在上面。
    pub(crate) fn no_browser(self) -> String {
        self.pick(
            "miyu: 无法打开浏览器，请手动打开上面的地址",
            "miyu: cannot open a browser; open the address above",
        )
    }

    /// 网址带着的凭据怎么用：`--reset` 的一次性码、交接票。
    pub(crate) fn hint(self, carried: Carried) -> String {
        match carried {
            Carried::Reset => self.pick(
                "提示：打开后重设访问密码；链接 5 分钟内有效，只能用一次",
                "hint: reset the access password after opening; the link works once within 5 minutes",
            ),
            Carried::Ticket => self.pick(
                "提示：链接 60 秒内有效，只能用一次",
                "hint: the link works once within 60 seconds",
            ),
        }
    }

    /// 端口被占：报错一行、提示一行。
    pub(crate) fn port_in_use(self, port: &str) -> String {
        self.pick(
            &format!("miyu: 端口 {port} 已被占用\n提示：用 'miyu web --port <端口>' 换一个"),
            &format!(
                "miyu: port {port} is in use\nhint: pick another with 'miyu web --port <port>'"
            ),
        )
    }

    /// 网页软件起不来。
    pub(crate) fn not_started(self, reason: &str) -> String {
        self.pick(
            &format!("miyu: 无法启动网页界面：{reason}"),
            &format!("miyu: cannot start the web interface: {reason}"),
        )
    }

    /// 连不上核心。
    pub(crate) fn no_core(self, reason: &str) -> String {
        self.pick(
            &format!("miyu: 无法连接核心：{reason}"),
            &format!("miyu: cannot reach the core: {reason}"),
        )
    }

    /// 核心没在跑、要拉起它，主程序不在那里（打成包装进数据根的、核心没给 `MIYU_PROGRAM` 的）。
    pub(crate) fn no_program(self, path: &str) -> String {
        self.pick(
            &format!("miyu: 找不到主程序：{path}\n提示：用 'miyu web' 打开"),
            &format!("miyu: main program not found: {path}\nhint: open it with 'miyu web'"),
        )
    }

    /// `--logout` 的结果行。
    pub(crate) fn logged_out(self, count: u64) -> String {
        self.pick(
            &format!("已退出 {count} 个登录"),
            &format!("signed out {count} logins"),
        )
    }

    /// `--logout` 以后的提示。
    pub(crate) fn logout_hint(self) -> String {
        self.pick(
            "提示：浏览器需要重新输入访问密码",
            "hint: browsers must enter the access password again",
        )
    }
}
