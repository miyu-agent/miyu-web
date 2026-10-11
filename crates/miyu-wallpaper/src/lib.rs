//! 读这台电脑现在的桌面壁纸（蓝图 `web.md`「主题」的「跟着人格的外观」第 5 条）：主题「跟随壁纸」从它取色。浏览器读不到桌面，由和桌面在
//! 同一台机器上的网页服务（现在是演示的桥 `web-demo/bridge`）问这里，再把图交给页面。
//!
//! 照各家桌面找（[`find`]，先后见 `probe.rs`）：
//! - Linux：KDE Plasma 的配置文件、GNOME 的 `gsettings`（深色照 `picture-uri-dark`）、awww 和 swww 的 `query`、Hyprland 的
//!   `hyprctl hyprpaper listactive`；
//! - macOS：`osascript` 问 System Events（第一次会问要不要允许控制它，不允许的就是读不到）；
//! - Windows：注册表 `HKCU\Control Panel\Desktop` 的 `WallPaper`。
//!
//! 找到的还要是浏览器认得的图（照文件开头几个字节认：PNG、JPEG、WebP、GIF、BMP、AVIF），不是的（macOS 的 HEIC、视频壁纸）当读不到。
//! 只用标准库；跑的命令都有时限（[`TIMEOUT`]），没装、没在跑、出错退出的当这一家没有，接着问下一家。读各家回答的纯函数在 [`parse`]
//! （每个平台上都编、都测）。

pub mod parse;
mod probe;
#[cfg(test)]
mod tests;

use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// 跑一条命令最多等多久：壁纸程序卡住了也不能把页面的请求挂着。
pub const TIMEOUT: Duration = Duration::from_secs(2);

/// 壁纸最大多大：再大的不读（8K 的 PNG 也到不了）。
pub const MAX_BYTES: u64 = 64 * 1024 * 1024;

/// 找到的壁纸。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Wallpaper {
    /// 图的绝对路径。
    pub path: PathBuf,
    /// 照哪一家找到的（`kde`、`gnome`、`awww`、`swww`、`hyprpaper`、`macos`、`windows`），排查用。
    pub from: &'static str,
    /// 媒体类型（照文件开头认的）。
    pub mime: &'static str,
}

impl Wallpaper {
    /// 换没换的记号：路径、大小、改动时间合成一串；同一张图没动过的一样（只在这一个进程里比）。
    ///
    /// # Errors
    ///
    /// 读不了文件的信息（被删了、没权限）。
    pub fn signature(&self) -> io::Result<String> {
        let meta = std::fs::metadata(&self.path)?;
        let mut h = DefaultHasher::new();
        self.path.hash(&mut h);
        meta.len().hash(&mut h);
        meta.modified()?.hash(&mut h);
        Ok(format!("{:016x}", h.finish()))
    }

    /// 读整张图。
    ///
    /// # Errors
    ///
    /// 读不了、超过 [`MAX_BYTES`]。
    pub fn read(&self) -> io::Result<Vec<u8>> {
        let len = std::fs::metadata(&self.path)?.len();
        if len > MAX_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("壁纸太大：{len} 字节"),
            ));
        }
        std::fs::read(&self.path)
    }
}

/// 现在的桌面壁纸：照这台电脑的桌面一家家问，第一张浏览器认得的图。
///
/// `dark` 是页面这时是不是深色（GNOME、KDE 深浅可以各设一张）。
///
/// # Errors
///
/// 都没找到、中间有一家出了错（跑不了命令、超时、读不了配置文件）的交那个错，排查用；一家家没装、没设的不算错，交 `Ok(None)`。
pub fn find(dark: bool) -> io::Result<Option<Wallpaper>> {
    let mut failed = None;
    for (from, ask) in probe::sources() {
        match ask(dark) {
            Ok(Some(path)) => match image_kind(&path) {
                Ok(Some(mime)) => return Ok(Some(Wallpaper { path, from, mime })),
                Ok(None) => {}
                Err(e) => failed = failed.or(Some(e)),
            },
            Ok(None) => {}
            Err(e) => failed = failed.or(Some(io::Error::new(e.kind(), format!("{from}：{e}")))),
        }
    }
    failed.map_or(Ok(None), Err)
}

/// 一个文件是不是浏览器认得的图：读开头几个字节认；不是普通文件、认不出的是 `None`。
fn image_kind(path: &Path) -> io::Result<Option<&'static str>> {
    if !path.is_file() {
        return Ok(None);
    }
    let mut head = [0u8; 16];
    let mut file = std::fs::File::open(path)?;
    let n = file.read(&mut head)?;
    Ok(parse::sniff(&head[..n]))
}

/// 跑一条命令、读它的标准输出。没装的（找不到程序）、出错退出的是 `None`；超时的杀掉，算错。
fn run(program: &str, args: &[&str]) -> io::Result<Option<String>> {
    let mut child = match Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    let start = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if start.elapsed() > TIMEOUT {
            child.kill()?;
            child.wait()?;
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                format!("{program} 过了 {} 秒没回", TIMEOUT.as_secs()),
            ));
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    if !status.success() {
        return Ok(None);
    }
    let mut out = String::new();
    if let Some(mut pipe) = child.stdout.take() {
        pipe.read_to_string(&mut out)?;
    }
    Ok(Some(out))
}
