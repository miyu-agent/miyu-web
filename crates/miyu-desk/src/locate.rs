//! 找文件（`/locate`，2026-11-11 项目主人定）：浏览器不给拖进来、选进来的文件的路径（只给名字、大小、改的时刻），页面要把「这个文件在
//! 这台电脑上的哪儿」交给她（超过附件上限的只给路径；没超的顺便带上，她能直接改原文件），由和页面在同一台电脑上的网页软件照名字找。
//!
//! - 只照名字、大小、改的时刻认，不读内容（项目主人：「按文件名找就好了，比对会有额外的性能开销而且没什么必要」）：名字要一样；
//!   页面说了大小的，大小要一样；改的时刻对得上的（差 2 秒以内）当场就是它，对不上的留着当退路。
//! - 哪儿找：先看页面说的那几处（会话的工作区），再看家目录下常放文件的几个文件夹（下载、桌面、文稿、影片、图片、音乐），最后整个家目录
//!   一层层往下；点开头的文件夹、`node_modules`、`target`、macOS 的资源库、Windows 的 `AppData` 不进。有时限（[`LIMIT`]）、有文件夹数
//!   的上限，到了就交回手上最好的。先问现成的索引（macOS 的 Spotlight、Linux 上装了的 `plocate`）：一下就回，外接盘上的也找得到。
//! - 不照名字一个个比：每个文件夹里直接问「这里有没有叫这个名字的」，大小写、中文的两种写法（NFC、NFD）由文件系统自己认。
//! - 谁能请（只给本机、要凭据）由用的一方管。

use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// 没说时限的找多久：顺便带路径的（没超上限的附件）不值得久等。量过（2026-11-11，一个很大的开发用的家目录）：整个翻一遍约 7 秒，
/// 所以非找到不可的（超过上限、只能给路径的）页面另说一个长的时限。
pub const LIMIT: Duration = Duration::from_millis(2000);
/// 最多进多少个文件夹。
const MAX_DIRS: usize = 200_000;
/// 改的时刻差多少以内算对得上（FAT 的时刻只准到 2 秒）。
const SLACK_MS: u64 = 2000;
/// 最多能让找多久（页面说的时限封顶到这里）。
pub const LIMIT_MOST: Duration = Duration::from_secs(15);
/// 问现成的索引最多等多久。
#[cfg(unix)]
const INDEX_LIMIT: Duration = Duration::from_secs(3);

/// 要找的那个文件：页面从浏览器拿到的那几样。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Wanted {
    /// 文件名（不带目录）。
    pub name: String,
    /// 几个字节；页面没说的不比。
    pub size: Option<u64>,
    /// 改的时刻（Unix 毫秒）；页面没说的不比。
    pub modified_ms: Option<u64>,
}

impl Wanted {
    /// 名字是不是一个文件名：不空、不带分隔符、不是 `.` `..`、没有控制字符。
    pub fn valid(&self) -> bool {
        let name = self.name.as_str();
        !name.is_empty()
            && name != "."
            && name != ".."
            && !name.contains(['/', '\\'])
            && !name.chars().any(char::is_control)
    }

    /// `at` 这个文件对不对得上：不是普通文件、大小不一样的不是；改的时刻也对得上的是 [`Fit::Exact`]，别的 [`Fit::Loose`]。
    fn fit(&self, at: &Path) -> Option<Fit> {
        let meta = std::fs::metadata(at).ok()?;
        if !meta.is_file() || self.size.is_some_and(|size| size != meta.len()) {
            return None;
        }
        let Some(wanted) = self.modified_ms else {
            return Some(Fit::Exact);
        };
        let modified = meta
            .modified()
            .ok()
            .and_then(|at| at.duration_since(UNIX_EPOCH).ok())
            .map(|d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX));
        match modified {
            Some(is) if is.abs_diff(wanted) <= SLACK_MS => Some(Fit::Exact),
            _ => Some(Fit::Loose),
        }
    }
}

/// 一个同名的文件对得上几成。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Fit {
    /// 大小、改的时刻都对得上。
    Exact,
    /// 大小对得上，改的时刻对不上（拷过一份、下载工具改过时刻）。
    Loose,
}

/// 不进的文件夹：点开头的、编译和依赖的大目录；`top` 是家目录那一层，另不进系统放程序数据的那几个。
fn skipped(name: &str, top: bool) -> bool {
    name.starts_with('.')
        || matches!(name, "node_modules" | "target" | "__pycache__")
        || (top && matches!(name, "Library" | "AppData" | "Applications"))
}

/// 家目录下常放文件的几个文件夹，照先后看。
fn usual(home: &Path) -> Vec<PathBuf> {
    [
        "Downloads",
        "Desktop",
        "Documents",
        "Movies",
        "Videos",
        "Pictures",
        "Music",
    ]
    .iter()
    .map(|name| home.join(name))
    .collect()
}

