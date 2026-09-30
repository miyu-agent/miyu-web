# 桌面端（Tauri 外壳）

同一份 `web-demo/` 页面，套一个系统自带的网页视图加一个 Rust 的窗口（设计 21 X2、蓝图
`../../docs/blueprint/web/architecture.md`「宿主」）。页面、内核、软件包一个字都不改。

## 现在做到哪了

这是蓝图「宿主怎么搬」里最小的一步：

1. **第 3 步（做了一半）**：桥拆成了两半。和传输无关的（页面文件、核心连接、`web.*` 顶替、本机文件和
   blob 的规矩、收附件、链接卡片、`@` 选文件）在 `../bridge/src/lib.rs`，是一个库；HTTP、WebSocket
   那一层是 `../bridge/src/main.rs` 这个命令行外壳；桌面端的 `src/main.rs` 用同一个库。
2. **第 4 步（先做能跑的那一半）**：`desktop/` 起桥以后拿它给的网址（`http://127.0.0.1:<端口>/#k=口令`），
   开一个本机窗口。窗口里还是浏览器那份宿主，所以拖着文件进来、选文件、剪贴板、外面的链接都照网页那份走。

还没做的（照蓝图第 4 步）：`../src/host/tauri.js`（进程间通道、自定义协议 `miyu://`、系统的选文件对话框、
窗口拖放）和标题栏软件包。做出来以后这一层不再经 HTTP、也不再用访问口令，页面那头不用改。

## 怎么跑

先编核心，再跑外壳。在工作树根目录：

```sh
cargo build -p miyu
MIYU_HOME=<单独的测试目录> MIYU_RESOURCES=$PWD/resources MIYU_CORE_BIN=$PWD/target/debug/miyu \
  DEEPSEEK_API_KEY=<key> MIYU_DEV_BASE_URL=<地址，写到 /v1> MIYU_DEV_MODEL=<模型> MIYU_DEV_WINDOW=300000 \
  cargo run --manifest-path web-demo/desktop/Cargo.toml
```

- 窗口直接开，不用打开链接、不用抄口令：口令是外壳内部起桥时现取的，只在这个进程里用。
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
```

## 在哪

| 代码 | 管什么 |
|---|---|
| `src/main.rs` | 外壳：找页面目录、起桥、开窗口；环境变量照桥那一套 |
| `tauri.conf.json` | Tauri 的配置：窗口在运行时建（`app.windows` 是空的），`frontendDist` 指 `frontend/` 那一份占位页 |
| `frontend/index.html` | 占位：窗口实际打开的是桥给的页面，这一份正常看不到 |
| `build.rs` | Tauri 的构建脚本 |
| `icons/icon.png` | 窗口图标（照 `../resources/assets/miyu-avatar.png` 拷的） |
