//! 在这台电脑的桌面上做的两样（`web-ui.md`「怎么走」第五条，2026-10-30 从演示的桥搬出来，网页软件和桥共用）：浏览器开不了本机的文件夹、
//! 给不了本机路径，由和页面在同一台电脑上的服务替它开。
//!
//! - [`reveal`]：用系统的文件管理器打开一个文件夹（技能、脚本两页的「打开目录」）。
//! - [`pick`]：开系统的选目录对话框，交回选的绝对路径（选工作区的「选择文件夹…」）。
//!
//! 只开系统的程序、等它退出，不读不写别的；谁能请（只给本机、要凭据）由用的一方管。

pub mod pick;
pub mod reveal;

/// 日志的目标。
const TARGET: &str = "miyu::desk";

/// Windows 上拉起的程序不开控制台窗口（`CREATE_NO_WINDOW`）：网页软件是在后台拉起的，自己没有控制台，拉起 PowerShell 这类控制台
/// 程序不带它，Windows 11 会新开一个终端窗口，人看到一闪的黑框（2026-10-30 桌面端提醒；核心 NW-1 修过同一种）。别的系统什么都不做。
fn no_console(command: &mut tokio::process::Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}
