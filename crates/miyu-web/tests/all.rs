//! 这个 crate 的集成测试并成一个程序（施工 0-3 三补，`docs/construction/0-3-三平台CI（三补）.md`）：一个文件一个模块，
//! `support` 只编一次，只链接一次。自己装日志订阅者的几个照旧各是各的程序（调用点记下谁在听是全进程的，同一个进程里
//! 别的测试同时碰到会漏听；全局的一个进程只能装一次），
//! 在 `Cargo.toml` 里另列。新加的测试文件在下面添一行。

mod support;

// 核心的替身：`/media`、软件后台页两份测试共用（施工 F-6 下）
#[path = "media/fake.rs"]
mod fake;

mod backstage;
mod desk;
mod jump;
mod listen;
mod media;
mod open;
mod open_flags;
mod serve;
// 停掉在跑的网页软件（W-1091）
mod stop;
// 网页外观（核心 TH-1）
mod theme;
// 本机免密要交接票（W-1089）
mod ticket;
mod ws;
// 发布前第二轮审查的防御性测试（2026-10-30）
mod audit2;
// 发布前第四轮审查的防御性测试（2026-11-02）
mod audit4;
