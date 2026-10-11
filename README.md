## Miyu 网页

在浏览器里用 Miyu：网页软件 `miyu-web` 只听本机的端口，给页面文件，把浏览器的 WebSocket 转成核心协议。核心在 [miyu-agent/miyu](https://github.com/miyu-agent/miyu)，这里照 `Cargo.toml` 的 git 依赖钉住核心的一个提交，只经门面 `miyu-client` 用核心的东西（核心仓库的设计 `32-仓库拆分.md`）。

- `crates/miyu-web`：网页软件（`miyu-web serve`、`miyu-web open`），图纸 `docs/blueprint/web-module.md`。
- `crates/miyu-webserve`：只听本机的网页端口的底子：给页面文件、核对 Host 和 Origin、`/ws` 原样转给核心，图纸 `docs/blueprint/webserve.md`。
- `web-demo/`：页面（原生 JavaScript，按 ES 模块组织，不用框架、不用构建），图纸 `docs/blueprint/web.md`、`web-ui.md`；怎么跑见 `web-demo/README.md`。
- `package/`：网页的软件包清单，发版时随核心一起装进资源目录的 `packages/web/`。

### 测试

```sh
cargo test
MIYU_RESOURCES=<核心检出>/resources node --test 'web-demo/tests/**/*.test.js'
cargo test --manifest-path web-demo/bridge/Cargo.toml
```

网页的纯逻辑测试要核心的出厂资源（给人看的字）：`<核心检出>` 是核心仓库的检出，提交和 `Cargo.toml` 里钉的一样。
