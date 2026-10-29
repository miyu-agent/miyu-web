//! `miyu-web open`（`web-module.md`「怎么走」第十一条）：`miyu web` 把参数交到这里。
//!
//! 1. 照终端的样子连核心（出示本机令牌，没在跑就拉起来），握手拿到人的语言。
//! 2. `--logout`：`account.logout`、`all: true`，说作废了几个，不碰网页软件。
//! 3. 网页软件没在跑（`run/web.lock` 没人拿着、没有 `run/web`）就拉起 `serve`，等那一行最多 10 秒。
//! 4. 问一次 `account.setup_code`：写了 `--reset` 的、还没设过密码的（`first`），网址带 `#setup=<一次性码>`；别的要一张交接票
//!    （`login.ticket`，核心 LT-1），网址带 `#ticket=<票>`（im 设计 07 第 3.6 节、网页-乙；SU-1 起不带账号），页面存着设备令牌的照它、
//!    没有的拿票连上；旧核心要不到票的网址就是地址本身（要了没用的码 5 分钟后自己作废）。
//! 5. `--print`、交不给浏览器的：印网址（带了码、票的另印一句提醒）。别的交给浏览器打开：带凭据的不直接交（交出去的参数进进程
//!    列表），写一个只给本人的跳转页（[`jump`]），交它的 `file://` 地址，再拉起 `miyu-web forget` 过一会儿删掉它。
//!
//! 网址印在标准输出上（脚本能拿）；别的话印在标准错误上。照终端的样子连核心、开浏览器这两样在 `miyu-webserve`（施工
//! O-16，`webserve.md`「搬家表」）。

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde_json::json;

use miyu_client::connect::Ready;
use miyu_client::open::Core;
pub use miyu_client::open::{Browser, SystemBrowser};
use miyu_client::places::DataRoot;

use crate::serve::{CoreCommand, address, running};
use crate::texts::Language;

/// `open` 的参数。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Open {
    /// 网页软件没在跑时，这一次在哪个端口上听。
    pub port: Option<u16>,
    /// 不开浏览器，印网址。
    pub print: bool,
    /// `--format json`：给程序读（桌面端的外壳），标准输出只印一行 `{"url", "first"}`，人看的字不印；带了它就当 [`Open::print`]。
    pub json: bool,
    /// 忘了密码：要一个一次性码重设。
    pub reset: bool,
    /// 作废全部浏览器的登录。
    pub logout: bool,
    /// 打开时直接到「软件后台」里这个软件的页面（`--package <编号>`，施工 F-6 下）：网址 `#` 后面多一个 `package=<编号>`。
    pub package: Option<String>,
}

/// 怎么拉起东西：`serve`、核心。
pub struct Launch {
    /// 拉起网页软件：自己加 `serve`，`port` 是 `--port`。
    pub serve: Box<dyn Fn(Option<u16>) -> Command + Send + Sync>,
    /// 拉起核心：主程序加 `core`。
    pub core: CoreCommand,
    /// 过一会儿删掉一个跳转页：自己加 `forget <跳转页>`（跟终端脱开、不等它）。
    pub forget: Box<dyn Fn(&Path) -> Command + Send + Sync>,
}

/// 跳转页放在 `run/` 下的哪个目录（`web-ui.md`「怎么走」第二条第 4 款）。
pub const JUMPS: &str = "open";

/// 放了多久的跳转页下一次 `open` 顺手删掉（`forget` 没跑完的兜底）。
const STALE: Duration = Duration::from_secs(120);

