## Miyu 网页

Miyu 的网页（头）：网页软件 `miyu-web`（`crates/miyu-web`，只听本机的端口给页面、把浏览器的 WebSocket 转成核心协议）、它用的底子 `miyu-webserve`，和页面本身（`web-demo/`，原生 JavaScript、ES 模块，不用框架、不用构建）。核心在 `miyu-agent/miyu`，这里照 `Cargo.toml` 里的 git 依赖钉住核心的一个提交（设计 `docs/designs/32-仓库拆分.md`，在核心仓库）。

### 规矩

- 只经 `miyu-client` 用核心的代码（设计 32 第二节）；缺的告诉核心的主会话加进门面，不直接依赖核心里别的 crate。测试里假扮核心的那几样（`miyu-ipc`、`miyu-store`）只放在开发依赖里，和门面钉同一个提交。
- 协议、事件的形状以核心仓库的 `docs/blueprint/protocol.md`、`docs/designs/samples/` 为准；改到协议的事先找核心。
- 升级核心：改仓库根 `Cargo.toml` 里钉住的提交（三行一起改）和 `web-demo/bridge/Cargo.toml` 里那一行，过三台 CI。
- 提交信息（2026-10-22 项目主人定：所有仓库一致，同核心 `AGENTS.md` 第 2 条）：标题写 `<类型>(<范围>): <这次改动的效果，说人话> (<编号>)`，类型是 `feat`、`fix`、`perf`、`refactor`、`docs`、`test`、`chore` 之一，例如 `fix(登录): 停用的账号登录时说「已停用」 (W-335)`；编号是验收单（`W-xxx`）或核心的施工编号，没有的不写括号；标题里不写只有看过施工单才懂的说法，也不写实现细节；正文三段：为什么、改了什么、怎么验；一件事一个提交；进度、给人看的字里写编号不写 sha（钉核心版本的那一处照旧写）；已经推了的不改。
- 每个 `.rs` 文件不超过 500 行，测试也算；clippy `-D warnings`；不吞错误（不写 `let _ =`、`.ok()` 扔错误）。
- 网页的纯逻辑测试读核心的出厂资源：本机跑设 `MIYU_RESOURCES` 指到核心检出里的 `resources/`（`node --test 'web-demo/tests/**/*.test.js'`）。
- 给人看的字照三种语言；界面上只放人要的，说法照通用软件的短句；控件不画描边。
- 图纸在 `docs/blueprint/`（`web.md`、`web-ui.md`、`web-module.md`、`webserve.md`、`web/`）；改了界面先改图纸。
- 本机测：沙箱数据根（`MIYU_HOME` 指到单独的目录），不碰 `~/.miyu`，不重启别人在用的核心；key 和地址只放在命令里。
- 平台：Linux、macOS（M 系列）、Windows 都要编得过、测试过；网页的纯逻辑测试和演示的桥只在 Linux 上跑。
