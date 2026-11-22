<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

# 网页界面的页面

> <sub>本文档由 Anthropic 的 Claude Fable 5.2 生成。</sub>

这个目录是网页界面的页面部分，它连接真实的核心。页面的样子和这样设计的原因，见 `docs/blueprint/web.md`。

页面使用原生 JavaScript，按 ES 模块组织，不使用框架，也不需要构建。这个目录不在仓库的 Cargo 工作空间（workspace）里，所以仓库统一的检查不包括它。

## 运行

因为浏览器只能使用 WebSocket，而核心监听的是本机的套接字，所以两者之间需要一个桥（`bridge/`）。桥负责提供页面文件，把 `/ws` 转给核心，并替页面出示本机的令牌。

核心在另一个仓库（`miyu-agent/miyu`）。运行之前，先在核心仓库的检出里编译一次核心（`cargo build -p miyu`），下面命令里的 `<核心检出>` 要换成它的路径。运行：

```sh
# 第一次运行：在核心检出的根目录建立数据根的骨架，并写入模型的配置（etc/config.toml；已经有配置时不会覆盖）
MIYU_DEV_BASE_URL=<地址，写到 /v1> MIYU_DEV_MODEL=<模型> MIYU_DEV_WINDOW=300000 cargo xtask dev-home <单独的测试目录>
# 回到这个仓库的根目录
cargo build --manifest-path web-demo/bridge/Cargo.toml
MIYU_HOME=<同一个目录> MIYU_RESOURCES=<核心检出>/resources MIYU_CORE_BIN=<核心检出>/target/debug/miyu \
  MIYU_DEV_API_KEY=<密钥> MIYU_DEV_BASE_URL=<地址，写到 /v1> web-demo/bridge/target/debug/miyu-web-bridge 8766
```

桥启动以后会输出一个链接（`http://127.0.0.1:8766/#k=…`），用浏览器打开它即可。链接里的口令只在这一次启动期间有效，没有口令就无法连接。命令最后的数字是端口，不写时使用 8765。

运行时需要注意：

- 模型来自数据根里的配置。`dev-home` 会写入一家名叫 `dev` 的供应商，它的地址引用环境变量 `MIYU_DEV_BASE_URL`，密钥引用 `MIYU_DEV_API_KEY`，配置文件里不保存地址和密钥。运行 `dev-home` 时需要设置好地址，它只检查地址的写法，不会把地址写进文件。
- 环境变量写在命令前面，不要用 `export` 导出。密钥和地址只放在命令里，不要写进任何文件。
- 核心没有运行时，桥会用 `MIYU_CORE_BIN` 启动它。由于核心只在启动的那一刻读取环境变量，所以修改环境变量以后要先停止核心。桥停止时，核心不会跟着停止。
- 新会话的工作目录是启动桥时所在的目录。
- 时间线上工具的显示名称和结果的一句话说明，由桥按照 `MIYU_RESOURCES` 读取（`web.human`）。修改了桥的代码以后，要重新编译并重启桥。
- 桥还暂时代替核心将来的网页模块做几件事（见 `docs/blueprint/web.md` 的最后一节）：提供本机文件和二进制数据（`/file`、`/blob`，需要口令，不提供数据根里的文件）；抓取链接卡片（`web.link_preview`、`/link-image`，需要能够联网，不抓取内网地址）。
- 预览工作区：让 AI 用 `write` 把产物写进这个会话工作目录下的 `artifacts/`，写完以后右侧会自动打开预览（窗口足够宽时）。

## 测试

页面的纯逻辑部分有测试，测试用仓库里的事件样本作为输入，不需要打开浏览器。测试覆盖的内容有：事件转成条目、时间线的分段和文字、差异、左栏的一项、输入框下面的一行、数字的写法、回答里 Markdown 的解析和上色、预览工作区里放什么内容、媒体卡片。

运行：

```sh
MIYU_RESOURCES=<核心检出>/resources node --test 'web-demo/tests/**/*.test.js'
cargo clippy --manifest-path web-demo/bridge/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path web-demo/bridge/Cargo.toml
```

Node 只在开发时使用，页面本身不需要 Node。

## 复制进来的库

下面这些库用来显示回答里的 Markdown 和生成二维码。它们都按原样复制进来，没有经过修改；页面只从本机读取它们，不会连接外部的地址。

| 库 | 版本 | 许可证 | 复制了什么 | 用法 |
|---|---|---|---|---|
| [Prism](https://prismjs.com) | 1.29.0 | MIT | `vendor/prism/prism.min.js`：由需要的几种语言拼成的一个文件，文件开头写着重新拼接的方法 | 用 `data-manual` 加载，只调用 `Prism.tokenize`（`src/markdown/highlight.js`） |
| [KaTeX](https://katex.org) | 0.18.4 | 代码使用 MIT（`vendor/katex/LICENSE`），字体使用 SIL OFL 1.1（`vendor/katex/fonts/OFL.txt`） | `vendor/katex/katex.min.js`、`vendor/katex/katex.min.css`、`vendor/katex/fonts/*.woff2` | 调用 `katex.render`（`src/markdown/math.js`） |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 2.0.4 | MIT（`src/lib/qr/vendor/LICENSE`，取自上游仓库） | npm 包里的 `dist/qrcode.mjs`，放在 `src/lib/qr/vendor/` | 调用 `qrcode(0, 'M')`、`addData`、`isDark`（`src/lib/qr/index.js`），用来生成局域网地址的二维码 |

> qrcode-generator 放在 `src/lib/` 下而不是 `vendor/` 下，是因为页面里的软件包只能 `import` `src/lib/` 里的文件，material-color-utilities 也采用同样的做法。
