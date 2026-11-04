//! 单实例的锁、`run/miyu-webui/address`（从 `serve.rs` 挪出来，W-1098 加 `/export` 时那一份又到了 500 行）。

use std::fs::{File, OpenOptions, TryLockError};

use miyu_client::places::DataRoot;

use super::{ADDRESS, LOCK, runtime};
use crate::TARGET;

/// 拿单实例的锁：拿不到（有一个在跑）是空的。
pub(super) fn lock(path: &std::path::Path) -> Result<Option<File>, String> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|error| format!("{} not opened: {error}", path.display()))?;
    match file.try_lock() {
        Ok(()) => Ok(Some(file)),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(error)) => Err(format!("{} not locked: {error}", path.display())),
    }
}

/// 有没有一个网页软件在跑：锁有人拿着。
pub fn running(root: &DataRoot) -> bool {
    matches!(lock(&runtime(root).join(LOCK)), Ok(None))
}

/// 地址写进运行时目录的 `address`：先写临时文件再改名。
pub(super) fn write_address(run: &std::path::Path, url: &str) -> Result<(), String> {
    let temp = run.join(format!("{ADDRESS}.{}.tmp", std::process::id()));
    std::fs::write(&temp, format!("{url}\n"))
        .and_then(|()| std::fs::rename(&temp, run.join(ADDRESS)))
        .map_err(|error| format!("run/miyu-webui/{ADDRESS} not written: {error}"))
}

/// 删地址：没有的不要紧。
pub(super) fn remove_address(run: &std::path::Path) {
    if let Err(error) = std::fs::remove_file(run.join(ADDRESS))
        && error.kind() != std::io::ErrorKind::NotFound
    {
        tracing::warn!(target: TARGET, error = %error, "address not removed");
    }
}

/// 读运行时目录里的地址：没有的、读不了的是空的。
pub fn address(root: &DataRoot) -> Option<String> {
    let text = std::fs::read_to_string(runtime(root).join(ADDRESS)).ok()?;
    let url = text.trim();
    (!url.is_empty()).then(|| url.to_string())
}