/// 在 `roots` 里照先后一层层找（先浅后深），到 `until` 为止。当场对得上的马上交；没有的交第一个只有时刻对不上的。`home` 是家目录
/// （它那一层另有几个不进的），`avoid` 整个不进（Miyu 的数据根）。
pub fn walk(
    wanted: &Wanted,
    roots: &[PathBuf],
    (home, avoid): (Option<&Path>, &[PathBuf]),
    until: Instant,
) -> Option<PathBuf> {
    let mut queue: VecDeque<PathBuf> = roots.iter().cloned().collect();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut loose = None;
    let mut visited = 0;
    while let Some(dir) = queue.pop_front() {
        if visited >= MAX_DIRS || Instant::now() >= until {
            break;
        }
        if avoid.iter().any(|a| dir.starts_with(a)) || !seen.insert(dir.clone()) {
            continue;
        }
        visited += 1;
        // 直接问这个文件夹里有没有这个名字：大小写、NFC/NFD 由文件系统认。
        let here = dir.join(&wanted.name);
        match wanted.fit(&here) {
            Some(Fit::Exact) => return Some(here),
            Some(Fit::Loose) if loose.is_none() => loose = Some(here),
            _ => {}
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let top = home == Some(dir.as_path());
        for entry in entries.flatten() {
            // 不跟链接：链到上面的会绕圈。
            if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                continue;
            }
            let name = entry.file_name();
            if !skipped(&name.to_string_lossy(), top) {
                queue.push_back(entry.path());
            }
        }
    }
    loose
}

/// 找到没有。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Located {
    /// 在这儿（绝对路径）。
    At(PathBuf),
    /// 没找到（不在这台电脑上、在没看的地方、时限到了）。
    Nowhere,
}

impl Located {
    /// 回给页面的 JSON：`{"path": "…"}`，没找到的 `{}`。
    pub fn json(&self) -> String {
        match self {
            Located::At(path) => serde_json::json!({ "path": path.to_string_lossy() }).to_string(),
            Located::Nowhere => "{}".to_string(),
        }
    }
}

/// 这台电脑的家目录。
fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .filter(|home| home.is_absolute())
}

/// 找 `wanted`：`near` 是先看的几处（会话的工作区，绝对路径才认），`avoid` 整个不进，翻目录最多 `limit`（封顶 [`LIMIT_MOST`]）。
pub async fn locate(
    wanted: Wanted,
    near: Vec<PathBuf>,
    avoid: Vec<PathBuf>,
    limit: Duration,
) -> Located {
    if !wanted.valid() {
        return Located::Nowhere;
    }
    if let Some(found) = from_index(&wanted, &avoid).await {
        return Located::At(found);
    }
    let home = home();
    let mut roots: Vec<PathBuf> = near.into_iter().filter(|p| p.is_absolute()).collect();
    if let Some(home) = &home {
        roots.extend(usual(home));
        roots.push(home.clone());
    }
    let until = Instant::now() + limit.min(LIMIT_MOST);
    let found = tokio::task::spawn_blocking(move || {
        walk(&wanted, &roots, (home.as_deref(), &avoid), until)
    })
    .await;
    match found {
        Ok(Some(path)) => Located::At(path),
        Ok(None) => Located::Nowhere,
        Err(error) => {
            tracing::warn!(target: crate::TARGET, %error, "file search did not finish");
            Located::Nowhere
        }
    }
}

/// 这台电脑上现成的文件索引：macOS 问 Spotlight（`mdfind -name`），Linux 问 `plocate`（装了才有；它的库一天更新一次，刚下载的
/// 不在里面，由后面的翻目录补上）。交回名字里带这几个字的文件，一行一个；没有这个程序、超时的是空的。Windows 没有现成的。
#[cfg(unix)]
async fn indexed(name: &str) -> Vec<PathBuf> {
    let (program, args): (&str, &[&str]) = if cfg!(target_os = "macos") {
        ("mdfind", &["-name"])
    } else {
        ("plocate", &["--basename", "--limit", "200", "--"])
    };
    let mut command = tokio::process::Command::new(program);
    command
        .args(args)
        .arg(name)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    match tokio::time::timeout(INDEX_LIMIT, command.output()).await {
        Ok(Ok(output)) => String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(PathBuf::from)
            .collect(),
        _ => Vec::new(),
    }
}

/// 照索引找：索引给的一个个照 [`Wanted::fit`] 认。名字要正好是它：照「同一个文件夹里叫这个名字的是不是同一个文件」认，大小写、
/// 两种写法由文件系统管。
#[cfg(unix)]
async fn from_index(wanted: &Wanted, avoid: &[PathBuf]) -> Option<PathBuf> {
    use std::os::unix::fs::MetadataExt;
    let same = |a: &Path, b: &Path| match (std::fs::metadata(a), std::fs::metadata(b)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    };
    let mut loose = None;
    for path in indexed(&wanted.name).await {
        let Some(named) = path.parent().map(|dir| dir.join(&wanted.name)) else {
            continue;
        };
        if avoid.iter().any(|a| path.starts_with(a)) || !same(&path, &named) {
            continue;
        }
        match wanted.fit(&path) {
            Some(Fit::Exact) => return Some(path),
            Some(Fit::Loose) if loose.is_none() => loose = Some(path),
            _ => {}
        }
    }
    loose
}

#[cfg(not(unix))]
async fn from_index(_: &Wanted, _: &[PathBuf]) -> Option<PathBuf> {
    None
}

/// 文件改的时刻换成 Unix 毫秒（测试里摆文件用）。
pub fn millis(at: SystemTime) -> u64 {
    at.duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

#[cfg(test)]
mod tests;
