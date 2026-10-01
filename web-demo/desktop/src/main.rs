//! Miyu 的桌面端外壳：先起桥（`miyu-web-bridge`），再开一个本机窗口指向桥给的网址，最后挂一个托盘。
//!
//! 这是蓝图 `web/architecture.md`「宿主怎么搬」第 3 步到第 6 步里最小的一步：页面、内核、软件包一个都不动，
//! 先让同一份 `web-demo/` 在系统自带的网页视图里跑起来。窗口打开的是桥的访问口令网址（`#k=…`），
//! 所以在网页视图里走的还是浏览器那份宿主；照蓝图把 `src/host/tauri.js`（进程间通道、自定义协议）做出来
//! 以后，这一层换成 Tauri 的通道，页面那头不用改。
//!
//! 托盘（蓝图同一条第 6 步，2026-10-01 项目主人定）：**关掉窗口不退出，收进托盘**，菜单里「显示主窗口」叫回来、
//! 「退出」才真走；页面那头一个字不动，收起来的时候那条连接和会话照旧留着。Linux 上走的是 AppIndicator，
//! 左键点图标是弹菜单（`tray-icon` 在那一套后端上不发点击事件），所以「点图标切换显示」那一段只有 Windows、
//! macOS 用得上。
//!
//! 已知的坑：状态栏没有宿主时（没有会话总线、无头跑、桌面本身不显示托盘图标）图标不会出现，而
//! `TrayIconBuilder::build` 照样交回 `Ok`——这时关窗收起来就再也叫不回来，只能从外面结束进程。
//! 以后做单实例（再跑一次就把那扇窗叫出来）、登录自启时一并收。
//!
//! 跑：在 `web-demo/desktop/` 下 `cargo run`。环境变量照桥那一套写在命令前面（`MIYU_HOME`、
//! `MIYU_RESOURCES`、`MIYU_CORE_BIN`、`DEEPSEEK_API_KEY`、`MIYU_DEV_BASE_URL`、`MIYU_DEV_MODEL`、
//! `MIYU_DEV_WINDOW`）。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

/// 窗口的编号：一个窗口就是一个终端（蓝图「多用户、多终端」），先只有这一个。
const WINDOW: &str = "main";

/// 托盘菜单上那两个字从哪一份字里取：现在照默认的那一份中文。选语言是页面的设置项，外壳还不知道（以后照配置来）。
const TRAY_TEXT: &str = "resources/text/zh.json";

/// 资源里没有那两个字时的兜底（中文）。
const TRAY_FALLBACK: (&str, &str) = ("显示主窗口", "退出");

/// 托盘图标：编译时进程序的那一张（`icons/tray.png`，32×32，透明底的一张头像）。
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");

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
            let site = site_dir(app.handle()).map_err(std::io::Error::other)?;
            // 端口传 0：由系统挑一个空的，免得和已经在跑的桥（8765）撞上。
            let running = miyu_web_bridge::spawn(site.clone(), 0).map_err(std::io::Error::other)?;
            let url = running.url.parse().map_err(std::io::Error::other)?;
            let window = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::External(url))
                .title("Miyu")
                .inner_size(1280.0, 860.0)
                .min_inner_size(720.0, 480.0)
                .build()?;
            // 桥的运行时存进 Tauri 的状态：状态在，桥就在跑。
            app.manage(running);
            // 关窗不退出，收进托盘（蓝图「宿主怎么搬」第 6 步）：把关闭请求拦下来，改成藏起来。
            let handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(window) = handle.get_webview_window(WINDOW) {
                        stash(&window);
                    }
                }
            });
            // 托盘建不起来不算起不来：窗口照常用，只是没有叫回来的地方（下面那个坑）。
            if let Err(error) = tray(app.handle(), &site) {
                eprintln!("托盘建不起来（不影响用）：{error}");
            }
            // 有些桌面环境不会把新窗口抬到前面；抬不动不致命，写一句就算了。
            if let Err(e) = window.set_focus() {
                eprintln!("窗口抬不起来（不影响用）：{e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("跑不起来 Miyu 桌面端");
}

/// 建托盘：图标、菜单（「显示主窗口」「退出」），左键点图标在显示和收起来之间切。
///
/// # Errors
///
/// 托盘建不起来时交回原因：那张图标解不开、系统那边不让建。没建起来不算致命，外头写一句就算了，窗口照常用
/// （但关窗照样会收起来，就是模块头上那个坑）。
fn tray(app: &tauri::AppHandle, site: &Path) -> tauri::Result<()> {
    let (show, quit) = tray_labels(site);
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "show", show, true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", quit, true, None::<&str>)?,
        ],
    )?;
    TrayIconBuilder::with_id("tray")
        .icon(Image::from_bytes(TRAY_ICON)?)
        .tooltip("Miyu")
        .menu(&menu)
        // 左键点图标自己处理（切换显示、收起来）：只有 Windows、macOS 发得出这个事件，Linux 上左键就是弹菜单
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// 托盘菜单上那两个字：页面资源里 `tray` 的那两项。
fn tray_labels(site: &Path) -> (String, String) {
    let text = std::fs::read_to_string(site.join(TRAY_TEXT)).ok();
    tray_words(text.as_deref())
}

/// 从那一份字里挑出「显示主窗口」「退出」：读不出来、不是 JSON、缺项、空串的，都退回兜底那一份。
fn tray_words(text: Option<&str>) -> (String, String) {
    let tray = text
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
        .and_then(|value| value.get("tray").cloned());
    let pick = |key: &str, fallback: &str| {
        tray.as_ref()
            .and_then(|tray| tray.get(key))
            .and_then(Value::as_str)
            .filter(|word| !word.is_empty())
            .map_or_else(|| fallback.to_string(), str::to_string)
    };
    (pick("show", TRAY_FALLBACK.0), pick("quit", TRAY_FALLBACK.1))
}

/// 把窗口叫到前面（托盘菜单「显示主窗口」）。
fn show_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window(WINDOW) else {
        return;
    };
    if let Err(error) = window.show() {
        eprintln!("窗口显示不出来（不影响用）：{error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("窗口抬不起来（不影响用）：{error}");
    }
}

/// 显示、收起来之间切（点托盘图标；Linux 那一套后端不发这个事件，走菜单）。
fn toggle_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window(WINDOW) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        stash(&window);
    } else {
        show_window(app);
    }
}

/// 收进托盘（关窗、点图标）：窗口还活着，桥和会话照旧在跑，只是不占屏幕。
fn stash(window: &WebviewWindow) {
    if let Err(error) = window.hide() {
        eprintln!("窗口收不起来（不影响用）：{error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_words_come_from_the_resource() {
        let text = r#"{"tray": {"show": "显示主窗口", "quit": "退出"}}"#;
        assert_eq!(
            tray_words(Some(text)),
            ("显示主窗口".to_string(), "退出".to_string())
        );
    }

    #[test]
    fn tray_words_fall_back_when_the_resource_is_missing_or_broken() {
        let fallback = (TRAY_FALLBACK.0.to_string(), TRAY_FALLBACK.1.to_string());
        for text in [
            None,
            Some("这不是 JSON"),
            Some("{}"),
            Some(r#"{"tray": {}}"#),
            Some(r#"{"tray": {"show": "", "quit": ""}}"#),
            Some(r#"{"tray": {"show": 1, "quit": []}}"#),
        ] {
            assert_eq!(tray_words(text), fallback, "{text:?}");
        }
    }
}
