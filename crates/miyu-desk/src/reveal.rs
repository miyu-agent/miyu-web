//! 打开目录（`/reveal`）：在这台电脑上用系统的文件管理器打开一个文件夹（蓝图 `web.md`「设置页」第 20 条：技能、脚本两页的
//! 「打开目录」）。浏览器开不了本机的文件夹；网页软件、桥和页面在同一台电脑上，由它们开（同 `/pick-dir`）。
//!
//! - 只开目录，不开文件（文件交给系统打开就是运行它）；`~`、`~/…` 照家目录接。
//! - 还没建的：在 Miyu 的数据根里面、上一层在的建出来再开（核心给的是自己放技能、脚本的文件夹，还没放过东西的不在）；上一层也不在的、
//!   数据根外面的交「不在」，不建（审计 #088：原来上一层在就建，这台电脑上任何能写的地方都能被建出一层目录）。
//! - Linux `xdg-open`、macOS `open -R`、Windows `explorer`；没有这个程序的交「开不了」，页面退回复制路径。macOS 上 `.app` 这类包也是
//!   目录，`open <目录>` 会启动它：改用 `-R`，在 Finder 里选中它、不打开（2026-11-02 第四轮审查 W4-4）。

use std::ffi::OsStr;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;

use tokio::process::Command;

/// 开的结果。
pub enum Revealed {
    /// 开了。
    Opened,
    /// 不在（上一层也不在），或者不是目录。
    Missing,
    /// 这台机器上开不了（没有文件管理器的程序）。
    Unavailable,
}

impl Revealed {
    /// 回给页面的 JSON：`{"ok": true}`、`{"missing": true}`、`{"unavailable": true}`。
    pub fn json(&self) -> &'static str {
        match self {
            Revealed::Opened => r#"{"ok":true}"#,
            Revealed::Missing => r#"{"missing":true}"#,
            Revealed::Unavailable => r#"{"unavailable":true}"#,
        }
    }
}

/// `~`、`~/…` 照家目录接；别的照原样（相对路径不认）。
pub fn expand(path: &str, home: Option<&Path>) -> Option<PathBuf> {
    let rest = if path == "~" {
        Some("")
    } else {
        path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\"))
    };
    let full = match rest {
        Some(rest) => home?.join(rest),
        None => PathBuf::from(path),
    };
    full.is_absolute().then_some(full)
}

/// 要开的那个目录：在的照它（不是目录的不开）；不在的、上一层在、在 `makeable` 里某一个的里面的建出来（数据根；照真实路径比，
/// 链接、`..` 绕不出去）。
pub fn ready(dir: &Path, makeable: &[PathBuf]) -> Option<PathBuf> {
    match std::fs::metadata(dir) {
        Ok(meta) => return meta.is_dir().then(|| dir.to_path_buf()),
        Err(e) if e.kind() != ErrorKind::NotFound => return None,
        Err(_) => {}
    }
    let name = match dir.components().next_back()? {
        Component::Normal(name) => name,
        _ => return None,
    };
    let parent = std::fs::canonicalize(dir.parent()?).ok()?;
    if !parent.is_dir() || !inside_any(&parent, makeable) {
        return None;
    }
    // 照真实路径建，交回页面给的写法（Windows 的真实路径带 `\\?\`，文件管理器不认）
    let made = parent.join(name);
    match std::fs::create_dir(&made) {
        Ok(()) => Some(dir.to_path_buf()),
        Err(e) => {
            tracing::warn!(target: crate::TARGET, dir = %made.display(), error = %e, "folder not made");
            None
        }
    }
}

/// `path`（真实路径）是不是 `roots` 里某一个本身或者在它里面：根照真实路径比，还没有的不算。
fn inside_any(path: &Path, roots: &[PathBuf]) -> bool {
    roots
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .any(|root| path.starts_with(root))
}

/// 在 `os`（照 `std::env::consts::OS` 的写法，测试里能换）上开 `dir` 用哪个程序、带哪几个参数。macOS 用 `open -R`：在 Finder 里选中，
/// 不打开（包目录照 `open` 开就是启动它，第四轮审查 W4-4）。
fn command_line<'a>(os: &str, dir: &'a Path) -> (&'static str, Vec<&'a OsStr>) {
    match os {
        "macos" => ("open", vec![OsStr::new("-R"), dir.as_os_str()]),
        "windows" => ("explorer", vec![dir.as_os_str()]),
        _ => ("xdg-open", vec![dir.as_os_str()]),
    }
}

