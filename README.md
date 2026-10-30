## Miyu 网页

在浏览器里用 Miyu：网页软件 `miyu-web` 只听本机的端口，给页面文件，把浏览器的 WebSocket 转成核心协议。核心在 [miyu-agent/miyu](https://github.com/miyu-agent/miyu)，这里照 `Cargo.toml` 的 git 依赖钉住核心的一个提交，只经门面 `miyu-client` 用核心的东西（核心仓库的设计 `32-仓库拆分.md`）。

- `crates/miyu-web`：网页软件（`miyu-web serve`、`miyu-web open`），图纸 `docs/blueprint/web-module.md`。
- `crates/miyu-webserve`：只听本机的网页端口的底子：给页面文件、核对 Host 和 Origin、`/ws` 原样转给核心，图纸 `docs/blueprint/webserve.md`。
- `web-demo/`：页面（原生 JavaScript，按 ES 模块组织，不用框架、不用构建），图纸 `docs/blueprint/web.md`、`web-ui.md`；怎么跑见 `web-demo/README.md`。
- `miyu-webui/`：网页的软件包（包编号 `miyu-webui`，配置键前缀 `web`）：清单、常量 `web.json`、matugen 模板；发版时随核心一起装进资源目录的 `packages/miyu-webui/`，或经 `tools/pack-web.py` 打成包文件 `miyu-webui-<版本>-<系统>.miyu` 从软件源装。

### 测试

```sh
cargo test
MIYU_RESOURCES=<核心检出>/resources node --test 'web-demo/tests/**/*.test.js'
cargo test --manifest-path web-demo/bridge/Cargo.toml
cargo xtask licenses
```

`cargo xtask licenses` 查发布的四个平台上用得到的第三方依赖，许可证都能和 AGPL-3.0-or-later 合在一起发（`xtask/`）。

网页的纯逻辑测试要核心的出厂资源（给人看的字）：`<核心检出>` 是核心仓库的检出，提交和 `Cargo.toml` 里钉的一样。

## 许可证

AGPL-3.0-or-later（2026-10-26 项目主人定：核心和第一方程序用 AGPL-3.0-or-later，开发包、作者模板、协议参考用 Apache-2.0），全文见 `LICENSE`。网页本身在网上提供服务：照 AGPL 第 13 条，改过的版本给别人用时要让用的人拿得到源码，设置「通用」页最底下有一行指向源码的链接（改了的版本把链接换成自己的源码地址）。不是这个仓库自己写的东西照它们原来的许可证，AGPL 只管这里自己写的部分：依赖照各自的 license（`Cargo.toml` 里的 crate 照 crates.io 上写的）；仓库里收的第三方资源（字体、图标、拷来的库）照各自的许可证，原文随附：

| 资源 | 许可证 | 原文 |
|---|---|---|
| Lucide 图标（lucide-static 1.55.0，`web-demo/resources/lucide.json`、`lucide-all.json`；像素皮肤的图标 `web-demo/packages/skin-pixel/icons.json` 是照它画到格子上的） | ISC（其中从 Feather 来的那些另带 MIT） | `web-demo/resources/LICENSE-lucide.txt` |
| Press Start 2P 字体（`web-demo/resources/fonts/press-start.ttf`，上游原版 v3.000 原样带着，没有子集化、没改名） | SIL OFL 1.1 | `web-demo/resources/fonts/OFL-press-start.txt` |
| 站酷庆科黄油体（`web-demo/resources/fonts/zcool-qingke.woff2`） | SIL OFL 1.1 | `web-demo/resources/fonts/OFL-zcool-qingke.txt` |
| 缝合像素字体 Fusion Pixel（`web-demo/packages/skin-pixel/fonts/fusion-pixel-12px.woff2`，含方舟像素、Cubic 11、Galmuri） | SIL OFL 1.1 | `web-demo/packages/skin-pixel/fonts/OFL-fusion-pixel.txt`、`LICENSES/` |
| Prism 1.29.0（`web-demo/vendor/prism/`） | MIT | `web-demo/vendor/prism/LICENSE` |
| KaTeX 0.18.4 的代码（`web-demo/vendor/katex/katex.min.js`、`katex.min.css`） | MIT | `web-demo/vendor/katex/LICENSE` |
| KaTeX 0.18.4 的字体（`web-demo/vendor/katex/fonts/*.woff2`，原样带着，保留名 KaTeX_Main 等） | SIL OFL 1.1 | `web-demo/vendor/katex/fonts/OFL.txt` |
| material-color-utilities 0.4.0（`web-demo/src/lib/md3/vendor/mcu.min.js`，挑了取色要用的几样打成一个文件） | Apache-2.0 | `web-demo/src/lib/md3/vendor/LICENSE` |

吉祥物和默认头像（`web-demo/resources/assets/mascot.png`、`miyu-avatar.png`）是项目自己做的，和代码一样照 AGPL-3.0-or-later。

模型供应商的名称和图标是各自所有者的商标。网页里显示的供应商图标不随网页包发，由核心在运行时从 models.dev、lobe-icons 拉来缓存（核心 `licenses.md`）。

拷来的库怎么用见 `web-demo/README.md`「拷进来的库」。
