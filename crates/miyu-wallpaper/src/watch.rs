//! 换了壁纸自动跟着变（蓝图 `web.md`「跟着人格的外观」第 5 条，2026-10-14 项目主人定，两个头一样）：不定时轮询，盯住壁纸来处的文件，
//! 文件一变就叫用的人重找一次。
//!
//! - [`watch_list`]：这台电脑上要盯的文件（matugen 那一份、各家存设置和缓存的文件），找到了壁纸的再加上图本身（[`Wallpaper::watch`]）；
//! - [`Watch`]：照清单盯，只用系统的通知（Linux inotify、macOS FSEvents、Windows ReadDirectoryChangesW、BSD kqueue），没有的平台、
//!   起不来的交错，不退回定时去看（项目主人 10-14：这里绝对不能有轮询）。起不来的由用的人记一行日志，只靠窗口拿回焦点时再找。
//!
//! 只能经 IPC 换、不落文件的（hyprpaper、swaybg……）盯不到，同样靠拿回焦点时再找。
//!
//! [`Wallpaper::watch`]: crate::Wallpaper::watch

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;

use notify::event::{AccessKind, AccessMode};
use notify::{Event, EventKind, RecursiveMode, Watcher as _};

/// 一阵变动收齐了才叫一次：换壁纸的程序往往连着写好几个文件。
const SETTLE: Duration = Duration::from_millis(300);

/// 这台电脑上要盯的文件、目录：matugen 生成的那一份，各家桌面、壁纸程序存设置和缓存的地方（没有的也列着：以后建出来就算变了）。
/// 目录的意思是里面哪个文件变了都算（awww、swww 的缓存）。
#[must_use]
pub fn watch_list() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = crate::matugen::output_path().into_iter().collect();
    out.extend(platform_list());
    out
}

/// Linux、BSD：KDE、GNOME 一系（dconf）、XFCE 的设置，awww、swww 的缓存，hyprpaper、wpaperd、waypaper 的配置，feh、nitrogen 记的那一张。
#[cfg(all(unix, not(target_os = "macos")))]
fn platform_list() -> Vec<PathBuf> {
    let env = |k: &str| {
        std::env::var_os(k)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
    };
    let Some(home) = env("HOME") else {
        return Vec::new();
    };
    let config = env("XDG_CONFIG_HOME").unwrap_or_else(|| home.join(".config"));
    let cache = env("XDG_CACHE_HOME").unwrap_or_else(|| home.join(".cache"));
    vec![
        config.join("plasma-org.kde.plasma.desktop-appletsrc"),
        // GNOME、Cinnamon、MATE 的 gsettings 都存在这一个库里
        config.join("dconf/user"),
        config.join("xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml"),
        cache.join("awww"),
        cache.join("swww"),
        config.join("hypr/hyprpaper.conf"),
        config.join("wpaperd"),
        config.join("waypaper/config.ini"),
        home.join(".fehbg"),
        config.join("nitrogen/bg-saved.cfg"),
    ]
}

/// macOS：系统存壁纸设置的 `Index.plist`。
#[cfg(target_os = "macos")]
fn platform_list() -> Vec<PathBuf> {
    crate::probe::home()
        .map(|h| h.join("Library/Application Support/com.apple.wallpaper/Store/Index.plist"))
        .into_iter()
        .collect()
}

/// Windows：Windows 转好的那一张 `TranscodedWallpaper`（设壁纸时都会重写它）。
#[cfg(windows)]
fn platform_list() -> Vec<PathBuf> {
    std::env::var_os("APPDATA")
        .map(|d| PathBuf::from(d).join(r"Microsoft\Windows\Themes\TranscodedWallpaper"))
        .into_iter()
        .collect()
}

/// 别的平台不知道去哪找壁纸，也不盯。
#[cfg(not(any(unix, windows)))]
fn platform_list() -> Vec<PathBuf> {
    Vec::new()
}

