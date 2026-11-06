//! 选目录（`/pick-dir`）：在这台电脑上开系统的选目录对话框，交回选的绝对路径（蓝图 `web.md`「人格、预设、工作区」第 4 条；
//! 2026-10-08 项目主人：选择文件夹应该打开目录选择器）。浏览器给不了本机路径；网页软件、桥和页面在同一台电脑上，由它们开。
//!
//! - Linux：依次试 `zenity`（GTK）、`kdialog`（KDE），都没有的交「开不了」，页面退回自己画的文件夹浏览器；
//! - macOS：`osascript` 的 `choose folder`；只有 `-128`（人点了取消）算取消，别的错（开始的目录不在报 `-1700` 这类）去掉开始的目录再开一次，
//!   还不成的交「开不了」，页面退回自己画的文件夹浏览器（W-1111，2026-11-06 项目主人：Mac 上点了「选择文件夹」什么都没发生——原来
//!   出错的一律当成取消，页面什么都不出）；
//! - Windows：PowerShell 的 `FolderBrowserDialog`。
//!
//! 标题、从哪个目录开始经环境变量交给对话框程序，不拼进命令行（不用管引号、转义）。点了取消的交「取消了」。
//!
//! 同一时间只开一个：已经开着一个时再来的交「开着呢」，不开第二个（2026-10-30 桌面端：Windows 上框开在后面看不见，点十几次挂了五个）。
//! Windows 上网页软件是后台起的、拿不到前台：对话框挂在一个看不见的置顶小窗下面开，盖在最上面。

use std::io::ErrorKind;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};

use tokio::process::Command;

/// 对话框的结果。
pub enum Picked {
    /// 选了这个目录（绝对路径）。
    Path(String),
    /// 点了取消。
    Cancelled,
    /// 这台机器上开不了（没有对话框程序）。
    Unavailable,
    /// 已经开着一个，这一次没开。
    Busy,
}

impl Picked {
    /// 回给页面的 JSON：`{"path"}`、`{"cancelled": true}`、`{"unavailable": true}`、`{"busy": true}`。
    pub fn json(&self) -> String {
        match self {
            Picked::Path(p) => serde_json::json!({ "path": p }).to_string(),
            Picked::Cancelled => r#"{"cancelled":true}"#.to_owned(),
            Picked::Unavailable => r#"{"unavailable":true}"#.to_owned(),
            Picked::Busy => r#"{"busy":true}"#.to_owned(),
        }
    }
}

/// 一种对话框程序：程序名、参数（`$MIYU_PICK_TITLE`、`$MIYU_PICK_START` 由程序自己读）、怎么认出人点了取消。
struct Tool {
    program: &'static str,
    args: Vec<String>,
    cancel: Cancel,
}

