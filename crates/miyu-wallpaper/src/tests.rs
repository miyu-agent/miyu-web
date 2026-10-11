//! 读各家的回答（照各家真的输出剪的样本）、认图、换没换的记号。

use std::path::PathBuf;

use crate::parse::{
    gsettings_uri, hyprpaper_active, kde_image, kde_package_pick, osascript_path, path_or_uri,
    reg_wallpaper, sniff, swww_query,
};
use crate::{Wallpaper, image_kind};

#[test]
fn awww_swww_take_the_first_screen_showing_an_image() {
    // 2026-10-11 本机 niri + awww 0.11 的输出：一个屏幕一行
    let out = ": eDP-1: 1707x960, scale: 1.5, currently displaying: image: /home/u/Pictures/Wallpapers/a b.jpg\n\
               : DP-2: 2560x1440, scale: 1, currently displaying: image: /home/u/Pictures/Wallpapers/c.png\n";
    assert_eq!(
        swww_query(out),
        Some(PathBuf::from("/home/u/Pictures/Wallpapers/a b.jpg"))
    );
    // 老版本行首没有 `: `；第一个屏幕显示纯色的跳过
    let out = "eDP-1: 1920x1080, scale: 1, currently displaying: color: 000000\nHDMI-A-1: 1920x1080, scale: 1, currently displaying: image: /w/x.webp\n";
    assert_eq!(swww_query(out), Some(PathBuf::from("/w/x.webp")));
    assert_eq!(swww_query(""), None);
}

#[test]
fn hyprpaper_takes_the_first_monitor() {
    assert_eq!(
        hyprpaper_active("eDP-1 = /home/u/w.png\nDP-1 = /home/u/v.png\n"),
        Some(PathBuf::from("/home/u/w.png"))
    );
    assert_eq!(hyprpaper_active("no wallpapers active\n"), None);
}

#[test]
fn gnome_uri_is_unquoted_and_unescaped() {
    assert_eq!(
        gsettings_uri("'file:///home/u/Pictures/my%20wall.jpg'\n"),
        Some(PathBuf::from("/home/u/Pictures/my wall.jpg"))
    );
    assert_eq!(
        gsettings_uri("'file:///home/u/%E5%A3%81%E7%BA%B8.png'\n"),
        Some(PathBuf::from("/home/u/壁纸.png"))
    );
    // 没设的、坏的转义、不是本机文件的
    assert_eq!(gsettings_uri("''\n"), None);
    assert_eq!(gsettings_uri("'file:///a%zz.png'"), None);
    assert_eq!(gsettings_uri("'https://example.invalid/a.png'"), None);
    assert_eq!(
        path_or_uri("/plain/path.jpg"),
        Some(PathBuf::from("/plain/path.jpg"))
    );
}

#[test]
fn kde_reads_the_image_of_the_first_wallpaper_section() {
    let config = "[ActionPlugins][0]\nRightButton;NoModifier=org.kde.contextmenu\n\n\
                  [Containments][1][Wallpaper][org.kde.color][General]\nColor=0,0,0\n\n\
                  [Containments][1][Wallpaper][org.kde.image][General]\nImage=file:///home/u/Pictures/k%20de.png\nSlidePaths=/usr/share/wallpapers/\n\n\
                  [Containments][2][Wallpaper][org.kde.image][General]\nImage=/usr/share/wallpapers/Next/\n";
    assert_eq!(
        kde_image(config),
        Some(PathBuf::from("/home/u/Pictures/k de.png"))
    );
    assert_eq!(
        kde_image(
            "[Containments][2][Wallpaper][org.kde.image][General]\nImage=/usr/share/wallpapers/Next/\n"
        ),
        Some(PathBuf::from("/usr/share/wallpapers/Next/"))
    );
    // 别的节里的 Image= 不算
    assert_eq!(
        kde_image("[Containments][1][General]\nImage=/x.png\n"),
        None
    );
}

#[test]
fn kde_package_picks_the_largest_resolution() {
    let names = |v: &[&str]| v.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    assert_eq!(
        kde_package_pick(&names(&["1920x1080.png", "5120x2880.png", "3840x2160.png"]))
            .map(String::as_str),
        Some("5120x2880.png")
    );
    assert_eq!(
        kde_package_pick(&names(&["screenshot.jpg", "base.png"])).map(String::as_str),
        Some("base.png")
    );
    assert_eq!(kde_package_pick(&[]), None);
}

#[test]
fn macos_and_windows_answers() {
    assert_eq!(
        osascript_path("/System/Library/Desktop Pictures/Sonoma.heic\n"),
        Some(PathBuf::from(
            "/System/Library/Desktop Pictures/Sonoma.heic"
        ))
    );
    assert_eq!(
        osascript_path("execution error: Not authorized (-1743)"),
        None
    );
    let out = "\r\nHKEY_CURRENT_USER\\Control Panel\\Desktop\r\n    WallPaper    REG_SZ    C:\\Users\\u\\Pictures\\wall.jpg\r\n\r\n";
    assert_eq!(
        reg_wallpaper(out),
        Some(PathBuf::from(r"C:\Users\u\Pictures\wall.jpg"))
    );
    assert_eq!(reg_wallpaper("    WallPaper    REG_SZ    \r\n"), None);
}

#[test]
fn only_images_the_browser_can_decode() {
    assert_eq!(sniff(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR"), Some("image/png"));
    assert_eq!(
        sniff(&[0xff, 0xd8, 0xff, 0xe0, 0, 0x10]),
        Some("image/jpeg")
    );
    assert_eq!(sniff(b"RIFF\x10\0\0\0WEBPVP8 "), Some("image/webp"));
    assert_eq!(sniff(b"\0\0\0\x1cftypavif\0\0"), Some("image/avif"));
    // macOS 的动态壁纸是 HEIC，浏览器解不了
    assert_eq!(sniff(b"\0\0\0\x18ftypheic\0\0"), None);
    assert_eq!(sniff(b"\0\0\0\x18ftypmp42\0\0"), None);
    assert_eq!(sniff(b""), None);
}

#[test]
fn signature_changes_when_the_file_changes() -> std::io::Result<()> {
    let dir = std::env::temp_dir().join(format!("miyu-wallpaper-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("w.png");
    std::fs::write(&path, b"\x89PNG\r\n\x1a\n first")?;
    assert_eq!(image_kind(&path)?, Some("image/png"));
    assert_eq!(image_kind(&dir)?, None, "目录不是图");
    let w = Wallpaper {
        path: path.clone(),
        from: "test",
        mime: "image/png",
    };
    let before = w.signature()?;
    assert_eq!(w.signature()?, before, "没动过的一样");
    std::fs::write(&path, b"\x89PNG\r\n\x1a\n second, longer")?;
    assert_ne!(w.signature()?, before, "换了内容（大小变了）的不一样");
    assert_eq!(w.read()?.len(), 23);
    std::fs::remove_dir_all(&dir)?;
    Ok(())
}