/// 系统的文件通知：每个平台各用各的，不用 notify 的 `RecommendedWatcher`（没有系统通知的平台上它是定时去看的 `PollWatcher`）。
#[cfg(any(target_os = "linux", target_os = "android"))]
type Native = notify::INotifyWatcher;
/// 系统的文件通知（macOS FSEvents）。
#[cfg(target_os = "macos")]
type Native = notify::FsEventWatcher;
/// 系统的文件通知（Windows ReadDirectoryChangesW）。
#[cfg(windows)]
type Native = notify::ReadDirectoryChangesWatcher;
/// 系统的文件通知（BSD kqueue）。
#[cfg(any(
    target_os = "freebsd",
    target_os = "openbsd",
    target_os = "netbsd",
    target_os = "dragonfly"
))]
type Native = notify::KqueueWatcher;

/// 盯着的：清单（照真实路径写的，见 [`resolve`]）、真在盯的目录（照清单算出来的，见 [`plan`]）。
struct State {
    watcher: Native,
    targets: Vec<PathBuf>,
    armed: BTreeMap<PathBuf, RecursiveMode>,
}

/// 照清单盯文件：清单里哪个变了（改了、新建、删了、换成别的文件），收齐一阵叫一次 `changed`（在盯的线程上叫，别在里面做重活）。
/// 丢掉就不盯了。
pub struct Watch {
    state: Arc<Mutex<State>>,
}

impl Watch {
    /// 开始盯。
    ///
    /// # Errors
    ///
    /// 这个平台没有系统的文件通知，或者起不来（inotify 的个数用完了……）。
    pub fn start(targets: Vec<PathBuf>, changed: impl Fn() + Send + 'static) -> io::Result<Self> {
        start_native(targets, changed)
    }

    /// 换一份清单（重找以后图换了、来处换了）。
    ///
    /// # Errors
    ///
    /// 盯不了新加的目录。
    pub fn set(&self, targets: Vec<PathBuf>) -> io::Result<()> {
        let mut state = self.state.lock().map_err(|_| poisoned())?;
        state.targets = targets.iter().map(|t| resolve(t)).collect();
        rearm(&mut state)
    }
}

#[cfg(not(any(
    target_os = "linux",
    target_os = "android",
    target_os = "macos",
    windows,
    target_os = "freebsd",
    target_os = "openbsd",
    target_os = "netbsd",
    target_os = "dragonfly"
)))]
fn start_native(_targets: Vec<PathBuf>, _changed: impl Fn() + Send + 'static) -> io::Result<Watch> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "这个平台没有系统的文件通知",
    ))
}

#[cfg(any(
    target_os = "linux",
    target_os = "android",
    target_os = "macos",
    windows,
    target_os = "freebsd",
    target_os = "openbsd",
    target_os = "netbsd",
    target_os = "dragonfly"
))]
fn start_native(targets: Vec<PathBuf>, changed: impl Fn() + Send + 'static) -> io::Result<Watch> {
    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let watcher = Native::new(tx, notify::Config::default()).map_err(io::Error::other)?;
    let state = Arc::new(Mutex::new(State {
        watcher,
        targets: targets.iter().map(|t| resolve(t)).collect(),
        armed: BTreeMap::new(),
    }));
    {
        let mut s = state.lock().map_err(|_| poisoned())?;
        // 有的目录盯不了（没权限）不碍事，一个都盯不了的才算起不来
        if let Err(e) = rearm(&mut s)
            && s.armed.is_empty()
        {
            return Err(e);
        }
    }
    let weak = Arc::downgrade(&state);
    std::thread::Builder::new()
        .name("miyu-wallpaper-watch".into())
        .spawn(move || listen(&rx, &weak, &changed))?;
    Ok(Watch { state })
}