/// 照 `open` 走一遍，交回退出码。
pub async fn open(
    root: &DataRoot,
    open: &Open,
    launch: &Launch,
    browser: &dyn Browser,
    out: &mut dyn Write,
    err: &mut dyn Write,
) -> u8 {
    let mut core = match Core::connect(root, &launch.core, "miyu-web").await {
        Ok(core) => core,
        Err(reason) => {
            // 问不到核心的语言：照这台机器的；主程序不在那里的说清楚是哪个，不接底下的原话
            let language = Language::of_locale(&miyu_client::open::locale());
            let program = PathBuf::from((launch.core)().get_program());
            let said = match program.is_absolute() && !program.exists() {
                true => language.no_program(&program.display().to_string()),
                false => language.no_core(&reason.to_string()),
            };
            say(err, &said);
            return 1;
        }
    };
    let language = Language::of(core.language());
    if open.logout {
        return match core
            .call("logout", "account.logout", json!({"all": true}))
            .await
        {
            Ok(result) => {
                let count = result["revoked"].as_u64().unwrap_or(0);
                say(err, &language.logged_out(count));
                0
            }
            Err(reason) => {
                say(err, &language.no_core(&reason.to_string()));
                1
            }
        };
    }
    let site = match ensure(root, open.port, launch).await {
        Ok(site) => site,
        Err(Started::PortInUse(port)) => {
            say(err, &language.port_in_use(&port));
            return 1;
        }
        Err(Started::Failed(reason)) => {
            say(err, &language.not_started(&reason));
            return 1;
        }
    };
    let issued = match core.call("code", "account.setup_code", json!({})).await {
        Ok(issued) => issued,
        Err(reason) => {
            say(err, &language.no_core(&reason.to_string()));
            return 1;
        }
    };
    let first = issued["first"].as_bool().unwrap_or(false);
    let code = issued["code"]
        .as_str()
        .filter(|_| open.reset || first)
        .map(str::to_string);
    // 不带码的要一张交接票（网页-乙）：旧核心没有 `login.ticket`、回应没有 `account` 的不带
    let ticket = match code {
        Some(_) => None,
        None => core
            .call("ticket", "login.ticket", json!({}))
            .await
            .ok()
            .and_then(|got| {
                got["ticket"]
                    .as_str()
                    .filter(|t| hex(t))
                    .map(str::to_string)
            }),
    };
    let url = address_of(
        &site,
        code.as_deref(),
        ticket.as_deref(),
        open.package.as_deref(),
    );
    let secret = code.is_some() || ticket.is_some();
    if open.json {
        say(out, &json!({"url": url, "first": first}).to_string());
        return 0;
    }
    if !open.print && hand(root, &url, secret, launch, browser) {
        if first && !open.reset {
            say(err, &language.first());
        }
        say(err, &language.opened(&site));
        if secret {
            say(err, &language.print_hint());
        }
        return 0;
    }
    say(err, &language.open_this(open.reset));
    say(out, &url);
    if code.is_some() {
        say(err, &language.code_warning());
    } else if ticket.is_some() {
        say(err, &language.ticket_warning());
    }
    0
}

/// 交给浏览器：带凭据的（`secret`）写跳转页、交它的地址、拉起 `forget`；写不了跳转页的不交（照 `--print` 办）。交回交没交出去。
fn hand(root: &DataRoot, url: &str, secret: bool, launch: &Launch, browser: &dyn Browser) -> bool {
    if !secret {
        return browser.open(url);
    }
    let Ok(page) = jump(root, url) else {
        return false;
    };
    let opened = browser.open(&file_url(&page));
    let mut forget = (launch.forget)(&page);
    forget
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // 跟终端脱开：关了终端也照样删
        forget.process_group(0);
    }
    if forget.spawn().is_err() {
        // 拉不起来：下一次 `open` 顺手删（[`STALE`]）。
    }
    opened
}

/// 写一个跳转页（im 设计 07 第 3.6 节）：`run/open/<16 个随机字节的十六进制>.html`，只给本人（Unix 上目录 0700、文件 0600；Windows 上
/// 数据根在本人的用户目录下，同本机令牌），里面用 `location.replace` 跳到 `url`，不留历史、不带 Referer。先删掉放久了的。
///
/// # Errors
///
/// 建不了目录、写不了文件、拿不到随机数。
pub fn jump(root: &DataRoot, url: &str) -> std::io::Result<PathBuf> {
    let dir = root.run().join(JUMPS);
    private_dir(&dir)?;
    sweep(&dir);
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(std::io::Error::other)?;
    let name: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let path = dir.join(format!("{name}.html"));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path)?;
    // 网址写成 JS 的字符串；`</` 拆开，不会提前收掉 `<script>`
    let quoted = serde_json::to_string(url)
        .map_err(std::io::Error::other)?
        .replace("</", "<\\/");
    file.write_all(
        format!(
            "<!doctype html><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>Miyu</title><script>location.replace({quoted});</script>\n"
        )
        .as_bytes(),
    )?;
    Ok(path)
}

