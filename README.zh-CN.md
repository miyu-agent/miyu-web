<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

# Miyu 网页界面

> <sub>本文档由 Anthropic 的 Claude Fable 5.2 生成。</sub>

这个仓库是 Miyu 的网页界面，让你在浏览器里使用 Miyu。网页软件 `miyu-web` 负责提供页面文件，并把浏览器的 WebSocket 连接转成核心的协议。它默认只监听本机的端口，在 `设置 → 通用 → 访问` 里可以开放给局域网。

核心在 [miyu-agent/miyu](https://github.com/miyu-agent/miyu)。这个仓库在 `Cargo.toml` 里用 git 依赖固定核心的一个提交，并且只通过核心提供的 `miyu-client` 使用核心的功能。

使用方法可以看手册的[网页界面](https://github.com/miyu-agent/miyu/blob/main/docs/zh/guide/heads/web.md)；部署到服务器、从其他电脑打开的方法见[常驻和服务器](https://github.com/miyu-agent/miyu/blob/main/docs/zh/guide/service.md)。

## 仓库里有什么

这一节列出仓库里的几个目录、各自的内容和对应的设计说明。

| 目录 | 内容 | 设计说明 |
|---|---|---|
| `crates/miyu-web` | 网页软件，提供 `miyu-web serve` 和 `miyu-web open` 两条命令 | `docs/blueprint/web-module.md` |
| `crates/miyu-webserve` | 网页端口的底层：提供页面文件，核对 `Host` 和 `Origin`，把 `/ws` 原样转给核心 | `docs/blueprint/webserve.md` |
| `web-demo/` | 页面。页面使用原生 JavaScript，按 ES 模块组织，不使用框架，也不需要构建。运行方法见 `web-demo/README.zh-CN.md` | `docs/blueprint/web.md`、`web-ui.md` |
| `webui/` | 网页界面的软件包（编号是 `webui`，配置键的前缀是 `web`），包含清单、常量 `web.json` 和 matugen 模板 | |

`webui/` 有两种安装方式：发布新版本时，它随核心一起安装到资源目录的 `packages/webui/`；或者用 `tools/pack-web.py` 打成包文件 `webui-<版本>-<系统>.miyu`，再从软件源安装。

发布新版本的方法是推送 `v<版本>` 的标签。推送以后，`.github/workflows/release.yml` 会按照官方的打包模板，为每种系统打一个包并上传到发行版页面。版本号写在 `Cargo.toml` 和 `webui/package.toml` 两处，两处必须相同。

## 在其他设备上使用

在 `设置 → 通用 → 访问` 里打开 `局域网访问` 并设置好访问密码以后，同一个局域网里的手机和电脑就可以用这台电脑的地址和端口打开网页界面，设置页上会显示网址。

> 局域网访问使用明文 HTTP，不加密：同一个网络里的人能看到访问密码、登录令牌和对话内容。只在信得过的网络（例如自己家里）打开它。如果要在外面或者不信任的网络上使用，先通过 [Tailscale](https://tailscale.com/) 或 [WireGuard](https://www.wireguard.com/) 连回家里再打开，这样流量在隧道里是加密的。

通过这台电脑上的反向代理（例如 nginx、cloudflared）打开的连接，一律当作其他设备：需要输入访问密码，并且只能在这台电脑上使用的功能（例如选择这台电脑上的目录、读取它的文件）无法使用。使用反向代理时需要注意：

- 代理要加上转发用的请求头（例如 `Forwarded`、`X-Forwarded-For`、`X-Real-IP`），nginx 需要在配置里写上这些请求头。
- 网页软件只接受 `Host` 是 `127.0.0.1`、`localhost`、`[::1]` 加端口的请求；监听局域网时，也接受这台电脑的 IP 加端口。它不接受域名。
- `/ws` 只接受 `Origin` 是 `http://` 加上面这些地址的连接。
- 如果代理用自己的域名或者 HTTPS（包括 `tailscale serve` 提供的 HTTPS 地址）提供页面，请求会被拒绝（403）。

> **不加转发请求头的纯 TCP 转发无法被识别为其他设备**。通过 `ssh -L` 端口转发、`socat`、`tailscale serve --tcp` 这类方式转发进来的连接，在网页软件看来就是这台电脑自己：通过它打开网页界面的人可以读取这台电脑上的文件，还可以不输入旧密码就修改访问密码。不要用这些方式把网页界面开放给其他人；只有你自己使用、并且另一端的设备也属于你，才可以这样做。

## 测试

这一节是运行测试的方法。运行：

```sh
cargo test
MIYU_RESOURCES=<核心检出>/resources node --test 'web-demo/tests/**/*.test.js'
cargo test --manifest-path web-demo/bridge/Cargo.toml
cargo xtask licenses
```

- 页面的纯逻辑测试需要核心的出厂资源（界面上显示的文字）。`<核心检出>` 是核心仓库的检出，它的提交要和 `Cargo.toml` 里固定的提交相同。
- `cargo xtask licenses` 检查发布的四个平台上用到的第三方依赖，确认它们的许可证都可以和 AGPL-3.0-or-later 一起分发，这个检查的实现在 `xtask/`。

## 许可证

这个仓库使用 AGPL-3.0-or-later 许可证，全文见 `LICENSE`。

网页界面本身就是在网络上提供服务的程序。按照 AGPL 第 13 条，把修改过的版本提供给其他人使用时，要让使用的人能够拿到源码。`设置 → 通用` 页的最下面有一行指向源码的链接，修改过的版本需要把这个链接换成自己的源码地址。

不是这个仓库自己编写的内容沿用它们原来的许可证，AGPL 只适用于这个仓库自己编写的部分：

- 依赖沿用各自的许可证；`Cargo.toml` 里的 Rust 包（crate）以 crates.io 上标明的许可证为准。
- 仓库里收录的第三方资源（字体、图标、复制进来的库）沿用各自的许可证，许可证原文随仓库附带，见下表。

| 资源 | 许可证 | 原文 |
|---|---|---|
| Lucide 图标（lucide-static 1.55.0，`web-demo/resources/lucide.json`、`lucide-all.json`；像素皮肤的图标 `web-demo/packages/skin-pixel/icons.json` 是按照它画到格子上的） | ISC（其中来自 Feather 的图标另带 MIT） | `web-demo/resources/LICENSE-lucide.txt` |
| Press Start 2P 字体（`web-demo/resources/fonts/press-start.ttf`，上游原版 v3.000，没有子集化，没有改名） | SIL OFL 1.1 | `web-demo/resources/fonts/OFL-press-start.txt` |
| 站酷庆科黄油体（`web-demo/resources/fonts/zcool-qingke.woff2`） | SIL OFL 1.1 | `web-demo/resources/fonts/OFL-zcool-qingke.txt` |
| 缝合像素字体 Fusion Pixel（`web-demo/packages/skin-pixel/fonts/fusion-pixel-12px.woff2`，包含方舟像素、Cubic 11、Galmuri） | SIL OFL 1.1 | `web-demo/packages/skin-pixel/fonts/OFL-fusion-pixel.txt`、`LICENSES/` |
| Prism 1.29.0（`web-demo/vendor/prism/`） | MIT | `web-demo/vendor/prism/LICENSE` |
| KaTeX 0.18.4 的代码（`web-demo/vendor/katex/katex.min.js`、`katex.min.css`） | MIT | `web-demo/vendor/katex/LICENSE` |
| KaTeX 0.18.4 的字体（`web-demo/vendor/katex/fonts/*.woff2`，原样附带，保留 KaTeX_Main 等名字） | SIL OFL 1.1 | `web-demo/vendor/katex/fonts/OFL.txt` |
| material-color-utilities 0.4.0（`web-demo/src/lib/md3/vendor/mcu.min.js`，只挑出取色需要的几项，打包成一个文件） | Apache-2.0 | `web-demo/src/lib/md3/vendor/LICENSE` |
| qrcode-generator 2.0.4（`web-demo/src/lib/qr/vendor/qrcode.mjs`，npm 包里的 `dist/qrcode.mjs` 原样附带，用来生成局域网地址的二维码） | MIT | `web-demo/src/lib/qr/vendor/LICENSE` |

上表里的资源，以及编进网页软件的第三方 Rust 包，它们的版权声明和许可证原文合并在 `webui/THIRD-PARTY-LICENSES.txt` 里。这个文件由 `cargo xtask notices` 生成，随网页界面的软件包一起发布。添加或者升级依赖、资源以后要重新生成这个文件，CI 会检查它是不是最新的。

吉祥物、默认头像和标志由项目自己制作，和代码一样使用 AGPL-3.0-or-later。它们都在 `web-demo/resources/assets/` 下：`mascot.png`、`miyu-avatar.png`、`logo.png`、`logo-16.png`、`logo-32.png`、`logo-192.png`、`logo-512.png`、`mark.svg`、`mark-figure.svg`，以及 `logo-old-silhouette.svg`（旧的剪影稿，只留作素材，页面不会加载它）。

模型供应商的名称和图标是各自所有者的商标。网页界面里显示的供应商图标不随软件包发布，由核心在运行时从 models.dev、lobe-icons 获取并缓存，详细的见核心仓库的 `internal/blueprint/licenses.md`。

复制进来的库的用法见 `web-demo/README.zh-CN.md` 的「复制进来的库」一节。
