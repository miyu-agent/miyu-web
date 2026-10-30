//! 打开目录（`/reveal`）：在这台电脑上用系统的文件管理器打开一个文件夹（蓝图 `web.md`「设置页」第 20 条：技能、脚本两页的
//! 「打开目录」）。浏览器开不了本机的文件夹；网页软件、桥和页面在同一台电脑上，由它们开（同 `/pick-dir`）。
//!
//! - 只开目录，不开文件（文件交给系统打开就是运行它）；`~`、`~/…` 照家目录接。
//! - 还没建的：上一层在的建出来再开（核心给的是管理员放技能、脚本的文件夹，还没放过东西的不在）；上一层也不在的交「不在」。
//! - Linux `xdg-open`、macOS `open`、Windows `explorer`；没有这个程序的交「开不了」，页面退回复制路径。

use std::io::ErrorKind;
use std::path::{Path, PathBuf};
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

/// 要开的那个目录：在的照它（不是目录的不开）；不在的、上一层在的建出来。
pub fn ready(dir: &Path) -> Option<PathBuf> {
    match std::fs::metadata(dir) {
        Ok(meta) => return meta.is_dir().then(|| dir.to_path_buf()),
        Err(e) if e.kind() != ErrorKind::NotFound => return None,
        Err(_) => {}
    }
    let parent = dir.parent()?;
    if !parent.is_dir() {
        return None;
    }
    match std::fs::create_dir(dir) {
        Ok(()) => Some(dir.to_path_buf()),
        Err(e) => {
            tracing::warn!(target: crate::TARGET, dir = %dir.display(), error = %e, "folder not made");
            None
        }
    }
}

/// 这个系统用哪个程序开。
fn program() -> &'static str {
    if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(windows) {
        "explorer"
    } else {
        "xdg-open"
    }
}

/// 打开 `path`（页面交来的写法）。
pub async fn reveal(path: &str) -> Revealed {
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let Some(dir) = expand(path, home.as_deref()).and_then(|p| ready(&p)) else {
        return Revealed::Missing;
    };
    let mut cmd = Command::new(program());
    cmd.arg(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    match cmd.status().await {
        // explorer 开成了也交 1，不看它的退出码
        Ok(status) if status.success() || cfg!(windows) => Revealed::Opened,
        Ok(status) => {
            tracing::warn!(target: crate::TARGET, dir = %dir.display(), %status, "folder not opened");
            Revealed::Unavailable
        }
        Err(e) => {
            if e.kind() != ErrorKind::NotFound {
                tracing::warn!(target: crate::TARGET, program = program(), error = %e, "file manager not started");
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
        let home = Path::new("/home/me");
        assert_eq!(
            expand("~/.miyu/home/admin/skills", Some(home)),
            Some(PathBuf::from("/home/me/.miyu/home/admin/skills"))
        );
        assert_eq!(expand("~", Some(home)), Some(PathBuf::from("/home/me")));
        assert_eq!(expand("~/x", None), None);
        assert_eq!(expand("skills", Some(home)), None);
        #[cfg(unix)]
        assert_eq!(
            expand("/srv/skills", Some(home)),
            Some(PathBuf::from("/srv/skills"))
        );
    }

    #[test]
    fn a_missing_folder_is_made_only_under_an_existing_parent() {
        let root = std::env::temp_dir().join(format!("miyu-reveal-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("建测试目录");
        let skills = root.join("skills");
        assert_eq!(ready(&skills), Some(skills.clone()));
        assert!(skills.is_dir());
        assert_eq!(ready(&root.join("a").join("b")), None);
        let file = root.join("f.txt");
        std::fs::write(&file, b"x").expect("写测试文件");
        assert_eq!(ready(&file), None);
        std::fs::remove_dir_all(&root).expect("清测试目录");
    }
}
