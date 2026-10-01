# 桌面端（Tauri 外壳）

同一份 `web-demo/` 页面，套一个系统自带的网页视图加一个 Rust 的窗口（设计 21 X2、蓝图
`../../docs/blueprint/web/architecture.md`「宿主」）。页面、内核、软件包一个字都不改。

## 现在做到哪了

这是蓝图「宿主怎么搬」里最小的一步：

1. **第 3 步（做完了）**：桥拆成了两半。和传输无关的（页面文件、核心连接、`web.*` 顶替、本机文件和
   blob 的规矩、收附件、链接卡片、`@` 选文件）在 `../bridge/src/lib.rs`，是一个库；HTTP、WebSocket
   那一层是 `../bridge/src/main.rs` 这个命令行外壳；桌面端的 `src/main.rs` 用同一个库。
2. **第 4 步（先做能跑的那一半）**：`desktop/` 起桥以后拿它给的网址（`http://127.0.0.1:<端口>/#k=口令`），
   开一个本机窗口。窗口里还是浏览器那份宿主，所以拖着文件进来、选文件、剪贴板、外面的链接都照网页那份走。
3. **第 6 步（托盘，2026-10-01）**：常驻——**关掉窗口不退出，收进托盘**，托盘菜单里「显示主窗口」叫回来、
   「退出」才真走；点图标在显示和收起来之间切（只有 Windows、macOS 发得出点击事件）。页面那头一个字
   不改：收起来的时候那条连接、会话、回合照旧留着。菜单上那两个字从页面资源
   `resources/text/zh.json` 的 `tray` 读（选语言是页面的设置项，外壳还不知道，现在一律照默认那一份中文），
   读不到用兜底那一份；图标是 `icons/tray.png`，编译时进程序。

还没做的（照蓝图第 4 步）：`../src/host/tauri.js`（进程间通道、自定义协议 `miyu://`、系统的选文件对话框、
窗口拖放）和标题栏软件包。做出来以后这一层不再经 HTTP、也不再用访问口令，页面那头不用改。托盘那边还没做的：
登录自启、单实例（再跑一个就是第二个窗口加第二个桥）。

## 怎么跑

先编核心，再跑外壳。在工作树根目录：

```sh
cargo build -p miyu
MIYU_HOME=<单独的测试目录> MIYU_RESOURCES=$PWD/resources MIYU_CORE_BIN=$PWD/target/debug/miyu \
  DEEPSEEK_API_KEY=<key> MIYU_DEV_BASE_URL=<地址，写到 /v1> MIYU_DEV_MODEL=<模型> MIYU_DEV_WINDOW=300000 \
  cargo run --manifest-path web-demo/desktop/Cargo.toml
```

- 窗口直接开，不用打开链接、不用抄口令：口令是外壳内部起桥时现取的，只在这个进程里用。
- **关掉窗口只是收进托盘**，要真退出走托盘菜单里的「退出」。
- 系统的状态栏没有宿主时（没有会话总线、无头跑、桌面本身不显示托盘图标），图标不会出现，`build()` 也不报错；
  这时的行为是「关窗就再也叫不回来」——已知的坑，等做单实例、登录自启那一批时一并收（现在只能从外面结束进程）。
- 端口由系统挑一个空的（桥库传 0），不会和已经开着的网页演示（8765）撞上。
- 环境变量写在命令前面，不要 `export`；key 和地址只放在命令里，不写进任何文件。
- 桥的库就是网页演示那一份：核心没在跑、给了 `MIYU_CORE_BIN` 的会拉起来；新会话在**你跑这条命令的目录**里干活。
- 换桥的代码（`../bridge/`）要重新编外壳；换页面（`../src/`、`../styles/`）刷新窗口就行。

## 测试

和网页演示同一套，桌面端只是多一个外壳：

```sh
node --test web-demo/tests
cargo clippy --manifest-path web-demo/bridge/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path web-demo/bridge/Cargo.toml
cargo clippy --manifest-path web-demo/desktop/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path web-demo/desktop/Cargo.toml
```

## 在哪

| 代码 | 管什么 |
|---|---|
| `src/main.rs` | 外壳：找页面目录、起桥、开窗口、托盘和「关窗收起来」；环境变量照桥那一套 |
| `tauri.conf.json` | Tauri 的配置：窗口在运行时建（`app.windows` 是空的），`frontendDist` 指 `frontend/` 那一份占位页 |
| `frontend/index.html` | 占位：窗口实际打开的是桥给的页面，这一份正常看不到 |
| `build.rs` | Tauri 的构建脚本 |
| `icons/icon.png` | 窗口图标（照 `../resources/assets/miyu-avatar.png` 拷的） |
| `icons/tray.png` | 托盘图标（同一张头像缩到 32×32） |
