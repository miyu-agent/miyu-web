//! `miyu web` 的参数和帮助页（`web-ui.md`「怎么走」第二条第 1 款，核心 CL-7 起 `miyu web` 是网页包自己带的命令，转交过来是
//! `miyu-web open …`）：读参数；`-h`、`--help` 印帮助页；写错了照核心设计 47「命令行文案」说哪里不对、提示看帮助。印帮助、说用法
//! 不连核心，语言照这台机器的（同核心的帮助页）。

use crate::open::Open;
use crate::texts::Language;

/// `open` 的参数读出来是什么。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Parsed {
    /// 照这些去开。
    Open(Open),
    /// 有 `-h`、`--help`：印帮助，别的参数不管。
    Help,
}

/// 参数哪里不对。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Bad {
    /// 不认识的选项。
    Unknown(String),
    /// 选项后面少了值。
    Missing(&'static str),
    /// 选项的值不对：哪个选项、写的什么。
    Value(&'static str, String),
    /// `--ticket` 和 `--reset` 一起写。
    TicketWithReset,
}

/// 读 `open` 的参数：`--port <端口>`、`--print`、`--format text|json`（`json` 当 `--print`）、`--ticket`（和 `--reset` 不一起写）、
/// `--reset`、`--logout`、`--package <编号>`（编号的写法不对的不认）；哪里有 `-h`、`--help` 都是印帮助。
///
/// # Errors
///
/// 不认识的选项、少了值、值不对、`--ticket` 和 `--reset` 一起写，交回 [`Bad`]。
pub fn parse(args: &[String]) -> Result<Parsed, Bad> {
    if args.iter().any(|arg| arg == "-h" || arg == "--help") {
        return Ok(Parsed::Help);
    }
    let mut open = Open::default();
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        let mut value = |name: &'static str| args.next().cloned().ok_or(Bad::Missing(name));
        match arg.as_str() {
            "--port" => {
                let port = value("--port")?;
                open.port = Some(port.parse().map_err(|_| Bad::Value("--port", port))?);
            }
            "--print" => open.print = true,
            "--format" => match value("--format")?.as_str() {
                "json" => open.json = true,
                "text" => open.json = false,
                other => return Err(Bad::Value("--format", other.to_string())),
            },
            "--reset" => open.reset = true,
            "--ticket" => open.ticket = true,
            "--logout" => open.logout = true,
            "--package" => {
                let id = value("--package")?;
                if !crate::backstage::valid_package(&id) {
                    return Err(Bad::Value("--package", id));
                }
                open.package = Some(id);
            }
            other => return Err(Bad::Unknown(other.to_string())),
        }
    }
    match open.ticket && open.reset {
        true => Err(Bad::TicketWithReset),
        false => Ok(Parsed::Open(open)),
    }
}

/// 帮助页，照 `locale`（`LC_ALL`、`LC_MESSAGES`、`LANG` 的头一个）挑中文、英文；以一个换行结尾。
pub fn page(locale: &str) -> &'static str {
    match Language::of_locale(locale) {
        Language::Zh => include_str!("help/zh.txt"),
        Language::En => include_str!("help/en.txt"),
    }
}

/// 参数不对：报错一行、提示一行（看帮助），照 `locale` 挑语言。
pub fn bad(locale: &str, bad: &Bad) -> String {
    let language = Language::of_locale(locale);
    let zh = matches!(language, Language::Zh);
    let said = match (bad, zh) {
        (Bad::Unknown(arg), true) => format!("miyu: 未知选项 '{arg}'"),
        (Bad::Unknown(arg), false) => format!("miyu: unknown option '{arg}'"),
        (Bad::Missing(name), true) => format!("miyu: 选项 '{name}' 缺少值"),
        (Bad::Missing(name), false) => format!("miyu: option '{name}' needs a value"),
        (Bad::Value(name, value), true) => format!("miyu: 选项 '{name}' 的值无效：'{value}'"),
        (Bad::Value(name, value), false) => format!("miyu: invalid value '{value}' for '{name}'"),
        (Bad::TicketWithReset, true) => "miyu: '--ticket' 不能和 '--reset' 一起使用".to_string(),
        (Bad::TicketWithReset, false) => {
            "miyu: '--ticket' cannot be used with '--reset'".to_string()
        }
    };
    let hint = match zh {
        true => "提示：运行 'miyu web --help' 查看用法",
        false => "hint: run 'miyu web --help' for usage",
    };
    format!("{said}\n{hint}")
}

#[cfg(test)]
mod tests;
