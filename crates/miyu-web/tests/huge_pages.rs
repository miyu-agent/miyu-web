//! 常驻的 `miyu-web serve` 起来就给自己关掉透明大页（核心 YC-12，`miyu_client::heap::tune`）：系统设成 `always` 时，
//! 空闲时还给系统的堆又被合成大页填回去，常驻的进程内存不回落。起真的程序，读它的 `/proc/<进程号>/status`。只有 Linux 有。

use std::io::{BufRead, BufReader};
use std::process::Stdio;

use crate::open::{answer, launch};
use crate::support::*;

/// `/proc/<pid>/status` 里 `THP_enabled` 那一格（Linux 5.0 起有）。
fn huge_pages(pid: u32) -> Option<String> {
    let status = std::fs::read_to_string(format!("/proc/{pid}/status")).ok()?;
    status
        .lines()
        .find_map(|line| line.strip_prefix("THP_enabled:"))
        .map(|value| value.trim().to_string())
}

#[tokio::test]
async fn serve_turns_transparent_huge_pages_off_for_itself() {
    // 测试程序自己的要开着：关着的话起出来的进程照它继承，这一条就测不出什么；内核没有透明大页的也不测
    if huge_pages(std::process::id()).as_deref() != Some("1") {
        eprintln!("这台机器的测试程序没开透明大页，跳过");
        return;
    }
    let home = Home::new();
    answer(fake_core(&home), true);
    let mut serve = (launch(&home).serve)(Some(0));
    let mut child = serve.stdout(Stdio::piped()).spawn().expect("起得来");
    let pid = child.id();
    let out = child.stdout.take().expect("接了标准输出");
    let ready = within(
        "serve 起来",
        tokio::task::spawn_blocking(move || {
            let mut line = String::new();
            BufReader::new(out).read_line(&mut line).map(|_| line)
        }),
    )
    .await
    .expect("没崩")
    .expect("读得到");
    let seen = huge_pages(pid);
    child.kill().expect("停得掉");
    child.wait().expect("收得了");
    assert_eq!(ready, "ready\n", "起来了");
    assert_eq!(seen.as_deref(), Some("0"), "serve 的透明大页关着");
}