/// 盯的线程：等到清单里的变了，收齐一阵、照新的样子重新盯（建出了目录的往里盯），叫一次。`Watch` 丢了（通知的发送端跟着没了）就退。
fn listen(
    rx: &mpsc::Receiver<notify::Result<Event>>,
    state: &Weak<Mutex<State>>,
    changed: &dyn Fn(),
) {
    while let Ok(first) = rx.recv() {
        if !relevant(state, &first) {
            continue;
        }
        loop {
            match rx.recv_timeout(SETTLE) {
                Ok(_) => {}
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        let Some(state) = state.upgrade() else { return };
        if let Ok(mut s) = state.lock() {
            // 建出了中间的目录、链接换了指向的，真实路径跟着变
            s.targets = s.targets.iter().map(|t| resolve(t)).collect();
            // 盯不了新建出来的目录的，照旧盯着上一层，下次再试
            let _rearmed = rearm(&mut s);
        }
        drop(state);
        changed();
    }
}

/// 这一条通知和清单有没有关系：路径是清单里的、在清单里的目录下面、是清单里哪一项的上层（建出、删掉了中间的目录）。
/// 只是打开、读的不算（用的人自己读图也会有）。
fn relevant(state: &Weak<Mutex<State>>, event: &notify::Result<Event>) -> bool {
    let Ok(event) = event else {
        // 通知本身出了错（队列满了丢了一些）：当变了，重找一次
        return true;
    };
    if matches!(event.kind, EventKind::Access(kind) if kind != AccessKind::Close(AccessMode::Write))
    {
        return false;
    }
    let Some(state) = state.upgrade() else {
        return false;
    };
    let Ok(s) = state.lock() else { return false };
    event.paths.is_empty() || event.paths.iter().any(|p| touches(&s.targets, p))
}

/// 照真实路径写（系统的通知报的是真实路径：macOS 的 `/var` 是链接、家目录也可能是）：最近的、在的那一层换成真实路径，后面照抄。
pub(crate) fn resolve(target: &Path) -> PathBuf {
    for base in target.ancestors() {
        if let Ok(real) = base.canonicalize() {
            return match target.strip_prefix(base) {
                Ok(rest) if !rest.as_os_str().is_empty() => real.join(rest),
                _ => real,
            };
        }
    }
    target.to_path_buf()
}

/// 一个路径碰没碰到清单。
pub(crate) fn touches(targets: &[PathBuf], path: &Path) -> bool {
    targets
        .iter()
        .any(|t| path.starts_with(t) || t.starts_with(path))
}

/// 照清单真去盯的目录：在的目录整个往下盯，文件和还没有的盯它最近的、在的那一层上层（只盯这一层：原地重写、换成别的文件、新建都看得到）。
pub(crate) fn plan(targets: &[PathBuf]) -> BTreeMap<PathBuf, RecursiveMode> {
    let mut out = BTreeMap::new();
    for target in targets {
        if target.is_dir() {
            out.insert(target.clone(), RecursiveMode::Recursive);
            continue;
        }
        let Some(dir) = target.ancestors().skip(1).find(|a| a.is_dir()) else {
            continue;
        };
        out.entry(dir.to_path_buf())
            .or_insert(RecursiveMode::NonRecursive);
    }
    out
}

/// 照清单重新盯：多出来的盯上、不要的放掉。
fn rearm(state: &mut State) -> io::Result<()> {
    let want = plan(&state.targets);
    let drop_these: Vec<PathBuf> = state
        .armed
        .iter()
        .filter(|(dir, mode)| want.get(*dir) != Some(*mode))
        .map(|(dir, _)| dir.clone())
        .collect();
    for dir in drop_these {
        // 目录被删了的，系统那边已经不盯了：放不掉不算错
        let _gone = state.watcher.unwatch(&dir);
        state.armed.remove(&dir);
    }
    let mut failed = None;
    for (dir, mode) in want {
        if state.armed.contains_key(&dir) {
            continue;
        }
        match state.watcher.watch(&dir, mode) {
            Ok(()) => {
                state.armed.insert(dir, mode);
            }
            Err(e) => failed = failed.or(Some(io::Error::other(format!("{}：{e}", dir.display())))),
        }
    }
    failed.map_or(Ok(()), Err)
}

fn poisoned() -> io::Error {
    io::Error::other("盯壁纸的线程出错退出过")
}