/// 没选出目录（退出码不是 0）的时候，怎么认出是人点了取消。
#[derive(Clone, Copy)]
enum Cancel {
    /// 退出码不是 0 就是取消（zenity、kdialog，Windows 那一段脚本）。
    Exit,
    /// 标准错误里有这个才是取消，别的是出错（osascript：人点了取消报 `-128`）。
    Says(&'static str),
}

/// 一次对话框程序跑完的结果。
#[derive(Debug, PartialEq, Eq)]
enum Ran {
    /// 选了这个目录。
    Path(String),
    /// 人点了取消。
    Cancelled,
    /// 出错了：试下一个（都不成的交「开不了」）。
    Failed,
}

/// 照退出码、标准输出、标准错误认这一次是选了、取消了还是出错了。
fn ran(cancel: Cancel, success: bool, stdout: &[u8], stderr: &[u8]) -> Ran {
    if !success {
        return match cancel {
            Cancel::Exit => Ran::Cancelled,
            Cancel::Says(code) if String::from_utf8_lossy(stderr).contains(code) => Ran::Cancelled,
            Cancel::Says(_) => Ran::Failed,
        };
    }
    let path = String::from_utf8_lossy(stdout)
        .trim_end_matches(['\r', '\n'])
        .to_owned();
    // osascript 交的目录带结尾的 `/`；根目录留着
    let path = if path.len() > 1 {
        path.trim_end_matches('/').to_owned()
    } else {
        path
    };
    if path.is_empty() {
        Ran::Cancelled
    } else {
        Ran::Path(path)
    }
}

/// macOS 上依次试的：给了开始的目录的先照它开，出错了（目录不在报 `-1700` 这类）再不带它开一次。
fn mac_tools(start: Option<&str>) -> Vec<Tool> {
    let tool = |script: &str| Tool {
        program: "osascript",
        args: vec!["-e".into(), script.into()],
        cancel: Cancel::Says("(-128)"),
    };
    let plain =
        tool("POSIX path of (choose folder with prompt (system attribute \"MIYU_PICK_TITLE\"))");
    match start {
        Some(_) => vec![
            tool(
                "POSIX path of (choose folder with prompt (system attribute \"MIYU_PICK_TITLE\") default location (POSIX file (system attribute \"MIYU_PICK_START\")))",
            ),
            plain,
        ],
        None => vec![plain],
    }
}

/// 这个系统上依次试哪几种。
fn tools(start: Option<&str>) -> Vec<Tool> {
    if cfg!(target_os = "macos") {
        return mac_tools(start);
    }
    if cfg!(windows) {
        // 挂在一个看不见的置顶小窗下面开：后台起的进程拿不到前台，不带主人窗口的框会开在别的窗口后面
        let script = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; \
            [System.Windows.Forms.Application]::EnableVisualStyles(); \
            $o = New-Object System.Windows.Forms.Form -Property @{TopMost = $true; ShowInTaskbar = $false; StartPosition = 'CenterScreen'; \
            FormBorderStyle = 'None'; Size = New-Object System.Drawing.Size(1, 1); Opacity = 0}; $o.Show(); $o.Activate(); \
            $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = $env:MIYU_PICK_TITLE; \
            if ($env:MIYU_PICK_START) { $d.SelectedPath = $env:MIYU_PICK_START }; \
            $r = $d.ShowDialog($o); $o.Close(); \
            if ($r -eq 'OK') { [Console]::Out.Write($d.SelectedPath) } else { exit 1 }";
        return vec![Tool {
            program: "powershell",
            args: vec![
                "-NoProfile".into(),
                "-STA".into(),
                "-Command".into(),
                script.into(),
            ],
            cancel: Cancel::Exit,
        }];
    }
    // zenity 从哪开始照 `--filename`，目录要带结尾的 `/`；kdialog 照第一个参数
    let mut zenity = vec![
        "--file-selection".into(),
        "--directory".into(),
        "--title".into(),
        "$MIYU_PICK_TITLE".into(),
    ];
    let mut kdialog = vec!["--getexistingdirectory".into()];
    if let Some(dir) = start {
        zenity.extend([
            "--filename".into(),
            format!("{}/", dir.trim_end_matches('/')),
        ]);
        kdialog.push(dir.into());
    }
    kdialog.extend(["--title".into(), "$MIYU_PICK_TITLE".into()]);
    vec![
        Tool {
            program: "zenity",
            args: zenity,
            cancel: Cancel::Exit,
        },
        Tool {
            program: "kdialog",
            args: kdialog,
            cancel: Cancel::Exit,
        },
    ]
}

/// 开着一个对话框。
static OPEN: AtomicBool = AtomicBool::new(false);

/// 开着的那一个关了（选完、取消、开不了、请求断了）就放开。
struct Open;

impl Drop for Open {
    fn drop(&mut self) {
        OPEN.store(false, Ordering::Release);
    }
}

/// 开对话框，等人选完；已经开着一个的交「开着呢」。
pub async fn pick_dir(title: &str, start: Option<&str>) -> Picked {
    if OPEN.swap(true, Ordering::AcqRel) {
        return Picked::Busy;
    }
    let _open = Open;
    open(title, start).await
}

async fn open(title: &str, start: Option<&str>) -> Picked {
    for tool in tools(start) {
        // 标题经环境变量交：参数里写的 `$MIYU_PICK_TITLE` 在这里换成真的字（不经 shell）
        let args: Vec<String> = tool
            .args
            .iter()
            .map(|a| {
                if a == "$MIYU_PICK_TITLE" {
                    title.to_owned()
                } else {
                    a.clone()
                }
            })
            .collect();
        let mut cmd = Command::new(tool.program);
        cmd.args(&args)
            .env("MIYU_PICK_TITLE", title)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        crate::no_console(&mut cmd);
        if let Some(dir) = start {
            cmd.env("MIYU_PICK_START", dir);
        }
        let out = match cmd.output().await {
            Ok(out) => out,
            Err(e) if e.kind() == ErrorKind::NotFound => continue,
            Err(e) => {
                tracing::warn!(target: crate::TARGET, program = tool.program, error = %e, "folder picker not started");
                continue;
            }
        };
        match ran(tool.cancel, out.status.success(), &out.stdout, &out.stderr) {
            Ran::Path(path) => return Picked::Path(path),
            Ran::Cancelled => return Picked::Cancelled,
            Ran::Failed => {
                let said = String::from_utf8_lossy(&out.stderr);
                tracing::warn!(target: crate::TARGET, program = tool.program, error = %said.trim(), "folder picker failed");
            }
        }
    }
    Picked::Unavailable
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 开着一个的时候再来的不开第二个，交「开着呢」；回给页面的是 `{"busy":true}`。
    #[tokio::test]
    async fn a_second_picker_is_not_opened_while_one_is() {
        OPEN.store(true, Ordering::Release);
        let got = pick_dir("title", None).await;
        assert!(matches!(got, Picked::Busy));
        assert_eq!(got.json(), r#"{"busy":true}"#);
        assert!(OPEN.load(Ordering::Acquire), "没开的那一次不放开别人开着的");
        OPEN.store(false, Ordering::Release);
    }

    /// osascript：只有 `-128` 算人点了取消；开始的目录不在报的 `-1700` 这类是出错，接着试下一个（W-1111，2026-11-06 Mac 上实测的原话）。
    #[test]
    fn osascript_cancel_is_only_minus_128() {
        let mac = Cancel::Says("(-128)");
        let cancelled = "15:117: execution error: 用户已取消。 (-128)\n";
        assert_eq!(ran(mac, false, b"", cancelled.as_bytes()), Ran::Cancelled);
        let missing = "15:117: execution error: 不能将“file \"Macintosh HD:nonexistent:x\"”转换为“alias”类型。 (-1700)\n";
        assert_eq!(ran(mac, false, b"", missing.as_bytes()), Ran::Failed);
        assert_eq!(
            ran(mac, true, b"/Users/me/src/\n", b""),
            Ran::Path("/Users/me/src".into())
        );
        assert_eq!(
            ran(mac, true, b"/\n", b""),
            Ran::Path("/".into()),
            "根目录留着"
        );
        assert_eq!(ran(mac, true, b"\n", b""), Ran::Cancelled);
        // zenity、kdialog、Windows 那一段：退出码不是 0 就是取消（照旧）
        assert_eq!(
            ran(Cancel::Exit, false, b"", b"Gtk-WARNING"),
            Ran::Cancelled
        );
    }

    /// macOS 上给了开始的目录的：先照它开，出错了再不带它开一次；没给的只开一次。
    #[test]
    fn mac_retries_without_the_start_folder() {
        let two = mac_tools(Some("/gone"));
        assert_eq!(two.len(), 2);
        assert!(two[0].args[1].contains("MIYU_PICK_START"));
        assert!(!two[1].args[1].contains("MIYU_PICK_START"));
        let one = mac_tools(None);
        assert_eq!(one.len(), 1);
        assert!(!one[0].args[1].contains("MIYU_PICK_START"));
    }
}