/// 打开 `path`（页面交来的写法）。不在的只在 `makeable`（数据根）里面建，见 [`ready`]。
pub async fn reveal(path: &str, makeable: &[PathBuf]) -> Revealed {
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let Some(dir) = expand(path, home.as_deref()).and_then(|p| ready(&p, makeable)) else {
        return Revealed::Missing;
    };
    let (program, args) = command_line(std::env::consts::OS, &dir);
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::no_console(&mut cmd);
    match cmd.status().await {
        // explorer 开成了也交 1，不看它的退出码
        Ok(status) if status.success() || cfg!(windows) => Revealed::Opened,
        Ok(status) => {
            tracing::warn!(target: crate::TARGET, dir = %dir.display(), %status, "folder not opened");
            Revealed::Unavailable
        }
        Err(e) => {
            if e.kind() != ErrorKind::NotFound {
                tracing::warn!(target: crate::TARGET, program, error = %e, "file manager not started");
            }
            Revealed::Unavailable
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_relative_paths_are_joined_and_relative_ones_refused() {
        // 家目录照这个系统的绝对路径写（Windows 上 `/home/me` 不算绝对；原来这个测试在桥里只在 Linux 上跑）
        let home = if cfg!(windows) {
            Path::new(r"C:\Users\me")
        } else {
            Path::new("/home/me")
        };
        assert_eq!(
            expand("~/.miyu/home/admin/skills", Some(home)),
            Some(home.join(".miyu/home/admin/skills"))
        );
        assert_eq!(expand("~", Some(home)), Some(home.to_path_buf()));
        assert_eq!(expand("~/x", None), None);
        assert_eq!(expand("skills", Some(home)), None);
        #[cfg(unix)]
        assert_eq!(
            expand("/srv/skills", Some(home)),
            Some(PathBuf::from("/srv/skills"))
        );
    }

    #[test]
    fn macos_selects_the_folder_in_finder_instead_of_opening_it() {
        // 应用包也是目录：照 `open <目录>` 开就是启动它（第四轮审查 W4-4）
        let app = Path::new("/Applications/Calculator.app");
        assert_eq!(
            command_line("macos", app),
            ("open", vec![OsStr::new("-R"), app.as_os_str()])
        );
        assert_eq!(
            command_line("linux", app),
            ("xdg-open", vec![app.as_os_str()])
        );
        assert_eq!(
            command_line("windows", app),
            ("explorer", vec![app.as_os_str()])
        );
    }

    #[test]
    fn a_missing_folder_is_made_only_under_an_existing_parent() {
        let root = std::env::temp_dir().join(format!("miyu-reveal-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("建测试目录");
        // macOS 的 `/var` 是链接：建出来的照真实路径交回
        let root = root.canonicalize().expect("真实路径");
        let makeable = [root.clone()];
        let skills = root.join("skills");
        assert_eq!(ready(&skills, &makeable), Some(skills.clone()));
        assert!(skills.is_dir());
        assert_eq!(ready(&root.join("a").join("b"), &makeable), None);
        let file = root.join("f.txt");
        std::fs::write(&file, b"x").expect("写测试文件");
        assert_eq!(ready(&file, &makeable), None);
        std::fs::remove_dir_all(&root).expect("清测试目录");
    }

    /// 审计 #088：数据根外面的不建（原来上一层在就建，`GET /reveal` 能在这台电脑上任何能写的地方建一层目录）。
    #[test]
    fn a_missing_folder_outside_the_data_root_is_not_made() {
        let root = std::env::temp_dir().join(format!("miyu-reveal-outside-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("建测试目录");
        let data = root.join("data");
        std::fs::create_dir_all(&data).expect("建数据根");
        let outside = root.join("made-by-reveal");
        assert_eq!(ready(&outside, std::slice::from_ref(&data)), None);
        assert!(!outside.exists(), "数据根外面的不建");
        // `..` 绕出数据根的也不建
        let around = data.join("..").join("made-by-reveal");
        assert_eq!(ready(&around, std::slice::from_ref(&data)), None);
        assert!(!outside.exists(), "绕出去的不建");
        // 在的目录哪里都照开
        assert_eq!(
            ready(&root, std::slice::from_ref(&data)),
            Some(root.clone())
        );
        std::fs::remove_dir_all(&root).expect("清测试目录");
    }
}
