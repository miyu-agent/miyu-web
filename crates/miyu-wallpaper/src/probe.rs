//! 问哪几家、先问谁（照这台电脑的平台、桌面）：每一家交图的路径，没装、没设的交 `None`；读回答在 `parse.rs`。

use std::io;
use std::path::PathBuf;

use crate::parse;

/// 问一家：照深浅交图的路径。
pub type Ask = fn(bool) -> io::Result<Option<PathBuf>>;

/// 这台电脑上依次问的几家。
#[cfg(all(unix, not(target_os = "macos")))]
pub fn sources() -> Vec<(&'static str, Ask)> {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mut out: Vec<(&'static str, Ask)> = Vec::new();
    // 认得出桌面的先问它自己的设置
    if desktop.contains("kde") {
        out.push(("kde", kde));
    }
    if ["gnome", "unity", "budgie", "pantheon"]
        .iter()
        .any(|d| desktop.contains(d))
    {
        out.push(("gnome", gnome));
    }
    // 窗口管理器（niri、sway、Hyprland……）上常用的几个壁纸程序
    out.push(("awww", |_| swww("awww")));
    out.push(("swww", |_| swww("swww")));
    if std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_some() {
        out.push(("hyprpaper", hyprpaper));
    }
    out
}

/// 这台电脑上依次问的几家。
#[cfg(target_os = "macos")]
pub fn sources() -> Vec<(&'static str, Ask)> {
    vec![("macos", macos)]
}

/// 这台电脑上依次问的几家。
#[cfg(windows)]
pub fn sources() -> Vec<(&'static str, Ask)> {
    vec![("windows", windows)]
}

/// awww、swww：`query`。
#[cfg(all(unix, not(target_os = "macos")))]
fn swww(program: &str) -> io::Result<Option<PathBuf>> {
    Ok(crate::run(program, &["query"])?
        .as_deref()
        .and_then(parse::swww_query))
}

/// Hyprland 的 hyprpaper。
#[cfg(all(unix, not(target_os = "macos")))]
fn hyprpaper(_dark: bool) -> io::Result<Option<PathBuf>> {
    Ok(crate::run("hyprctl", &["hyprpaper", "listactive"])?
        .as_deref()
        .and_then(parse::hyprpaper_active))
}

/// GNOME：深色先问 `picture-uri-dark`，没设的照 `picture-uri`。
#[cfg(all(unix, not(target_os = "macos")))]
fn gnome(dark: bool) -> io::Result<Option<PathBuf>> {
    let keys: &[&str] = if dark {
        &["picture-uri-dark", "picture-uri"]
    } else {
        &["picture-uri"]
    };
    for key in keys {
        if let Some(path) = crate::run("gsettings", &["get", "org.gnome.desktop.background", key])?
            .as_deref()
            .and_then(parse::gsettings_uri)
        {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

/// KDE Plasma：读配置文件（`$XDG_CONFIG_HOME`，没设的 `~/.config`）；设的是壁纸包的，照深浅挑包里的一张。
#[cfg(all(unix, not(target_os = "macos")))]
fn kde(dark: bool) -> io::Result<Option<PathBuf>> {
    let Some(config) = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    else {
        return Ok(None);
    };
    let text = match std::fs::read_to_string(config.join("plasma-org.kde.plasma.desktop-appletsrc"))
    {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    let Some(path) = parse::kde_image(&text) else {
        return Ok(None);
    };
    if !path.is_dir() {
        return Ok(Some(path));
    }
    let dirs: &[&str] = if dark {
        &["contents/images_dark", "contents/images"]
    } else {
        &["contents/images"]
    };
    for dir in dirs {
        let dir = path.join(dir);
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e),
        };
        let mut names = Vec::new();
        for entry in entries {
            // 名字不是 UTF-8 的不会是照分辨率起的名，不挑
            if let Ok(name) = entry?.file_name().into_string() {
                names.push(name);
            }
        }
        if let Some(name) = parse::kde_package_pick(&names) {
            return Ok(Some(dir.join(name)));
        }
    }
    Ok(None)
}

/// macOS：问 System Events 现在桌面的图（第一次会问要不要允许，不允许的出错退出，就是读不到）。
#[cfg(target_os = "macos")]
fn macos(_dark: bool) -> io::Result<Option<PathBuf>> {
    let script = "tell application \"System Events\" to get picture of current desktop";
    Ok(crate::run("osascript", &["-e", script])?
        .as_deref()
        .and_then(parse::osascript_path))
}

/// Windows：注册表里的 `WallPaper`。
#[cfg(windows)]
fn windows(_dark: bool) -> io::Result<Option<PathBuf>> {
    Ok(crate::run(
        "reg",
        &["query", r"HKCU\Control Panel\Desktop", "/v", "WallPaper"],
    )?
    .as_deref()
    .and_then(parse::reg_wallpaper))
}
