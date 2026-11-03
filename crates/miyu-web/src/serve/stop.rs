//! 停的信号（从 `serve.rs` 挪出来，W-1089 加 `/ticket` 时那一份到了 500 行）。

/// 收到停的信号：Ctrl+C，Unix 上另有 SIGTERM。
pub(super) async fn stopped() {
    #[cfg(unix)]
    {
        let Ok(mut term) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        else {
            return std::future::pending().await;
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        if tokio::signal::ctrl_c().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}
