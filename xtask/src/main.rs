//! 网页仓库的门禁程序（照 miyu-im 的 `xtask`）：现在只有 `cargo xtask licenses` 一项，查发布的四个平台上用得到的第三方依赖，许可证
//! 都能和 AGPL-3.0-or-later 合在一起发（[`licenses`]）。格式、clippy、文档、测试、行数照旧是 CI 里一步一步的 cargo 命令。

mod licenses;

use std::path::{Path, PathBuf};
use std::process::ExitCode;

fn main() -> ExitCode {
    match std::env::args().nth(1).as_deref() {
        Some("licenses") => check_licenses(),
        _ => {
            eprintln!("用法：cargo xtask licenses");
            ExitCode::from(2)
        }
    }
}

/// 仓库的根目录。
fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask 在仓库根目录下的 xtask/ 里，一定有上一级目录")
        .to_path_buf()
}

/// 跑一遍许可证：都能用的印一行、退出码 0；有问题的一包一行、退出码 1。
fn check_licenses() -> ExitCode {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_string());
    let problems = licenses::check(&root(), &cargo);
    if problems.is_empty() {
        println!(
            "许可证：{} 四个平台上的第三方依赖都能和 AGPL-3.0-or-later 合在一起发",
            licenses::PLATFORMS.join("、")
        );
        return ExitCode::SUCCESS;
    }
    for problem in &problems {
        eprintln!("许可证：{problem}");
    }
    ExitCode::from(1)
}
