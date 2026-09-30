//! 网页演示的桥（命令行外壳）：起桥、打出带口令的网址，占着进程等 Ctrl+C。
//!
//! 和传输无关的那一半在 `lib.rs`（跟着蓝图 `web/architecture.md`「宿主怎么搬」第 3 步拆出来），桌面端
//! （`../desktop/`）用同一个库；这一份只是 HTTP、WebSocket 这一层的外壳加一个命令行。
//!
//! 用法：`cargo run -- [端口]`，默认 8765；页面文件是这个 crate 上一层的 `web-demo/`。

use std::path::PathBuf;

fn main() {
    let port = std::env::args().nth(1).and_then(|p| p.parse().ok()).unwrap_or(8765);
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    match miyu_web_bridge::spawn(dir, port) {
        Ok(running) => {
            println!("网页演示（真核心）：{}", running.url);
            println!("这个链接这一次启动有效；只在本机能打开。Ctrl+C 停。");
            loop {
                std::thread::sleep(std::time::Duration::from_secs(3600));
            }
        }
        Err(e) => eprintln!("{e}"),
    }
}
