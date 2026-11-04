//! 起来时清上回剩下的、建自己的子目录（从 `export.rs` 挪出来：那一份到了 500 行）。

use std::io;
use std::path::Path;
use std::time::Duration;

use super::PREFIX;
use crate::TARGET;

/// 建自己的子目录：只建这一层（已经有的不认，起来时 [`clean()`] 已经删掉了同进程号剩下的），Unix 上只给本人。
pub(super) fn make(dir: &Path) -> io::Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    // 只建这一层（本来就是，写明白：上一层是系统临时目录，不替它建）
    builder.recursive(false);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(dir)
}

/// 起来时清 `temp` 下上回剩下的 `miyu-webui-<进程号>`：只认名字写法对的真目录（不跟链接）。和自己同一个进程号的（上回的进程号重用了）
/// 整个删掉；别的进程号的可能是另一个数据根上正在跑的网页软件，只删放了 `idle` 以上的文件（它自己也该删了），删空了的连目录删掉。
/// 读不了、删不掉的（别的用户的）跳过。
pub(super) fn clean(temp: &Path, own: u32, idle: Duration) {
    let entries = match std::fs::read_dir(temp) {
        Ok(entries) => entries,
        Err(error) => {
            tracing::debug!(target: TARGET, error = %error, "temp dir not read");
            return;
        }
    };
    let mut removed = 0usize;
    for entry in entries {
        let Ok(entry) = entry else {
            // 读到一半出错的那一项：跳过，别的照清
            continue;
        };
        let Some(pid) = entry.file_name().to_str().and_then(pid_of) else {
            continue;
        };
        let path = entry.path();
        if !std::fs::symlink_metadata(&path).is_ok_and(|meta| meta.is_dir()) {
            continue;
        }
        if pid == own {
            match std::fs::remove_dir_all(&path) {
                Ok(()) => removed += 1,
                Err(error) => {
                    tracing::warn!(target: TARGET, error = %error, "export leftovers not removed");
                }
            }
            continue;
        }
        removed += clean_old(&path, idle);
    }
    if removed > 0 {
        tracing::info!(target: TARGET, removed, "export leftovers removed");
    }
}

/// 别的进程号的子目录：删放了 `idle` 以上的普通文件，删空了的连目录删掉；交回删了几样。
fn clean_old(dir: &Path, idle: Duration) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        // 别的用户的（0700）：读不了就不归这里管
        return 0;
    };
    let mut removed = 0;
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let old = entry.metadata().is_ok_and(|meta| {
            meta.is_file()
                && meta
                    .modified()
                    .is_ok_and(|at| at.elapsed().is_ok_and(|age| age >= idle))
        });
        if !old {
            continue;
        }
        match std::fs::remove_file(entry.path()) {
            Ok(()) => removed += 1,
            Err(error) => tracing::debug!(target: TARGET, error = %error, "export leftover kept"),
        }
    }
    // 还有东西的删不掉（正在跑的那一个的），留着
    match std::fs::remove_dir(dir) {
        Ok(()) => removed += 1,
        Err(error) => tracing::debug!(target: TARGET, error = %error, "export dir kept"),
    }
    removed
}

/// `miyu-webui-<进程号>` 的进程号：后面全是数字才算。
pub(crate) fn pid_of(name: &str) -> Option<u32> {
    let digits = name.strip_prefix(PREFIX)?;
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}
