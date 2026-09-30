//! Miyu 的桌面端外壳：先起桥（`miyu-web-bridge`），再开一个本机窗口指向桥给的网址。
//!
//! 这是蓝图 `web/architecture.md`「宿主怎么搬」第 3、4 步里最小的一步：页面、内核、软件包一个都不动，
//! 先让同一份 `web-demo/` 在系统自带的网页视图里跑起来。窗口打开的是桥的访问口令网址（`#k=…`），
//! 所以在网页视图里走的还是浏览器那份宿主；照蓝图把 `src/host/tauri.js`（进程间通道、自定义协议）做出来
//! 以后，这一层换成 Tauri 的通道，页面那头不用改。
//!
//! 跑：在 `web-demo/desktop/` 下 `cargo run`。环境变量照桥那一套写在命令前面（`MIYU_HOME`、
//! `MIYU_RESOURCES`、`MIYU_CORE_BIN`、`DEEPSEEK_API_KEY`、`MIYU_DEV_BASE_URL`、`MIYU_DEV_MODEL`、
//! `MIYU_DEV_WINDOW`）。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// 页面文件的目录：开发时是 `desktop/` 上一层的 `web-demo/`；打包以后是资源目录里的 `web-demo/`。
///
/// # Errors
///
/// 两处都找不到 `index.html` 时交回两处的位置，外头写清为什么起不来。
fn site_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    if dev.join("index.html").is_file() {
        return Ok(dev);
    }
    let bundled = app
        .path()
        .resource_dir()
        .map_err(|e| format!("找不到资源目录：{e}"))?
        .join("web-demo");
    if bundled.join("index.html").is_file() {
        return Ok(bundled);
    }
    Err(format!(
        "找不到页面文件的目录 {}，也没有 {}",
        dev.display(),
        bundled.display()
    ))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = site_dir(app.handle()).map_err(std::io::Error::other)?;
            // 端口传 0：由系统挑一个空的，免得和已经在跑的桥（8765）撞上。
            let running = miyu_web_bridge::spawn(dir, 0).map_err(std::io::Error::other)?;
            let url = running.url.parse().map_err(std::io::Error::other)?;
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Miyu")
                .inner_size(1280.0, 860.0)
                .min_inner_size(720.0, 480.0)
                .build()?;
            // 桥的运行时存进 Tauri 的状态：状态在，桥就在跑。
            app.manage(running);
            // 有些桌面环境不会把新窗口抬到前面；抬不动不致命，写一句就算了。
            if let Err(e) = window.set_focus() {
                eprintln!("窗口抬不起来（不影响用）：{e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("跑不起来 Miyu 桌面端");
}
