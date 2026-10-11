//! 读各家的回答：命令的输出、配置文件里的那一行，换成图的路径。纯函数，每个平台上都编、都测（跑命令在 `probe.rs`）。

use std::path::PathBuf;

/// 照文件开头几个字节认是不是浏览器认得的图，交媒体类型；认不出的（HEIC、视频……）是 `None`。
pub fn sniff(head: &[u8]) -> Option<&'static str> {
    if head.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    if head.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if head.len() >= 12 && head.starts_with(b"RIFF") && &head[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if head.starts_with(b"GIF87a") || head.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if head.starts_with(b"BM") {
        return Some("image/bmp");
    }
    if head.len() >= 12
        && &head[4..8] == b"ftyp"
        && (&head[8..12] == b"avif" || &head[8..12] == b"avis")
    {
        return Some("image/avif");
    }
    None
}

/// awww、swww 的 `query`：一个屏幕一行，`: eDP-1: 2560x1600, scale: 1, currently displaying: image: /路径`（老版本行首没有 `: `）；
/// 交第一个显示图的屏幕的那张（显示纯色的是 `color: …`，不算）。
pub fn swww_query(out: &str) -> Option<PathBuf> {
    out.lines().find_map(|line| {
        let (_, path) = line.split_once("currently displaying: image: ")?;
        absolute(path.trim())
    })
}

/// Hyprland 的 `hyprctl hyprpaper listactive`：一个屏幕一行 `eDP-1 = /路径`；交第一行的。
pub fn hyprpaper_active(out: &str) -> Option<PathBuf> {
    out.lines()
        .find_map(|line| absolute(line.split_once(" = ")?.1.trim()))
}

/// GNOME 的 `gsettings get org.gnome.desktop.background picture-uri`：`'file:///路径'`（带引号，路径照网址转义）。
pub fn gsettings_uri(out: &str) -> Option<PathBuf> {
    let value = out.trim().trim_matches('\'');
    path_or_uri(value)
}

/// KDE Plasma 的 `plasma-org.kde.plasma.desktop-appletsrc`：每个桌面一节 `[Containments][N][Wallpaper][org.kde.image][General]`，
/// 里面 `Image=` 是图（`file://` 网址或路径），也可能是一个壁纸包的目录（再照 [`kde_package_pick`] 挑一张）。交第一节的。
pub fn kde_image(config: &str) -> Option<PathBuf> {
    let mut in_image = false;
    for line in config.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_image = line.ends_with("[Wallpaper][org.kde.image][General]");
            continue;
        }
        if in_image && let Some(value) = line.strip_prefix("Image=") {
            return path_or_uri(value.trim());
        }
    }
    None
}

/// KDE 的壁纸包（目录）：`contents/images/` 下一张张照分辨率起名（`3840x2160.png`），挑最大的；名字不是分辨率的挑排在最前的。
pub fn kde_package_pick(names: &[String]) -> Option<&String> {
    let area = |name: &String| {
        let stem = name
            .rsplit_once('.')
            .map_or(name.as_str(), |(stem, _)| stem);
        let (w, h) = stem.split_once('x')?;
        Some(w.parse::<u64>().ok()? * h.parse::<u64>().ok()?)
    };
    names
        .iter()
        .filter(|n| area(n).is_some())
        .max_by_key(|n| area(n))
        .or_else(|| names.iter().min())
}

/// macOS 的 `osascript`（问 System Events 现在桌面的图）：一行路径。
pub fn osascript_path(out: &str) -> Option<PathBuf> {
    absolute(out.trim())
}

/// Windows 的 `reg query "HKCU\Control Panel\Desktop" /v WallPaper`：`    WallPaper    REG_SZ    C:\…\图.jpg`。
pub fn reg_wallpaper(out: &str) -> Option<PathBuf> {
    out.lines().find_map(|line| {
        let (name, value) = line.split_once("REG_SZ")?;
        if !name.trim().eq_ignore_ascii_case("WallPaper") {
            return None;
        }
        let value = value.trim();
        (!value.is_empty()).then(|| PathBuf::from(value))
    })
}

/// 一个值是 `file://` 网址（照网址转义解开）还是绝对路径；都不是的是 `None`。
pub fn path_or_uri(value: &str) -> Option<PathBuf> {
    match value.strip_prefix("file://") {
        Some(rest) => absolute(&percent_decode(rest)?),
        None => absolute(value),
    }
}

/// 只要绝对路径（Unix 的 `/` 打头、Windows 的 `C:\`）。
fn absolute(path: &str) -> Option<PathBuf> {
    let windows =
        path.len() > 2 && path.as_bytes()[1] == b':' && path.as_bytes()[0].is_ascii_alphabetic();
    (path.starts_with('/') || windows).then(|| PathBuf::from(path))
}

/// 照网址的转义解开（`%20` → 空格）；解出来不是 UTF-8 的、转义写坏了的是 `None`。
fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}
