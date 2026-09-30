//! Tauri 的构建脚本：把 `tauri.conf.json`、图标这些编译进上下文。
//!
//! 照仓库的文档注释规矩：能出错的函数写清为什么，这里没有要交回的东西，起不来直接 panic（Tauri 的约定）。

fn main() {
    tauri_build::build();
}