/// 删掉 `dir` 里放了 [`STALE`] 以上的跳转页。
fn sweep(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let old = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|at| at.elapsed().ok())
            .is_some_and(|age| age > STALE);
        if old && is_jump(&entry.path()) && std::fs::remove_file(entry.path()).is_err() {
            // 删不掉：下一次再删。
        }
    }
}

/// 只给本人的目录：没有的建，有的把权限收回到只给本人（Unix）。
fn private_dir(dir: &Path) -> std::io::Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

/// 是不是一个跳转页（`forget` 只删这种）：名字是 32 位十六进制加 `.html`。
pub fn is_jump(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_suffix(".html"))
        .is_some_and(|stem| stem.len() == 32 && hex(stem))
}

/// `miyu-web forget <跳转页>`：过 `after` 删掉它；只删 `run/open/` 里的跳转页，别的不碰。
pub fn forget(root: &DataRoot, page: &Path, after: Duration) {
    let inside = page
        .parent()
        .zip(std::fs::canonicalize(root.run().join(JUMPS)).ok())
        .is_some_and(|(parent, dir)| {
            std::fs::canonicalize(parent).is_ok_and(|parent| parent == dir)
        });
    if !inside || !is_jump(page) {
        return;
    }
    std::thread::sleep(after);
    if std::fs::remove_file(page).is_err() {
        // 已经没了、删不掉：下一次 `open` 顺手删。
    }
}

/// 文件的 `file://` 地址：路径里字母、数字和 `-._~/` 以外的照 UTF-8 写成 `%XX`；Windows 的 `\` 换成 `/`、盘符前面多一个 `/`。
fn file_url(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    let text = if text.starts_with('/') {
        text
    } else {
        format!("/{text}")
    };
    let mut url = String::from("file://");
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                url.push(char::from(byte))
            }
            _ => url.push_str(&format!("%{byte:02X}")),
        }
    }
    url
}

/// 是不是十六进制（票、跳转页的名字）。
fn hex(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|b| b.is_ascii_hexdigit())
}

/// 交给浏览器的网址：`#` 后面是一次性码（`setup=`）或者交接票（`ticket=<票>`；SU-1 起不带账号）、点名的软件后台页（`package=`），
/// 都没有的不带 `#`。
fn address_of(
    site: &str,
    code: Option<&str>,
    ticket: Option<&str>,
    package: Option<&str>,
) -> String {
    let parts: Vec<String> = [
        code.map(|code| format!("setup={code}")),
        ticket.map(|ticket| format!("ticket={ticket}")),
        package.map(|package| format!("package={package}")),
    ]
    .into_iter()
    .flatten()
    .collect();
    match parts.is_empty() {
        true => format!("{site}/"),
        false => format!("{site}/#{}", parts.join("&")),
    }
}

/// 印一行；印不出来也没有别处可说了。
fn say(to: &mut dyn Write, line: &str) {
    if writeln!(to, "{line}").is_err() {
        // 标准输出、标准错误关了：没有别处可说。
    }
}

/// 网页软件为什么没起来。
enum Started {
    /// 端口被占了：哪一个。
    PortInUse(String),
    /// 别的：原话。
    Failed(String),
}

/// 确保网页软件在跑：交回它的地址。
async fn ensure(root: &DataRoot, port: Option<u16>, launch: &Launch) -> Result<String, Started> {
    if running(root)
        && let Some(site) = address(root)
    {
        return Ok(site);
    }
    match miyu_client::connect::spawn_detached((launch.serve)(port), root.path()).await {
        Ok(Ready::Ready | Ready::Running) => {}
        Ok(Ready::Failed(reason)) => {
            return Err(
                match reason
                    .strip_prefix("port ")
                    .and_then(|rest| rest.strip_suffix(" in use"))
                {
                    Some(port) => Started::PortInUse(port.to_string()),
                    None => Started::Failed(reason),
                },
            );
        }
        Err(error) => return Err(Started::Failed(error.to_string())),
    }
    // 别人刚拉起的（`running`）可能还没写好地址：等一会儿。只能问（设计 00「避免轮询」写明的例外）：那一个不是这里拉起的，没有管子
    // 可等；每 50 毫秒看一次，最多 10 秒，只在打开时。
    for _ in 0..200 {
        if let Some(site) = address(root) {
            return Ok(site);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Err(Started::Failed(format!(
        "run/{} not written",
        crate::serve::ADDRESS
    )))
}
