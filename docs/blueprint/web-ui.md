## 网页软件 `miyu-web`

### 是什么

网页界面是一个单独的程序 `miyu-web` 加一套页面文件，装了才有。它是核心的一个头：自己开一个只听本机的 HTTP 端口，给页面，把浏览器的 WebSocket 一帧一条转成核心协议的一行一条，经本机套接字（Windows 上是命名管道）连核心，不读本机令牌。主程序的 `miyu web` 找到它、把参数交给它。

状态：施工 W-9 做好了起停、页面、WebSocket 照转和 `miyu web`；施工 W-10 做好了媒体地址 `/media`；打包随 W-11。这一页从 `web-module.md` 搬出来（第九条、第十一条，W-10 又搬了第十条；「要跟着改的别的页」里定的「网页软件一页」）；核心给网页的通用方法、身份还在那一页。

### 在哪

| 文件 | 管什么 |
|---|---|
| `crates/miyu-web/`（第 5 层，头） | 程序 `miyu-web`：只依赖 `miyu-ipc`、`miyu-store`、`miyu-log`、`miyu-webserve`，不依赖核心 |
| `crates/miyu-web/src/main.rs` | 子命令 `open`、`serve`；找自己旁边的主程序拉起核心 |
| `crates/miyu-web/src/serve.rs` | 单实例、听端口、写 `run/miyu-webui/address` 和那一行、空闲退出（听局域网时不退）；每个请求分给谁：Host 不对的记一行、回 403，`/ws`、`/ticket`、`/media`、`/listen`、`/export`、页面文件。锁、`run/miyu-webui/address` 的读写在 `serve/files.rs`（W-1098 挪出来）。网页软件的 `Site` 实现 `miyu_webserve::Site`（数忙照空闲退出；在听的地址、端口换了照新的核对 Host） |
| `crates/miyu-web/src/desk.rs`、`desk/wallpaper.rs`，`crates/miyu-desk/` | 这台电脑上的几样（「怎么走」第五条）：`/reveal`、`/pick-dir`、`/wallpaper` 要设备令牌、只给本机来的；开目录、选目录在 `miyu-desk`（桥也用它）；壁纸照桥的做法用 `miyu-wallpaper`、`miyu_client::seeds` |
| `crates/miyu-web/src/shutdown.rs` | `miyu web --stop` 和 `/stop`（「怎么走」第二条第 10 款，W-1091）：起来时写停止钥匙、退出时删；`--stop` 不连核心，带钥匙照回环叫停，等锁放掉 |
| `crates/miyu-web/src/export.rs`、`export/clean.rs` | `/export`（「怎么走」第七条，核心 SE-1 中（f8f8a9bae），设计 58，W-1098）：带登录令牌换一张一次性的下载票据，网页软件照本机令牌叫核心把原始包写到自己的临时子目录，`/export/<票据>` 交给浏览器、给完删；`clean.rs` 起来时清上回剩下的、建自己的子目录 |
| `crates/miyu-web/src/ticket.rs` | `/ticket`（「怎么走」第一条第 12 款，W-1089）：本机的页面没凭据时照本机令牌问核心要一张交接票；只认本机的页面自己发的（`local`） |
| `crates/miyu-web/src/listen.rs`、`follow.rs` | `/listen`（「怎么走」第一条第 11 款）：回在听的地址、端口、别的设备打开用的网址；`POST` 照核心的配置换地址、端口，接连接的那一圈照它换监听。`follow`：订核心的配置推送，那两项变了自己换 |
| `crates/miyu-webserve/src/lib.rs`（施工 O-16 搬过去，`webserve.md`「搬家表」） | 核对 Host、Origin 的三种写法和听局域网时的 IP 写法（`Site::hosts`、`listen`、`host_allowed`、`origin_allowed`）；连接是不是远程的（`remote`） |
| `crates/miyu-webserve/src/pages.rs`（同上，原来是 `crates/miyu-web/src/pages.rs` 和 `serve.rs` 的一段） | 页面文件：`/` 是 `index.html`，不出页面目录；类型照 `web.json` 的表、四个响应头 |
| `crates/miyu-webserve/src/ws.rs`（同上，原来是 `crates/miyu-web/src/ws.rs`） | 核对 Origin；远程的先写 `connection.remote`；WebSocket 和核心连接两头照转 |
| `crates/miyu-webserve/src/respond.rs`（同上，原来在 `crates/miyu-web/src/serve.rs`） | 回应的正文、`nosniff`、`no-referrer` |
| `crates/miyu-web/src/media.rs` | `/media`：换票据、照票据一块块给、响应头（施工 W-10） |
| `crates/miyu-web/src/media/tickets.rs` | 票据：造、找、作废、过期、上限 |
| `crates/miyu-web/src/media/link.rs` | 照登录令牌连核心：一个令牌一条，同时问、照编号分回去，60 秒没人用就关 |
| `crates/miyu-web/src/media/range.rs` | `Range` 要哪一段；下载的名字照 RFC 5987 转义 |
| `crates/miyu-web/src/backstage.rs` | 软件后台页：`/page` 换票据、`/p/<票据>/<包>/<路径>` 照 `package.file` 一块块给、响应头（施工 F-6 下）；票据和连着的核心同 `/media` 那一套（`media/tickets.rs` 的 `Tickets` 两边各一份，`media/link.rs` 的 `Cores` 共用） |
| `crates/miyu-web/src/theme.rs` | 网页外观（核心 TH-1，2026-11-02）：`/theme` 换票据、`/t/<票据>/<包>/<路径>` 照 `package.file` 给外观包网页目录里的文件；一块块给、问核心、没问成写成状态码用 `backstage.rs` 的（`stream`、`ask`、`refused`），票据放在 `Backstage` 里另一份 |
| `crates/miyu-web/src/open.rs`、`texts.rs` | `open`：确保 `serve` 在跑；要交接票（`--reset` 要一次性码）；开浏览器；给人看的字。照终端的样子连核心一问一答（`open` 要一次性码、`serve` 起来时问配置）、开浏览器的那两样在 `crates/miyu-webserve/src/open.rs`（施工 9-1 下从 `open.rs` 挪进 `client.rs`，施工 O-16 搬过去） |
| `crates/miyu-web/src/settings.rs`、`miyu-webui/web.json`、`miyu-webui/package.toml`（装好在网页包的文件夹：资源目录的 `packages/miyu-webui/`，或者打成包文件装进数据根的 `packages/miyu-webui/`，找法见「怎么走」第一条第 6 款；`web.json` 2026-10-11 仓库拆开以后从核心的 `resources/web/` 挪进来） | 端口（出厂 8300）、听哪个地址、空闲多久、票据多久不用作废、最多几张是配置项（`web.port`、`web.listen`、`web.idle_seconds`、`web.ticket_idle_seconds`、`web.most_tickets`），声明在网页自己的清单里，默认值照清单读，起来时问核心拿最终值（施工 9-1 下）；内容安全策略（页面的、软件后台页的 `backstage_csp`）、页面的媒体类型是常量，在 `web.json` |
| 网页包文件夹的 `pages/` | 页面文件，和网页包放在一起（原来在 `resources/web/pages/`，2026-10-11 跟着挪）。发版时照网页的前端放进去；开发时设 `MIYU_WEB_PAGES` 指到 `web-demo/` |
| `miyu-webui/package.toml` 的 `[command]` | `miyu web` 这个命令：`name = "web"`、`program = "miyu-web"`、`args = ["open"]`（核心 CL-7 起不是主程序内置的，网页包装了才有，列在 `miyu -h` 的「软件包加的命令」里；原来是核心的 `crates/miyu-cli/src/web.rs`、`help/{zh,en}/web.txt`） |
| `crates/miyu-web/src/help.rs` | `miyu web -h` 的帮助页（中文、英文） |
| `crates/miyu-ipc/src/start.rs` 的 `spawn_detached` | 拉起、跟终端脱开、等那一行：核心和 `serve` 共用 |

### 对外的样子

见 `web-module.md`「网页软件对外的样子」：命令、HTTP、数据根里多的文件（`run/miyu-webui/lock`、`run/miyu-webui/address`）。运行日志 `state/logs/miyu-webui/web.log`（FH-3 起 `var/log/miyu-webui/web.log`），目标 `miyu::web`。

### 怎么走

**一、起停、端口、页面、WebSocket**（W-9，原来是 `web-module.md` 第九条）

1. 单实例：`miyu-web serve` 先拿 `run/miyu-webui/lock`，拿不到写 `running` 走。拿到了听端口，把地址写进 `run/miyu-webui/address`（先写临时文件再改名），往标准输出写一行 `ready`，和核心那一行同一个写法（`ipc.md`「那一行」，复用 `miyu-ipc` 的 `Ready`）。端口被占了写 `error port <端口> in use`（`open` 认这个写法，照人的语言说，「施工时定的」第 5 条），别的起不来写 `error <原因>`。「被占」不只照绑不绑得上：绑之前先连一下 `127.0.0.1:<端口>`（最多等 0.3 秒），有人接就算被占（2026-10-31 桌面端在 macOS 上撞见：主人自己的守护进程听着 `*:8300`，macOS 让更具体的 `127.0.0.1:8300` 也绑得上，新起的网页软件把本机的连接接走、悄悄盖住原来那个，不报被占；Linux 上这样绑不上，所以没早发现）；端口回退照样往后找。
   - 端口回退（2026-10-30，桌面端 DT-3 在一台 8300 被别的程序占着的机器上撞见：桌面窗口的人敲不了 `--port`；项目主人定「固定端口配端口回退」）：端口是出厂的（命令行没写 `--port`、配置里的 `web.port` 出处是 `default`）而且被占了的，照先后试后面九个（8301 到 8309），用头一个空的，`run/miyu-webui/address` 照实写；九个都被占的照旧报那一个出厂端口被占。回退是固定的一串，不随便挑：浏览器里存的登录、设置按地址加端口分开，同一台机器上每次落到同一个端口才不丢。人自己定的端口（`--port`、配置里写了的 `web.port`）被占照旧报错，不替人换。
   - 打开文件数（施工 YC-11，2026-11-10 压测报告 F1：系统给的软上限常是 1024，网页软件、核心几百条连接、几百个会话就用光）：`serve` 起来、起运行时的线程之前调一次核心 YC-1 的 `miyu_ipc::open_files::raise()`，软上限调到硬上限、最多 65536；调了的装好运行日志后记一行 `INFO open files raised from=… to=…`，调不上去的记 `WARN open files not raised`、照旧跑。`open`、`forget` 这种一下就退的不调。
2. 端口：照 `--port`，没写照配置 `web.port`（施工 9-1 下：只能写在系统配置，设置页「通用」的「访问」一组、「软件包」那一页露；改了当场换，第 11 款）。`serve` 起来先问核心 `config.get` 拿 `web.*` 五项的最终值，再听端口、写地址：核心没在跑的照拉起核心的办法拉起来再问（W-1099，2026-11-04：原来不拉、照清单的默认值先起，出厂端口 8300 先听上、拿到配置才换过去，这中间 `miyu web --print` 印过 8300 的地址；主人机器上 8300 是旧版 Miyu，点进去进错地方）；连不上、拉不起来的照起不来说（那一行 `error core unreachable: <原因>`，`miyu web` 照「无法启动网页界面」说），不写地址、不照默认端口听；连上了却被拒的照默认，记 `WARN web config not read`（固定端口，第 2 题）；`0` 是系统挑一个空的。听哪个地址照配置 `web.listen`（SU-1，2026-10-28 项目主人定「局域网能用」）：出厂 `127.0.0.1` 只有这台电脑能开；`0.0.0.0` 局域网里别的设备也能开（凭访问密码登录；网页设置页「通用」的「访问」一组的「允许局域网访问」照它，打开时没设密码的先设）；也能写这台电脑的某一个地址；不是地址的照默认。改了当场换（第 11 款）。`run/miyu-webui/address` 里、交给浏览器的网址照旧写 `http://127.0.0.1:<端口>`：本机开浏览器走回环。端口被占了：`miyu web` 照人的语言说哪个端口被占了、怎么换。出厂端口 8300（「施工时定的」第 1 条）。
3. 空闲退出：没有 WebSocket 连着、没有 `/media`、软件后台页在给，连续 10 分钟就退出（配置 `web.idle_seconds`，出厂 600，设置页不露；`0` 是不退：服务器上由服务管理器起的那一份写 0，空闲退出码是 0、`Restart=on-failure` 不会再起它，2026-10-23 Z-1 查出；`miyu web` 拉起的照旧 600，用的时候才起），先删 `run/miyu-webui/address`（和停止钥匙，第二条第 10 款）、再放锁。听局域网的（在听的地址不是回环）不空闲退出（2026-10-30 项目主人定局域网访问是一个开关：开着就得一直能从别的设备打开，没人连着就退了，别的设备打不开、也起不了它），换回回环的照旧算空闲。收到停的信号、`miyu web --stop` 叫停的照样先删再放。
   - 不定时醒（2026-10-15 设计 00「避免轮询」）：睡到下一件到点的事（空闲到点、核心连接 60 秒到点该关），没有到点的事就只等连接来、连着的走；过期的票据在换、找、有连接走时丢。
4. 每个请求先核对 Host：认 `127.0.0.1:<端口>`、`localhost:<端口>`、`[::1]:<端口>`；听局域网的（`web.listen` 不是回环）另认「IP 字面量:<端口>」——听的是某一个地址的只认它，`0.0.0.0` 的认这台电脑的哪个地址都行（连得进来就是这台电脑的）。不认名字，别的回 403：别的网站把自己的域名解析到这台电脑也进不来（DNS rebinding）。
5. 页面文件：`GET /` 给 `index.html`，别的照路径在页面目录里找。带 `..` 的、换成真实位置以后跑到页面目录外的、不是普通文件的，404。类型照扩展名（`web.json` 的表）。响应头一律带：`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Cache-Control: no-cache`、`Content-Security-Policy`（照 `web.json`，至少有 `connect-src 'self'`、`frame-ancestors 'none'`）。从来不设 cookie（「起草时定的」第 13 条）。
   - 版本标记（2026-10-30，桌面端在 Windows 虚拟机上量到：每次开窗口都把约 390 个文件、5 MB 整套重新下一遍，WebView2 每次重新解析）：带 `ETag`，照文件大小和修改时间写（`"<大小>-<修改时间纳秒>"`，都是十六进制）；请求的 `If-None-Match` 里有它（或者是 `*`）的回 304，只带 `ETag`、`Cache-Control` 和一律带的头，不读文件。`no-cache` 照留：浏览器每次都问一声，没变就用手里的。读不到修改时间的（有的文件系统）不带 `ETag`。
6. 网页包的文件夹（清单 `package.toml`、常量 `web.json`、页面 `pages/` 都在里面；2026-10-29 网页打成包文件、装进数据根的包文件夹以后补）。包编号 `miyu-webui`（2026-10-30 核心设计 48 改名，原来叫 `web`；不叫 `miyu-web`，那是程序名和仓库名），包文件夹跟着叫 `miyu-webui/`：这个仓库里的、资源目录下的、数据根里的都是；清单 `[package]` 写 `prefix = "web"`，配置键照旧 `web.*`，`[command] name` 照旧 `web`，人照旧敲 `miyu web`；旧编号不做兼容。照这个先后找，头一个里面有 `web.json` 的就是：核心转交时设的 `MIYU_PACKAGE_DIR`（核心 S-6 上：包文件夹由核心挑是哪一层）；程序在某个文件夹的 `bin/` 里的，那个文件夹（包带着程序装的样子）；资源目录下的 `packages/miyu-webui/`（随 Miyu 一起装、开发时；资源目录照 `store/resources.md` 第 1 条找，和核心同一个办法）。页面目录：`MIYU_WEB_PAGES` 设了照它，不然是网页包文件夹里的 `pages/`。
7. `GET /ws`：Origin 要是 `http://` 加上第 4 款本机的三种之一（带端口），或者第 4 款认的 IP 写法、而且和这个请求的 Host 一样，不然 403。对端（TCP 连进来的地址，不看 `X-Forwarded-For` 这类头）不是回环地址的，接上核心以后、转浏览器的第一行以前，先写一行通知 `{"jsonrpc":"2.0","method":"connection.remote","params":{"from":<对端 IP>}}`（核心 `connection.md`「网页」：这条连接就是远程的，限流照 `from` 分，没设访问密码的远程登录回 `password_not_set`）；IPv4 映射进 IPv6 的照 IPv4 算；本机来的不写。接了以后连核心：`connect_or_start_bare`，核心没在跑就拉起来（命令是主程序 `miyu` 加 `core`；主程序照核心转交、拉起时设的 `MIYU_PROGRAM`（主程序的真实位置，核心 G-15），没设、不是绝对路径、那里没有文件的照 `miyu-web` 真实位置旁边的：随 Miyu 一起装的在旁边，打成包文件装进数据根的旁边没有，靠核心给）。连不上：往 WebSocket 发一条通知 `{"jsonrpc":"2.0","method":"web.error","params":{"message":<原因>}}`，再关。
   - 时限、上限（2026-10-30 第二轮审查 W2-2，数项目主人定）：HTTP 装计时器，请求头 30 秒读不完的断开（hyper 的 `header_read_timeout`，原来没装计时器、不生效，发半截请求头的连接一直挂着）；`accept` 出错（文件描述符用完这类）歇 1 秒再接，不空转；同时连着的 `/ws` 一共最多 256 条、别的机器来的最多 32 条，满了回 503；升级以后先等浏览器第一帧（握手）10 秒，等到了才连核心，开着不说话的空连接不占核心的连接，等不到的关 1008。
8. 一个标签页一条核心连接，不合并（proto/web-demo 分支 `docs/blueprint/web/architecture.md`「多用户、多终端」第 7 条）。两头照转：文字帧加一个 `\n` 是一行，一行去掉 `\n` 是一个文字帧。不读、不改、不加：握手的凭据、命令、推送原样过去。二进制帧：关，1003。一帧超过 1 MiB：关，1009（核心那头一行也就这么长）。
9. 一头断了另一头跟着关。核心那头断了（重启、退出）：WebSocket 关，1012，页面照自己的规矩重连（proto/web-demo 分支 `docs/blueprint/web.md`「连核心」第 1 条）。网页软件这头关的（1003、1009、1012、连不上核心）：发完关闭帧先关写的一半，把浏览器还在发的读掉、扔掉，读到头或者满 2 秒再放套接字（「施工时定的」第 10 条）。
10. 运行日志写在网页包自己的日志目录（核心 `DataRoot::package_logs("miyu-webui")`，设计 55 的 `MIYU_LOG_DIR`；施工 FH-5上，2026-11-03 起，原来是 `state/logs/web.log`）：`state/logs/miyu-webui/web.log`，FH-3 起 `var/log/miyu-webui/web.log`；目录不在就建，不用 `stderr`、`stderr.old` 两个名字（核心记扩展的标准错误用）。满了照核心的换法（`log.md`）。只记连上、断开、出错，不记一行的内容、一次性码、密码、登录令牌、票据。
11. 换地址、端口（2026-10-30 项目主人：网页默认只给本机，设置页「通用」的「访问」一组一个开关放开到局域网，能填监听地址、端口；开着就不空闲退出，等它重启才生效等于不生效）：
   - `GET /listen` 回 `{"listen": <在听的地址>, "port": <在听的端口>, "lan": <别的设备打开用的网址或 null>, "lans": [{"url": <网址>, "card": <网卡名或 null>}…]}`。`lans` 是别的设备可能打得开的全部地址，`lan` 是第一个的网址：听某一个地址的就是它（`card` 空），回环的空；听 `0.0.0.0`、`::` 的照这台电脑的网卡全列同一族的地址，照网卡的先后、带网卡名（crate `if-addrs`，W-1135；2026-11-10 项目主人在提问里选「全部列出、不分先后」：Tailscale、EasyTier 这类组网的地址在同一个虚拟网里打得开，跳过就把能用的藏起来了，代理 TUN 的 198.18 假地址也照列，人看网卡名自己挑；原来只写这台电脑往外的那个地址，开着 TUN 时只给了一个虚拟地址）——回环、链路本地（`169.254.0.0/16`、`fe80::/10`）不列，同一个地址只列一次；读不到网卡的照往外的那个地址（UDP 套接字 `connect` 文档地址 `192.0.2.1`，不发包，读本地地址；`card` 空）。写成 `http://<地址>:<端口>`（IPv6 加方括号）。设置页的卡照 `lan` 画、网址后面暗字写网卡名，别的写在卡下面「其他网卡：网址（网卡名）、…」；核心在 macOS 上的、开着局域网的卡下面多一句「别的设备打不开的话，到「系统设置 → 网络 → 防火墙 → 选项」里允许 miyu-web 的传入连接」（同一天：Mac 上换了真实地址也打不开）。
   - `POST /listen`（带设备令牌 `Authorization: Bearer <令牌>`，同 `/media`；没带的 401）：拿这个令牌连核心（`connect_login`，不拉起核心；不替请求出示本机令牌，局域网来的请求也只能用自己的登录读配置；核心不认的 401），`config.get` 重读 `web.listen`、`web.port`，和在听的不一样就换：端口没变、只换地址的先放掉旧的再听新的（同一个端口两个地址会冲突），新的听不上再听回旧的；端口变了的先听新的、听上了再放掉旧的，`run/miyu-webui/address` 照新端口写。`web.port` 和起来时读到的一样的不动端口（回退过的留着现在这个）；`--port` 起的端口不随配置换。已经连着的（WebSocket、`/media`、后台页）不断；别的机器来的、新地址不再包含它连进来的那个地址的除外（2026-11-02 第四轮审查 W4-2，项目主人定：关了局域网，别的设备已经连着的也该断，不然局域网关了别的设备照样能用）：连着的 WebSocket 关 1008，同一条 keep-alive 连接上再来的请求一律 403（Host 能写回环的写法，挡不住它们）。「包含」照听的地址算：`0.0.0.0` 包含这台电脑的 IPv4 地址，`::` 都包含，别的只包含它自己；同机的反向代理转进来的（算远程，第 7 款）连的是回环，换回回环照样接得到，不断（新连接照样进得来，断了也白断）。回应同 `GET`；换不了的（听不上、端口被占、核心连不上）多一个 `"error": <原因>`（核心的原话），状态码照旧 200，接着听原来的。它只照核心里已经存着的配置换，换不出配置以外的样子。
   - 跟着核心的配置（2026-10-30 验收时撞见：端口换走以后，开在旧端口上的页面请不到 `/listen`，再关局域网，网页软件却还听着局域网）：`serve` 起来以后自己照终端的样子连核心（出示本机令牌，同第 2 款读配置；不拉起核心），`subscribe {stream: "config"}`，先 `config.get` 读一遍换一遍，以后推来的 `config.changed` 的 `keys` 里有 `web.listen`、`web.port` 的、掉了队（`resync`）的再读再换；没有这一项的（网页包没装、旧核心）不动那一样。核心不在、断了，10 秒后再连（核心重启以后接着跟）。设置页、`miyu config set`、手改配置文件都当场生效；设置页存完再 `POST /listen` 只为拿换完的样子（换不了的原因、新的网址）。

12. 本机免密（2026-11-03 项目主人：本机就不要凭证了，W-1089；同一天 core1 提的几道防护项目主人同意）：从没登录过的浏览器直接打开 `http://127.0.0.1:<端口>/`，原来出「登录 Miyu」要访问密码，刚装好、没设过密码的人走不下去。项目主人要的样子：本机打开 `localhost:<端口>` 直接进到会话页，一个提示框都不弹，眼睛看不到任何票、令牌、密码；局域网来的要访问密码。
   - `POST /ticket`：页面手里没凭据时问网页软件要一张交接票（`web.md`「连核心」第 1 条）。只认这台电脑上的页面自己发的，下面几样都对上才给，有一样不对就 403、没有正文、不说为什么（运行日志记一行 `ticket refused`）：
     1. 对端是回环、不带反向代理加的头（第 7 款的 `remote` 是空的；同机的 nginx、cloudflared、`tailscale serve` 转进来的算远程，R3S-2）。
     2. Host 只认 `127.0.0.1:<端口>`、`localhost:<端口>`、`[::1]:<端口>`，端口是这一刻在听的那个；听局域网时第 4 款多认的「IP 字面量:端口」这里不认。挡 DNS 重绑定：别的网站把自己的域名解析到 `127.0.0.1`，只看对端是回环挡不住。
     3. Origin 要有，和 `http://` 加这个 Host 逐字一样（页面自己的来源）；没有 Origin 的不给。
     4. 带自定义头 `X-Miyu-Local: 1`：别的网站的页面要带它，浏览器先发预检，网页软件不答，就发不出来。`Content-Type` 是表单的三种（`application/x-www-form-urlencoded`、`multipart/form-data`、`text/plain`，跨站表单不用预检就能发的）一律不认；页面发的不带正文（或者带 JSON）。
     5. 方法只认 `POST`，别的 405。
   - 认了的照 `miyu web` 那样（第二条第 3 款）出示本机令牌连核心（`connect_or_start`，没在跑就拉起来：页面这时还没开 `/ws`，`/ws` 那头也会拉起），问 `login.ticket {via: "page"}`（核心 LT-1：60 秒、一次性；`via` 是核心 LT-2：照它在运行日志里记一行是谁要的，不记票，2026-11-03 W-1090），回 `200 {"ticket": "<票>"}`。连不上核心、拉不起来、要不到的（旧核心没有 `login.ticket`，同 `miyu web` 当要不到）回 `503 {"error": <原因>}`（记一行 `ticket unavailable`）。回应带 `Content-Type: application/json`、`Cache-Control: no-store` 和第 5 款一律带的两个头。票不进日志，网页软件不记它、不缓存；页面拿到就握手用掉，不存、不放进地址。
   - 取舍（项目主人知道、接受）：同一台电脑上别的系统用户开浏览器也能进（原来要访问密码挡着；本机令牌只给本人读，这里不看是谁）；别的网站的页面被 Host、Origin、自定义头挡住；局域网里别的设备、同机反向代理转进来的照旧要访问密码。

**二、`miyu web`**（W-9，原来是 `web-module.md` 第十一条，2026-10-04 随 W-8 改过）

1. `miyu web` 是网页包自己带的命令（2026-10-30 项目主人定，核心 CL-7；原来是主程序内置的，照清单找网页软件再交给它）：清单 `[command]` 写 `name = "web"`、`program = "miyu-web"`、`args = ["open"]`，核心照「转交」（核心 `packages.md` 第 5 条）找程序（包文件夹的 `bin/` 先，再 `miyu` 旁边），把 `args` 放在人敲的参数前面：`miyu web --print` 就是 `miyu-web open --print`；环境里带 `MIYU_PROGRAM`（主程序的真实位置，核心 G-15）、`MIYU_PACKAGE_DIR`，退出码照它的。网页包没装就没有这个命令（`miyu web` 照核心说不认识的命令），`miyu -h` 把它列在「软件包加的命令」里，说明照清单的 `about`。
   - `miyu web -h`、`--help`（核心不再有这一页，转交过来是 `miyu-web open --help`）：`open` 后面有 `-h`、`--help` 的不管别的参数，印帮助页、退出码 0，照核心设计 47「命令行文案」写：用法、一句说明、选项（`--port`、`--print`、`--format <text|json>`、`--reset`、`--logout`、`--package <编号>`、`--session <编号>`、`--settings [<分页>]`、`--stop`、`-h`），`--ticket` 不写（桌面端的外壳用的）。语言照这台机器的（`LC_ALL`、`LC_MESSAGES`、`LANG`，同核心的帮助页：印帮助不连核心），`zh` 打头的中文，别的英文。
2. `miyu-web open`：`run/miyu-webui/address` 在、锁有人拿着，网页软件就在跑，照 `run/miyu-webui/address` 的地址。不然拉起 `miyu-web serve`：和头拉起核心一样（`ipc.md`「连不上就拉起」第 4、5 条），跟终端脱开，工作目录是数据根，等那一行最多 10 秒。
3. 照终端的样子连核心（`connect_or_start`，出示本机令牌）。要交接票时问 `login.ticket {via: "open"}`（核心 LT-2，W-1090）。写了 `--reset` 的（问一次 `account.setup_code`）：网址是 `<地址>/#setup=<一次性码>`，码在 `#` 后面，不发给服务器、不进 Referer，页面拿到以后从地址栏抹掉（设计 21 X6）。交给浏览器的不带票（2026-11-03 项目主人，W-1089：地址栏、跳转后的网址、浏览器历史里都不能出现票或令牌）：网址就是 `<地址>/`（`package=`、`session=`、`settings=` 照带，那些不是凭据），页面开在本机地址上，存着设备令牌的照它进，没有的自己 `POST /ticket`（第一条第 12 款）要一张票进来，也就不写跳转页。印出来的（`--print`、`--format json`、交不给浏览器的：桌面端、托盘、终端用，可能交给别的程序、别的浏览器配置）照旧（2026-10-30 项目主人：访问密码只给局域网用，本机打开不逼着设；原来还没设过密码的也带一次性码、先出「设置访问密码」一屏）：要一张交接票（`login.ticket`，核心 LT-1：60 秒、一次性；核心只看是不是本机令牌连上的，没设过密码也给），网址是 `<地址>/#ticket=<票>`（im 设计 07 第 3.6 节、网页-乙；SU-1 起不带账号，旧核心回应里带了也不用）：浏览器里存着设备令牌的照它进，没有、作废了的拿票一步连上，不用再输密码；页面在本机地址（回环）上拿票换到的设备令牌存进这台浏览器（`web.md`「连核心」：同勾了「自动登录」，本机终端开的是主人自己），收藏的地址下回直接进。`first` 照旧问 `account.setup_code` 拿（`--format json` 照实给），要了的码不用（5 分钟后自己作废）。旧核心要不到票的（没有 `login.ticket`）网址就是 `<地址>/`，页面照存着的登录令牌，没有的问用户名和密码。
4. 用系统的办法打开（Linux 是 `xdg-open`，macOS 是 `open`，Windows 是 `cmd /C start "" "<网址>"`）。网址带着一次性码的不直接交（W-1089 起交给浏览器的只有 `--reset` 带凭据；交出去的参数进进程列表，同一台机器上的别人看得到；im 设计 07 第 3.6 节）：写一个跳转页 `run/miyu-webui/open/<16 个随机字节的十六进制>.html`（目录只给本人：Unix 上目录 0700、文件 0600；Windows 上在本人用户目录下的数据根里，同本机令牌 `run/token` 的办法），里面一行 `location.replace("<网址>")`（不留历史）、`<meta name="referrer" content="no-referrer">`，交出去的是这个文件的 `file://` 地址（Windows 的长路径写法 `\\?\C:\…` 先去掉前缀，网络共享 `\\?\UNC\主机\共享\…`、`\\主机\共享\…` 写成 `file://主机/共享/…`：数据根可能是人自己用这种写法给的，2026-11-03 core1 提的，W-1080）；交了以后拉起自己 `miyu-web forget <跳转页>`（跟终端脱开、不等它），它 30 秒后删掉这一页；每次 `open` 先删掉 `run/miyu-webui/open/` 里放了 2 分钟以上的（`forget` 没跑完的兜底）。不带凭据的网址照旧直接交。
5. 交给了浏览器：标准输出印一行「已在浏览器中打开：<整个网址>」（带着码的连码：2026-10-29 项目主人在虚拟机里试新用户，嫌原来要再 `--print` 才看得到带码的链接；交给浏览器的照旧是跳转页），标准错误上照凭据接提示（第 6 款），退出码 0。浏览器开没开、设没设好，`miyu web` 看不到。交不出去（没有 `xdg-open`、没有图形界面）：标准输出印整个网址，标准错误上「miyu: 无法打开浏览器，请手动打开上面的地址」，再接提示。字照核心设计 47「命令行文案」：报错 `miyu: ` 打头、不带句号，建议另起一行「提示：」，结果行短、动词打头；单人以后不再说「用户名」。
6. `--print`：不开浏览器，标准输出只印整个网址（不写跳转页）。提示在标准错误上，一种凭据一行（2026-10-30 起没有「第一次的码」那一句）：`--reset` 的码「提示：打开后重设访问密码；链接 5 分钟内有效，只能用一次」，票「提示：链接 60 秒内有效，只能用一次」；什么都不带的不提示。
   - `--format json`（2026-10-29，桌面端的外壳要读，和 `miyu pkg pack --format json` 同一个写法；带了它就当 `--print`）：标准输出只印一行 `{"url": <整个网址>, "first": <还没设过访问密码>}`，提醒和别的人看的字都不印；出错照旧在标准错误上照语言说、退出码非 0。`--format text` 同不写。别的值、`--format` 后面没东西照用法不对。
   - `--ticket`（2026-10-29，桌面端免密：项目主人定访问密码只给局域网用，桌面窗口第一次打开不逼人设密码；2026-10-30 起不写也一样，留着给桌面端的外壳、不报错）：不管设没设过访问密码都要一张交接票（核心的 `login.ticket` 只看是不是本机令牌连上的），网址带 `#ticket=`（W-1089 起只有印出来的带：交给浏览器的写了也不带票，第 3 款）；`first` 照实给；核心不给票的什么凭据都不带。和 `--reset` 一起写是用法不对。用票进来的页面不出「设置访问密码」那一屏（那一屏只跟着一次性码出），第一次引导从下一屏起。桌面端的外壳经 `miyu web --print --format json --ticket` 调（核心 CL-5 照原样交过来）。
7. `--logout`：照终端的样子连核心，`account.logout`，`all: true`，印作废了几个。不碰网页软件，不改密码。
8. `--package <编号>`（施工 F-6 下，`package-pages.md`「终端」第 2 条）：网址 `#` 后面多一个 `package=<编号>`，和一次性码一起的写成 `#setup=<码>&package=<编号>`；页面起来就开着这个软件的独立整页（2026-10-15 项目主人定，网页的蓝图「软件的页面」：网页自己的路由，宿主读完一次性码只抹它，`package=` 留在地址栏里，能收藏）。编号只认字母、数字、`-`、`_`、`.`，1 到 64 个，别的照用法不对（退出码 2）。
9. `--session <编号>`、`--settings [<分页>]`（2026-11-03，W-1085：托盘程序 miyu-applet（2026-11-05 由 miyu-app 改名）要用——点通知回到那个会话，菜单「设置…」开设置，局域网开着时「在手机上打开…」开设置里「访问」那一组；核心把 `miyu web` 后面的参数原样转过来，core1 11-03 确认）：网址 `#` 后面多一个 `session=<编号>`、`settings=<分页>`，跟在一次性码、交接票、`package=` 后面（`#ticket=<票>&session=<编号>`）。
   - `--session`：会话编号照核心的写法（UUID：十六进制和 `-`，8-4-4-4-12），别的照用法不对（退出码 2）。页面起来切到这个会话；没有这个会话的照平常打开不存在的会话那样，在输入框上面说核心给的那一句。
   - `--settings`：后面的分页可以不写（下一个参数是 `-` 打头的、没有下一个的都算没写），网址写 `settings=`，开设置的首页（同点左栏的齿轮，到上次看的那一页、刷新过的是「通用」）；写了的是设置页左栏的分页编号（`general`、`models`、`packages`、`market` 这些，照设置包的 `order`；核心的页照 `config.schema` 的 `pages`），另认一个 `access`：开「通用」页、滚到「访问」那一组。分页照包编号的写法查（字母、数字、`-`、`_`、`.`，1 到 64 个），别的照用法不对；写法对、页面里没有这一页的照设置页的老规矩开「通用」。
   - 这两项是一次性的（点名「现在去哪」，不是能收藏的地址）：页面读完就从地址栏抹掉（经宿主的 `route`），刷新以后不再开；`package=` 照旧留着。
10. `--stop`（2026-11-03，W-1091：托盘 AP-2 在 Windows 虚拟机上测出来，托盘「停止」「退出 Miyu」照 `miyu core stop` 停了核心，开着的页面一重连，`/ws` 照 `connect_or_start` 又把核心拉了起来；托盘蓝图写的是「网页服务、im 这些跟着停」，托盘先 `miyu web --stop` 再停核心）：停掉这个数据根上在跑的网页软件，核心照常跑。只能单独写，和别的选项一起写的照用法不对（退出码 2）。
   - 不连核心（`open` 一上来就连，会把核心拉起来）。没在跑的（锁没人拿着）说「网页界面没有在运行」、退出码 0。
   - `serve` 起来时在运行时目录写一把钥匙 `run/miyu-webui/stop-key`（32 个随机字节、64 位十六进制，先写临时文件再改名，Unix 上 `0600`），退出时删。`--stop` 读地址和钥匙，照回环 `POST /stop`、头 `X-Miyu-Stop` 带钥匙；`serve` 回 204，接连接的那一圈照常收尾（删地址、删钥匙、放锁，运行日志 `stopped reason=stop`）。`--stop` 另起一个线程拿锁，拿得到就是停了，说「已停止网页界面」、退出码 0；10 秒还没停、没有地址、没有钥匙（旧版没写）、连不上、不认的说「无法停止网页界面：<原因>」、退出码 1。发出去以后连接断了的（收到就退，回应来不及发）照停了等锁。
   - `/stop` 只认：对端是回环、不带反向代理的头、不带 Origin（浏览器发 `POST` 都带，别的网站的页面、本机的页面都叫不停它）、钥匙逐字对上（比完每个字节）。不是的一律 403、没有正文、记一行 `stop refused`；不是 `POST` 的 405。读得到钥匙的是读得到这个数据根的人，本来也能结束这个进程。
   - 不发信号、不结束进程：仓库不许 `unsafe`，Windows 上也没有能让它照常收尾的信号。

**三、媒体地址**（W-10，原来是 `web-module.md` 第十条；2026-09-30 定的「小的经协议，大的由网页给带令牌的地址」，那时说的网页模块现在是网页软件）

0. 别的机器来的（第一条第 7 款的 `remote`；2026-10-30 第二轮审查 W2-1）：替它连核心的那条连接握手以前先写 `connection.remote`（同 `/ws`），核心照远程的规矩挡（`fs.read` 只给本机，局域网上的设备读不到装 Miyu 那台电脑的文件）。连着的核心连接照（登录令牌, 远程的对端地址）分开，同一个令牌本机来的、远程来的各一条，不共用。票据记着换它的时候是不是远程的：拿票读的这一次、换票的那一次有一个是远程的，照远程问。第四条的软件后台页（`/page`、`/p/`）一样。`/listen` 的 `POST` 替请求连核心用的是另一条连法，远程来的一律 403（局域网上的页面照样改配置，网页软件自己跟着配置换）。

1. `POST /media`：`Authorization: Bearer <登录令牌>`；正文是 JSON：`blob`（内容哈希）或者 `path`（绝对路径），正好一个；可以带 `type`（媒体类型）、`name`（存下来叫什么）、`download`（布尔，叫浏览器存下来）。
2. 网页软件照这个登录令牌连核心：同一个令牌的连接留着复用，60 秒不用就关。握手被拒（`bad_login`）回 401。
3. 先问核心有没有、能不能读：`blob.get` 或者 `fs.read`，`length` 写 0。`unknown_blob`、`path_unreadable` 回 404，`path_forbidden` 回 403。
4. 造一张票据：32 个随机字节，64 位小写十六进制。记在内存里：哪个登录令牌、哪个资源、多大、`type`、`name`、`download`。同一个令牌、同一个资源、同样三格的，交回原来那一张。12 小时没用过的作废；最多 4096 张，多了丢最久没用的。网页软件重启，票据全作废，页面照 404 重新换。
5. 回应 `{"url":"/media/<票据>"}`。
6. `GET /media/<票据>`：不认识的 404。带 `Range: bytes=…` 的只认一段，回 206；超出的回 416；不带的回全部。照 `blob.get`、`fs.read` 一块 512 KiB 地读，读一块写一块，不整个读进内存。
7. 类型：`type` 在 `web.json` 的 blob 类型表里的照它；`path` 的照扩展名查表；都没有的 `application/octet-stream`。响应头带 `nosniff`、`Cache-Control: private, no-cache`、`Content-Security-Policy: sandbox; default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'`：有人直接打开这个地址（一个 SVG、一个 HTML），它在一个空的来源里跑，碰不到页面。`application/pdf` 不放进 `sandbox`（浏览器自己的 PDF 阅读器在沙盒的来源里不肯开，她 `show` 的 PDF 要在右栏看，核心 D-5），只带 `default-src 'none'; img-src data:; style-src 'unsafe-inline'`。`download` 的加 `Content-Disposition: attachment`，名字照 `name`（只留最后一段），UTF-8 照 RFC 5987 转义。
8. 链接卡片的图、附件、她写到的本机图片和音视频，都走这一条。网页软件不另开图片代理：抓网上东西的只有核心的 `net` 包，地址闸只有一处。
9. 有 `/media` 在给，网页软件不算空闲。
10. 施工 W-10 定的细处见「施工时定的」第 11 到 16 条：「blob 类型表」就是 `types` 那张表的值；一个令牌一条核心连接、同时问；`Range` 只认一段，好几段、写法不对的照没写；`GET` 时照这时的大小算；令牌作废了票据一起作废；方法只认 `POST`、`GET`。没写名字的下载，本机文件照文件名，blob 只写 `attachment`。

**四、软件后台页**（施工 F-6 下；`package-pages.md`「网页软件怎么给后台页」，设计 30 第十三节）

1. `POST /page`：`Authorization: Bearer <登录令牌>`；正文是 JSON `{"package"}`，包的编号的写法同第二条第 8 款，不对的 400。
2. 照这个登录令牌连核心（和 `/media` 共用连着的那一条），问 `package.list`：这个包那一项 `page` 是真的才给，不然 404。握手被拒 401。
3. 造一张票据，写法、多久作废、最多几张同第三条第 4 款（配置 `web.ticket_idle_seconds`、`web.most_tickets`），和 `/media` 的各是各的一份：同一个令牌、同一个包的交回原来那一张。回应 `{"url":"/p/<票据>/<包的编号>/"}`。框的地址里只有票据、不带登录令牌：框里的页面读得到自己的地址。
4. `GET /p/<票据>/<包>/<路径>`：票据不认识、包和票据对不上的 404。路径解开 `%xx`（解出来不是 UTF-8、有 NUL 的 404），以 `/` 结尾的补上 `index.html`，空的照核心认成 `index.html`；带 `..`、绝对路径的照原样交给核心，核心拒 `bad_params`（400）。
5. 照 `package.file` 一块 512 KiB 地读：先读第一块拿到整份多大、写响应头，再一块块读、一块块写。核心拒的：`not_found`、`no_page`、`unknown_package` 404，`bad_params` 400，别的 502；握手被拒 401，这个令牌的后台页票据一起作废。给到一半核心那头断了、给得比说的少：连接照 HTTP 的规矩断掉。不认 `Range`：页面文件都小，一次给完。
6. 类型照扩展名查 `web.json` 的 `types`（空路径照 `index.html`），没有的 `application/octet-stream`。响应头：`Content-Security-Policy` 照 `web.json` 的 `backstage_csp`（`sandbox allow-scripts allow-forms; default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-ancestors 'self'`：沙箱、只取它自己的文件、不许联网、只许嵌在网页里），`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Cache-Control: no-cache`，`Access-Control-Allow-Origin: *`。
7. 页面把它放在 `<iframe sandbox="allow-scripts allow-forms">` 里，不给 `allow-same-origin`：页面在一个空的来源里跑，读不到网页的存储、登录令牌。空来源的框取 ES 模块脚本、字体是按跨源取的，所以要第 6 款的 `Access-Control-Allow-Origin`；票据就是凭据，不多开口子。`'self'` 在空来源的框里照文件的地址算，对得上网页软件自己（网页演示的桥 2026-10-10 在 Chromium 里实测）。框和网页之间的通道由页面做（网页的蓝图「软件后台」）。
8. 有后台页在给，网页软件不算空闲。方法只认 `POST /page`、`GET /p/…`，别的 405。

**六、网页外观**（2026-11-02；核心 TH-1，核心蓝图 `packages.md`「外观包」：外观包的 `[theme.web] dir` 是包里的一个目录，本身是一个普通的网页包，可以带脚本、不设限，项目主人定）

1. `POST /theme`：`Authorization: Bearer <登录令牌>`；正文是 JSON `{"package"}`，写法同第四条第 1 款，不对的 400。
2. 照这个登录令牌连核心，问 `package.list`：这个包那一项带 `theme.web.dir` 的才给（记下这个目录，去掉结尾的 `/`），不然 404。握手被拒 401。
3. 造一张票据，写法、多久作废、最多几张同第四条第 3 款，和后台页的各是各的一份（两份都放在 `Backstage` 里）：同一个令牌、同一个包、同一个目录交回原来那一张。回应 `{"url":"/t/<票据>/<包的编号>/"}`：页面照它当这个包的根，同内置的包的 `packages/<编号>/`。
4. `GET /t/<票据>/<包>/<路径>`：票据不认识、包和票据对不上的 404。路径解开 `%xx`（解出来不是 UTF-8、有 NUL 的 404）；空的、以 `/` 开头或结尾、有空段、`.`、`..`、`\`、`:`、控制字符的 400，不问核心。收下的接在网页目录后面（`<目录>/<路径>`），照 `package.file` 读：核心另照真实路径查，链接出了网页目录的 `not_found`。
5. 一块块给、核心拒的换成什么状态、给到一半断了怎么办同第四条第 5 款（`not_found`、`unknown_package` 404，`bad_params` 400，别的 502；握手被拒 401，这个令牌的后台页、外观票据一起作废）。
6. 类型照扩展名查 `web.json` 的 `types`，没有的 `application/octet-stream`。响应头：`Content-Security-Policy` 照页面的 `csp`（这些文件是页面自己加载、同源跑的，不进框），`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Cache-Control: no-cache`；不带 `Access-Control-Allow-Origin`：同源用不着。
7. 有外观文件在给，网页软件不算空闲。方法只认 `POST /theme`、`GET /t/…`，别的 405。页面怎么加载见网页的蓝图 `web/architecture.md`「外观包」。

**五、这台电脑上的几样**（2026-10-30 项目主人：网页的多平台适配，「打开目录」都是假的，只是复制 `~` 开头的路径。演示的桥早就有 `/reveal`、`/pick-dir`、`/wallpaper`，网页软件没有，页面只好退回）

1. 只给这台电脑上来的：对端不是回环地址的（局域网里别的设备，第一条第 7 款的 `remote`）一律 403——在装 Miyu 的那台电脑上开文件管理器、弹选目录框，对别的设备没意义；页面开在局域网地址上的也不请（照旧退回）。
2. `GET /reveal?path=<路径>`（「打开目录」）、`GET /pick-dir?title=<标题>&start=<从哪开始>`（选工作区的「选择文件夹…」）、`GET /wallpaper?dark=0|1[&data=1]`（主题「跟随壁纸」）要 `Authorization: Bearer <设备令牌>`，照这个令牌连核心握手（同 `/media`，核心不认的 401）：别的网站能往 `127.0.0.1` 发不带头的请求（`<img>`、表单），带了这个头就要先问一句（CORS 预检），网页软件不答，浏览器就不发。
3. 开目录、选目录照桥的做法，放在共用的 crate `miyu-desk`（桥和网页软件一份代码）：只开目录不开文件，`~`、`~/…` 照家目录接，还没建的、上一层在的建出来再开；Linux `xdg-open`、macOS `open -R`（2026-11-02 第四轮审查 W4-4：`.app` 这类包也是目录，`open <目录>` 会启动它；`-R` 在 Finder 里选中它、不打开，普通文件夹也是在上一层里选中，人双击进去）、Windows `explorer`；选目录 Linux 依次试 `zenity`、`kdialog`，macOS `osascript`，Windows PowerShell 的 `FolderBrowserDialog`，标题和起点经环境变量交给对话框程序。回 `{"ok":true}`、`{"missing":true}`、`{"unavailable":true}`；`{"path"}`、`{"cancelled":true}`、`{"unavailable":true}`。选目录要等人点完，不限时；等着的时候不算空闲。
4. 壁纸照桥的 `/wallpaper`（crate `miyu-wallpaper` 找、认图、盯文件；候选色照 `miyu_client::seeds`，一张图算一次）：回 `{sig, kind, seeds?}`，带 `data=1` 回那一份本身（matugen 的 JSON 或者图），都没有的 404。`GET /wallpaper/events` 一条 `text/event-stream`，壁纸来处的文件变了发一条 `changed`（不带内容，不要令牌：`EventSource` 带不了头；只说变了，取还是走 `/wallpaper`）。开着的不算有人连着，同时最多 16 条，满了回 503（2026-11-02 第四轮审查 W4-3：原来开着的不算空闲，不带凭据，这台电脑上随便哪个程序、哪个网页开一条不关，网页软件就一直不空闲退出，条数也不限、一条一个任务；页面开着总连着 `/ws`，那条算忙就够了。没选换票：`EventSource` 带不了头，换票要页面多一步，只为一条只说「变了」的流不值）。记着上一次的回答（2026-10-30 桌面端在 Win11 上抓到：页面每次拿回焦点都问，网页软件每次拉一个 `reg.exe`，没带 `CREATE_NO_WINDOW` 的每次闪一个终端窗口）：Windows、macOS 上换壁纸一定会改盯着的那几份文件，盯着、文件从上次问到现在没变的直接交记着的；Linux 上有只经 IPC 换、不落文件的壁纸程序，照旧每次找。网页软件拉起的程序（`miyu-wallpaper` 找壁纸的命令、`miyu-desk` 的、`open` 起的 `forget`）在 Windows 上一律带 `CREATE_NO_WINDOW`；`serve`、核心经核心的 `spawn_detached`，本来就不开控制台。
5. 方法只认 `GET`，别的 405。

**七、导出原始包**（核心 SE-1 中（f8f8a9bae），设计 58，W-1098；core1 11-04 定的走法：页面不能叫核心写本机路径——局域网来的连接调 `session.export` 的 `to.path` 核心回 `local_machine_only`，页面也不该知道这台电脑的路径——由网页软件替它写、再交给浏览器）

1. `POST /export`：`Authorization: Bearer <登录令牌>`；正文是 JSON `{session, name?}`：`session` 照核心会话编号的写法（十六进制和 `-`，最多 64 个），`name` 是存下来叫什么（页面写会话的标题），可以不写；不对的 400。方法只认 `POST`，别的 405。
2. 只认页面自己发的（同第一条第 12 款 `/ticket` 的 Origin 规矩）：Origin 要有、和 `http://` 加这个请求的 Host 逐字一样（Host 照第一条第 4 款核对过：本机的三种、听局域网时的 IP 写法）。不是的一律 403、没有正文、不说为什么（运行日志 `export refused`）。别的网站的页面带的是它自己的 Origin；它要带 `Authorization` 头也得先预检，网页软件不答。
3. 登录令牌照 `/media` 的办法核对：照它连核心握手（和 `/media` 共用那一池连接；从别的机器来的照第三条第 0 款先说 `connection.remote`），问一句 `config.get`，握手被拒（没带、作废了、过期了）401，连不上 502。局域网来的、同机反向代理转进来的凭登录令牌照样能导。
4. 认了的用网页软件**自己的本机连接**导：照 `miyu web` 那样出示本机令牌连核心（`connect_or_start`，没在跑就拉起来，同 `/ticket`），`session.export {session, format: "bundle", to: {path}}`，最多等 10 分钟没回音（`Core::call_waiting`，核心 CA-1；原来照 `call` 只等 30 秒，大会话到点回 503，W-1098 补）。路径在系统临时目录下网页软件自己的子目录：`<temp>/miyu-webui-<进程号>/<16 个随机字节的十六进制>.zip`（`std::env::temp_dir()`：Linux 上 `$TMPDIR` 或 `/tmp`，macOS 是本人的 `$TMPDIR`，Windows 是本人的 `%TEMP%`）。数据根里面核心拒 `export_in_data_root`；同名的拒 `export_exists`，所以每次一个新的随机名。子目录起来时建（只建这一层，已经有的不认；Unix 上 `0700`），建不成的 `/export` 一律回 503 `{"reason": "export_unwritable"}`。
5. 导成了回 `200 {"url": "/export/<票据>", "bytes": <包多大>}`（`no-store`、`nosniff`、`no-referrer`）：票据 32 个随机字节、64 位小写十六进制，不是文件名。没成的回 `{"reason": <原因码>, "error": <核心的原话>}`：核心拒的照它的原因码（`session_not_found` 404、`bad_params` 400，`session_broken`、`export_unwritable` 这些 502），连不上核心、拉不起来 503（原因码是 `miyu-client` 的 `unreachable` 这类）；写了一半的删掉。页面照 `reason` 说人话（`web.md`「会话导出」）。
6. `GET /export/<票据>`：把文件交给浏览器，一块 512 KiB 地读、读一块写一块；响应头 `Content-Type: application/zip`、`Content-Length`、`Content-Disposition: attachment; filename="<名字>.zip"; filename*=UTF-8''<名字>`（名字照 `name` 只留最后一段、去掉控制字符、最多 120 个字，没写的写 `miyu-<会话编号>`；`filename` 里 ASCII 以外的字和 `"`、`\`、`%` 换成 `_`，`filename*` 照 RFC 5987 写原样）、`Cache-Control: no-store`、`Content-Security-Policy: sandbox; default-src 'none'` 和第一条第 5 款一律带的两个头。票据一取就作废（再取 404），给完删文件（浏览器中途走了、读不下去的也删）：先关文件再删，Windows 上开着的删不掉。不认识的票据 404；方法只认 `GET`，别的 405。不看 Origin：浏览器照 `<a download>` 下载不带它，票据就是凭据（同 `/media`）。
7. 多久删：没人取的过 10 分钟删（常量 `export::IDLE`，W-1098 定的：页面换到票据马上就取，取不走的多半是浏览器关了；包里有她碰过的文件内容，不在临时目录里久放）；同时等着取的最多 8 份，多了丢最早的那一份、删它的文件。不定时醒：接连接的那一圈睡到最早的那一份到点（同第一条第 3 款的「不定时醒」）。导着、给着的时候不算空闲；等着取的不算忙（空闲到点照样退）。
8. 起来、退出：起来时先清系统临时目录下上回剩下的 `miyu-webui-*`：只认名字是 `miyu-webui-` 后面全是数字的真目录（不跟链接）；和自己同一个进程号的（上回的进程号重用了）整个删掉再建；别的进程号的可能是另一个数据根上正在跑的网页软件，只删放了 10 分钟以上的文件，删空了连目录删；读不了、删不掉的（别的用户的）跳过。退出时（空闲、信号、`--stop`）整个自己的子目录删掉。
9. 网页软件进程重启，票据全作废，页面照 404 重新导一次。

### 发版（W-1095，2026-11-04）

照官方打包模板（`miyu-agent/packages/.github/workflows/pack.yml@main`，同 miyu-render、miyu-embed；core1 11-04 照项目主人 11-03 定的进官方源）：

1. 版本写在两处，一样：`Cargo.toml` 的工作区版本、`miyu-webui/package.toml` 的 `version`（`tools/pack-web.py` 核对，不一样的不打）。版本号照核心设计 59「版本号」：年.月.这个月第几版（从 0 起、月不补零），核心、终端、网页、托盘一起发版时同一个号（2026-11-06 项目主人定）；2026-11-07 定号 `2026.11.0`（W-1117，主人要整套照真的发版路装来实测）。原来是 `0.1.0`。网页里自己的小包（`web-demo/packages/*` 的清单）照旧 semver。
2. 清单写 `targets = ["linux-x86_64", "linux-aarch64", "macos-aarch64", "windows-x86_64"]`：CI 测着的这四种（linux-aarch64 2026-11-05 加，W-1100：核心发版 RL-1 的命令行版照 `pack-web.py --stage` 要四种；CI、release.yml 多一台 `ubuntu-24.04-arm`）。托盘程序装进资源目录的也是这一份清单，写全了在这几种上都认（原来不写 targets、由打包脚本补一种，写死一种别的系统就装不上）。
3. `.github/workflows/release.yml`：推 `v<版本>` 的标签时一种系统一个 job：编 release 的 `miyu-web`，`tools/pack-web.py --stage dist/miyu-webui` 照装好的样子搭包文件夹（清单、`web.json`、`matugen/`、`loading.html`、`pages/`、`bin/miyu-web`、本仓库的 `LICENSE`（AGPL-3.0-or-later）、`THIRD-PARTY-LICENSES.txt`），模板照它 `miyu pkg pack`、核对标签和版本、传进 Release。手动跑（`workflow_dispatch`）的不传，包放进产物：发版前先试三种系统打不打得出来。
4. 打标签、推标签由项目主人自己跑。

### 出错、运行日志

| 级别 | 这件事 | 什么时候 |
|---|---|---|
| `INFO` | `listening url=…`、`stopped reason=…` | 起来、退出（`idle`、`signal`、`stop`） |
| `WARN` | `rejected host=… origin=…` | Host、Origin 不对 |
| `WARN` | `ticket refused remote=…` | `/ticket` 不是本机的页面自己发的（第一条第 12 款），回 403；不记票 |
| `WARN` | `ticket unavailable error=…` | `/ticket` 连不上核心、要不到票，回 503 |
| `WARN` | `stop refused remote=…` | `/stop` 不是 `--stop` 带钥匙发的（第二条第 10 款），回 403 |
| `WARN` | `stop key not written error=…`、`no random bytes for the stop key` | 写不成停止钥匙：`--stop` 停不了这一个，空闲到点照样退 |
| `WARN` | `core unreachable error=…` | 连不上核心 |
| `DEBUG` | `websocket connected`、`websocket closed` | 一个标签页连上、断开 |
| `WARN` | `media cut short offset=… error=…` | `/media` 给到一半核心那头断了、给得比说的少：连接照 HTTP 的规矩断掉，浏览器知道没收全 |
| `WARN` | `no random bytes for a ticket` | 票据造不成，回 500 |
| `WARN` | `page cut short offset=… error=…` | 软件后台页给到一半核心那头断了、给得比说的少：连接照 HTTP 的规矩断掉 |
| `WARN` | `export refused remote=…` | `/export` 不是页面自己发的（Origin 不对、没有，「怎么走」第七条第 2 款），回 403 |
| `WARN` | `export failed reason=…` | `/export` 叫核心导没成（核心拒的原因码、连不上核心的 `unreachable` 这类），回 `{reason, error}` |
| `INFO` | `export ready bytes=…` | 原始包导好了、换了下载票据（不记票据、会话编号、路径） |
| `INFO` | `export expired` | 导好的没人取，到点删了（第七条第 7 款） |
| `INFO` | `export leftovers removed removed=…` | 起来时清掉了上回剩下的（第七条第 8 款） |
| `WARN` | `export dir not made error=…`、`export not removed error=…`、`export dir not removed error=…` | 建不了自己的子目录（`/export` 一律 503）、删不掉一份、退出时删不掉子目录 |
| `WARN` | `export cut short error=…` | 给到一半读不下去：连接照 HTTP 的规矩断掉，文件照删 |

`/media` 的状态码见 `web-module.md`「出错」网页软件的 HTTP 那张表。

### 给人看的字

`miyu web` 印的，照核心握手回的 `language`（中文、英文）：见 `web-module.md`「给人看的字」第二张表（`crates/miyu-web/src/texts.rs`）。网址印在标准输出上，别的话印在标准错误上。

### 守着它的

| 测试 | 守着什么 |
|---|---|
| `xtask/src/licenses.rs`（`cargo xtask licenses`，CI 在 Linux 上跑；2026-10-30 发布前的许可证审查第 9 条，照 miyu-im 的门禁搬的） | 发布的四个平台上用得到的第三方 Rust 依赖，许可证都能和 AGPL-3.0-or-later 合在一起发：照每个包 `license` 的 SPDX 表达式算（`OR` 有一个能用就行、`AND` 每个都要、`WITH` 只认 `LLVM-exception`），没写 `license` 的、合不到一起的一包一行报出来；照 git 钉住的核心的 crate 也算。页面里收的第三方资源（字体、图标、拷来的库）不归它管，照 README「许可证」那张表；同一个命令还查第三方许可证清单是不是最新的（下一行） |
| `xtask/src/notices.rs`、`xtask/src/notices/`，`miyu-webui/THIRD-PARTY-LICENSES.txt`（`cargo xtask notices` 生成；2026-10-30 照核心施工 AU-2 搬的，核心蓝图 `licenses.md`「第三方许可证清单」第 7 条：头另有自己编进去的第三方包，各自出一份、随头发） | 网页软件编进了的第三方 Rust 包（四个平台正常依赖的并集；照 git 钉住的核心自己的 crate 是同一个项目，不算）和网页包里带的第三方前端资源（README「许可证」那张表，`notices.rs` 的 `DATA`），每个的版权和许可证原文合成一份；包没带许可证文件的用 `notices/` 下的 MIT、Apache-2.0、BSD-3-Clause 标准原文。放在网页包的文件夹里：`tools/pack-web.py` 打的包（连仓库根的 `LICENSE`）、核心照 `heads.toml` 搬 `miyu-webui/` 进安装包，都带着它。升了、加了依赖或前端资源的那一步跟着重新生成，和代码进同一个提交；`cargo xtask licenses` 重算一遍，不一样就算没过 |
| `crates/miyu-web/tests/serve.rs` | 单实例、`run/miyu-webui/address`、那一行；端口被占说清楚；Host 只认三种写法；页面文件不出页面目录（`..`、`%2e%2e`、链接、目录）；响应头一个不少、从不设 cookie；`HEAD`、别的方法 405；空闲到点退出、删 `run/miyu-webui/address`、放锁；听局域网时到点不退；页面文件带 `ETag`，`If-None-Match` 对上（一串里有、弱比较）回 304，改了照常给 |
| `crates/miyu-web/tests/desk.rs` | `/reveal`、`/pick-dir`、`/wallpaper` 不带令牌、核心不认的 401，只认 `GET`；认的令牌开不在的目录回 `{"missing":true}`（测试里不真开文件管理器、选目录框）；`/wallpaper/events` 不要令牌、是 `text/event-stream`、最多同时开 16 条（关一条空出来能再开，第四轮审查 W4-3） |
| `crates/miyu-web/tests/audit4.rs` | 第四轮审查的两条（2026-11-02）：关了局域网（`web.listen` 换回回环）以后别的设备连着的 `/ws` 5 秒内断开（W4-2）；开着一条不带凭据的 `/wallpaper/events`，空闲到点照样退出（W4-3） |
| `crates/miyu-web/tests/stop.rs` | `--stop`、`/stop`（W-1091）：叫停的照常收尾（锁放了、地址和钥匙删了、`serve` 正常走）；没在跑的照实说；没带钥匙、钥匙不对、带 Origin、带反向代理的头 403，`GET` 405，都照旧跑着；钥匙对上 204 |
| `crates/miyu-web/tests/export.rs` | `/export`（核心 SE-1 中（f8f8a9bae），设计 58，W-1098；核心用替身：登录令牌、本机令牌都认，`session.export` 照给的路径写）：没带、作废了的登录令牌 401，编号的写法不对、没写 400，都不叫核心导；别的网站的 Origin、`null`、和 Host 不是逐字一样、`https`、没有 Origin 403 且没有正文，`GET /export`、`PUT /export/…` 405；导成了拿到票据（不是文件名），核心那一问是网页软件出示本机令牌的连接发的、没说 `connection.remote`，`format: "bundle"`，路径是 `<temp>/miyu-webui-<进程号>/` 下的 `.zip`、子目录 `0700`（Unix）；取到的字节一个不差，`application/zip`、`Content-Length`、`Content-Disposition`（ASCII 的和 `filename*`）、`no-store`、`nosniff`、不设 cookie，给完文件删了、再取 404；没写名字的照会话编号叫；核心拒的照原因码和原话回、什么都不留；反向代理转进来的（远程）凭登录令牌照样导，导的那一问照样走本机连接；没人取的到点删、票据作废；空闲退出时自己的子目录删掉；起来时清上回剩下的（别的进程号放久了的删、删空了连目录删，刚放的留着，同进程号的整个删掉重建，名字写法不对的、别的目录不碰） |
| `crates/miyu-web/src/export/tests.rs` | 子目录名字只认 `miyu-webui-` 加数字；存下来叫什么（最后一段、去控制字符、最多 120 个字、补 `.zip`、空的照编号）；`Content-Disposition` 两种写法；Origin 和 Host 逐字一样 |
| `crates/miyu-web/tests/ticket.rs` | `/ticket`（W-1089）：本机的页面自己发的（`127.0.0.1`、`localhost`、`[::1]` 三种 Host，带 JSON 正文的也算）拿到票，回应 `no-store`、`nosniff`、`no-referrer`、不设 cookie；伪造的 Host（名字、局域网 IP、端口不对）、Origin 不对、是 `null`、和 Host 不是逐字一样、没有 Origin、没有自定义头、自定义头不是 `1`、表单的三种正文、带反向代理的哪一种头都 403 且没有正文；`GET` 405；核心没在跑、旧核心没有 `login.ticket` 的 503 带 `error` |
| `crates/miyu-web/src/ticket/tests.rs` | `local` 的每一条：三种本机写法认，缺 Host、Origin、自定义头，Origin 不对、`https://`、`null`、和 Host 写法不同，Host 是名字、局域网 IP、端口不对，表单的正文（带参数、大小写不同）都不认 |
| `crates/miyu-web/tests/listen.rs` | `GET /listen` 回在听的、Host 照旧核对；`POST` 不带设备令牌、核心不认的 401；核心没在跑的回 `error`、接着听原来的；换地址（同一个端口）、换端口（`run/miyu-webui/address` 跟着换、旧端口不再接、连着的 WebSocket 不断）、配置没变不动、`--port` 起的端口不随配置换；听局域网时空闲到点不退、换回回环照旧退；不用页面请，起来先照核心的配置换、推来改动当场换回 |
| `crates/miyu-web/src/listen/tests.rs` | `lan` 的写法（回环没有、某一个地址就是它、IPv6 加方括号）；同一个端口换地址、换端口先听新的、新端口被占留着旧的 |
| `crates/miyu-web/tests/ws.rs` | 一帧一行两头照转，一个字节不改（凭据、中文、空白、很长的一行）；Origin 不对 403；二进制 1003、超过 1 MiB 1009，照原始字节发的超长帧读得到 1009、读到头不是被重置；核心断了 1012；连不上核心发 `web.error` 再关；转发的代码里不读本机令牌（照源码查，施工 O-16 起连同搬进 `miyu-webserve` 的那几份）；听局域网时别的地址来的先写 `connection.remote`、再转握手，本机来的不写，Host 是名字的 403 |
| `crates/miyu-web/tests/media.rs` | 核心用替身（照登录令牌握手、答 `blob.get`、`fs.read`，同一条连接上乱序答）：换票据要登录令牌（没带、带错 401）；正文 `blob`、`path` 正好一个，不对 400；没有的 404、数据根里的 403、连不上核心 502；同一个令牌、资源、三格交回同一张，连接复用；全部、`Range` 206 和 `Content-Range`、超出 416、好几段和写法不对的照没写；一块不超过 512 KiB、拼起来一个字节不差；同一条连接上同时几问各拿各的；类型照表、表里没有的不认、`sandbox`、`nosniff`、`private, no-cache`；下载的名字；令牌作废了 401、票据一起作废；在给不算空闲；票据过期、满了丢最久没用的 |
| `crates/miyu-web/tests/backstage.rs` | 核心用替身（多答 `package.list`、`package.file`）：换票据要登录令牌（没带、带错、不是 Bearer 401）；正文不对 400；没有后台页、没有这个包 404；同一个令牌、同一个包交回同一张；页面文件和响应头（类型、`backstage_csp`、`nosniff`、`no-referrer`、`no-cache`、`Access-Control-Allow-Origin: *`、不设 cookie）；以 `/` 结尾补 `index.html`；没有的 404、核心拒 `bad_params` 400；票据只开它的包、不认识的 404；大文件一块块问、拼起来一个字节不差；令牌作废了 401、票据一起作废；方法 405 |
| `crates/miyu-web/tests/theme.rs` | 网页外观（核心 TH-1）：换票据要登录令牌（没带、带错 401）；正文不对 400；只有后台页、什么都没带、没有这个包 404；同一个令牌、同一个包交回同一张；文件照网页目录读（路径前面接上目录）、类型照表、表里没有的 `application/octet-stream`、页面的 `csp`、`nosniff`、`no-referrer`、`no-cache`、不带 `Access-Control-Allow-Origin`、不设 cookie；没有的 404；`..`、`%2e%2e`、空的、以 `/` 结尾、空段、`\`、`:` 400 且不问核心；票据只开它的包，后台页、外观的票据互相开不了；大文件一块块问、拼起来一个字节不差；令牌作废了 401、票据一起作废；方法 405 |
| `crates/miyu-web/src/theme/tests.rs` | 外观的地址拆成票据、包、文件（收不收的每种写法）；网页目录照 `package.list` 找（去掉结尾的 `/`，只带终端主题的、没有的、空的不算） |
| `crates/miyu-web/src/backstage/tests.rs` | 地址拆成票据、包、文件（`%xx`、补 `index.html`、NUL、不是 UTF-8、包编号写法）；包编号的写法；核心拒的换成状态码；类型照扩展名 |
| `crates/miyu-web/src/media/tests.rs` | `Range` 每种写法（大小写、超出、好几段、写法不对、空的资源）；下载的名字只留最后一段、`attr-char` 以外都转义 |
| `crates/miyu-web/tests/open.rs` | 拉起真的 `miyu-web serve`；`--reset` 的带 `#setup=`；交给浏览器的不带票、不写跳转页，直接交 `<地址>/`（W-1089），`--print`、交不给浏览器的（没设过密码的也是）带 `#ticket=…`（不带账号）、核心不给票的什么都不带；带一次性码的交给浏览器的是只给本人的跳转页、里面才是网址，过期的跳转页下一次 `open` 删掉；`--package` 的带 `package=`，和一次性码一起是 `#setup=…&package=…`；`--session`、`--settings` 的带 `session=`、`settings=`，跟在后面（`--format json` 一起查）；`--print`、交不给浏览器的印网址和提醒；`--format json` 只印一行 `{url, first}`、不开浏览器不印提醒；`--logout`；端口被占照人的语言说 |
| `crates/miyu-cli/src/web/tests.rs` | 参数照原样交给 `miyu-web open`；没装时说怎么装、退出码 1；装了的照它的退出码 |

### 施工时定的（施工 W-9，2026-10-04）

| # | 定了什么 | 为什么 | 别的选法 |
|---|---|---|---|
| 1 | 出厂端口 8300（项目主人定：Miyu 的生日是 8 月 30 日） | 好记，和角色对得上 | 8765（网页演示的桥一直用的） |
| 2 | `open` 拉起 `serve` 照拉起核心的办法：`miyu-ipc` 把「拉起、跟终端脱开、等那一行」开放出来（`spawn_detached`） | 同一套脱开、收尸、读一行的代码，三个平台的坑只踩一次 | `miyu-web` 自己再写一份 |
| 3 | `miyu-web` 拉起核心用自己真实位置旁边的 `miyu`，和 `miyu web` 找它是一个办法 | 两个程序装在一处（同一个发行包的规矩，W-11 打包时检查） | 照 `PATH` 找（装了两份时找错） |
| 4 | 测试里核心用 `miyu-ipc` 的监听当替身 | 网页软件只认本机传输，测试不该为了替身反过来依赖核心；真核心在真机实测时走 | 测试依赖 `miyu-core`（层序反过来） |
| 5 | 端口被占时 `serve` 写 `error port <端口> in use`，`open` 认这个写法、照人的语言说 | `serve` 起来时还没连核心，不知道人的语言；那一行是两个程序之间的话 | `serve` 照系统语言写中文（`open` 原样印，英文的人看到中文） |
| 6 | 往浏览器写的都经一个写的任务（通道），读核心、读浏览器各在一处 | 两头都可能要关 WebSocket（1003、1009、1012）；读一行不能在 `select!` 里被打断（读到一半丢字） | 两头抢着写一个 sink |
| 7 | 只数 WebSocket 算忙，要页面不算 | 页面一次就拿完；开着的标签页总有一条 WebSocket | 每个 HTTP 请求都续一次（一个探活的脚本就能让它不退） |
| 8 | `cli/web.md` 不另开，`miyu web` 写在这一页 | `miyu web` 只是找程序、交参数，怎么走都在 `miyu-web open` | 另开一页（两页说同一件事） |
| 9 | 资源目录最上一层的 `web/`（`web.json`，以后的页面）不进提示词登记簿（`xtask/src/ledger.rs` 豁免，和 `models/` 一样） | 给浏览器的，不发给模型 | 登记进 26 第十节（登记簿里混进不发给模型的东西） |
| 10 | 关了以后先关写的一半、把浏览器还在发的读掉再放套接字，最多等 2 秒（W-9 验收时补，2026-10-04） | 带着没读的数据关，系统回 RST，刚写出去的关闭帧可能被对面丢掉：超过 1 MiB 的帧正文没读，Windows 上浏览器收不到 1009、只看到连接被重置（CI 上稳定复现）；读掉再关就是正常的 FIN | 只改测试让客户端边发边读（真浏览器也是边发边读，但 RST 和关闭帧照样赛跑）；把那一帧读完再关（帧可能很大，要另加上限） |

### 施工时定的（施工 W-10，2026-10-04）

| # | 定了什么 | 为什么 | 别的选法 |
|---|---|---|---|
| 11 | 第三条第 7 款说的「blob 类型表」就是 `web.json` 里 `types` 那张表的值：`type` 是表里出现过的才照它，别的不认、照没写 | 一张表两头用，不会一边加了一边忘 | `web.json` 另开一张允许的媒体类型表 |
| 12 | 连核心：一个登录令牌一条连接，几个请求在同一条上同时问，照编号把回应分回去；60 秒没人用就关；用着的断了（核心重启、令牌作废了核心断开）重连再问一次 | 一个视频拖进度会同时来好几个分段请求，一问一答会排队 | 每个请求单开一条连接（每次都要握手） |
| 13 | `Range` 只认一段（`bytes=a-b`、`bytes=a-`、`bytes=-n`）；好几段的、写法不对的照没写，回全部（RFC 9110 允许不理）；超出的 416 带 `Content-Range: bytes */<大小>`；回应都带 `Accept-Ranges: bytes` | 浏览器放音视频只发一段；好几段要拼 multipart，没人用 | 好几段的回 416 |
| 14 | `GET` 时再问一次大小，照这时的大小算 `Range`、`Content-Length`；给得比说的少就断开连接 | 票据活 12 小时，文件可能变了 | 照换票据时记下的大小 |
| 15 | 握手被拒（令牌作废了、过期了）：`POST`、`GET` 都回 401，这个令牌的票据一起作废 | 退出登录、`miyu web --logout` 以后，旧票据不该还能拿到东西 | 票据活到 12 小时 |
| 16 | 票据多久不用、最多几张写进 `web.json`（`ticket_idle_seconds`、`most_tickets`），连核心的 60 秒写在代码里；施工 9-1 下起这两项挪成配置项 `web.ticket_idle_seconds`、`web.most_tickets`（设置页不露） | 「起草时定的」第 25 条：网页软件的数放在 `web.json`；60 秒只是省一条连接，不是给人调的 | 都写进 `web.json` |

### 施工时定的（施工 F-6 下，2026-10-10）

| # | 定了什么 | 为什么 | 别的选法 |
|---|---|---|---|
| 17 | 票据的类型 `Tickets` 照要的东西做成泛型，`/media`、软件后台页各一份；连着的核心（`Cores`）共用 | 造、找、作废、过期、上限一份代码；两边的票据互相开不了对方的东西 | 一份票据表加一种来源（`/media/<票据>` 要另外挡掉后台页的票据） |
| 18 | 换票据时问一次 `package.list` 查有没有后台页，没有的 404 | 不给没后台页的包造票据，页面马上知道打不开 | 照给文件时 `package.file` 的 `no_page` 才知道 |
| 19 | `/p/` 不认 `Range`，第一块读到了才写响应头（`Content-Length` 照整份） | 页面文件都小；先读一块才知道有没有这份、多大 | 先问一次大小再读（`package.file` 没有只问大小的写法，要多读一块） |
| 20 | `Access-Control-Allow-Origin: *` | 不给 `allow-same-origin` 的框来源是空的，ES 模块脚本、字体照跨源取，不给取不到；票据就是凭据 | 写 `null`（空来源都是 `null`，口子一样大） |
| 21 | `miyu web --package <编号>` 照包编号的写法查（`backstage::valid_package`），网址里 `package=` 跟在一次性码后面 | 编号放进网址不用转义；页面照 `#` 后面的几项读 | 不查原样带（写错的到了页面才发现） |
| 22 | `decode`（解开 `%xx`）从 `miyu-webserve` 的页面文件那里开放出来用 | 同一套规矩（不是 UTF-8、有 NUL 的不要）只写一处 | 网页软件里再写一份 |

### 施工时定的（网页外观，核心 TH-1，2026-11-02）

| # | 定了什么 | 为什么 | 别的选法 |
|---|---|---|---|
| 23 | 外观另开 `/theme`、`/t/`，地址同后台页带包的编号：`/t/<票据>/<包>/<路径>`，回应同样是 `{"url"}` | 页面的宿主换票据是同一个写法（`served.js` 的 `post`）；地址里看得出是哪个包 | 回 `{"base": "/t/<票据>/"}`（页面多一种写法）；和后台页共用 `/page`、`/p/`（后台页的文件放进框、外观的同源跑，响应头不一样，票据也不该互相开） |
| 24 | 换票据时照 `package.list` 记下网页目录，给文件时在路径前面接上；`..` 这些网页软件自己先挡（400），不交给核心 | 核心的 `package.file` 对外观包照包目录写路径，只给网页目录下的；网页软件先挡一道，`web/../package.toml` 这种不靠核心的第二道 | 每次给文件都问一次 `package.list`（一份文件多一问）；页面自己接目录（页面能拿到包目录里网页目录外的路径去问） |
| 25 | 响应头照页面的 `csp`、不带 `Access-Control-Allow-Origin` | 外观包的脚本、样式是页面同源加载的（项目主人：不设限），不进框 | 照后台页的 `backstage_csp`（带 `sandbox`，对子资源不起作用，写了也是假的） |
| 26 | 一块块给、问核心、没问成写成状态码挪成 `backstage.rs` 的 `stream`、`ask`、`refused` 两边共用；握手被拒时两种票据一起作废 | 一份代码；令牌作废了，它的哪种票据都不该还能用 | `theme.rs` 再抄一份 |


### 施工时定的（W-1085，2026-11-03）

| # | 定了什么 | 为什么 | 别的选法 |
|---|---|---|---|
| 27 | `--session` 照核心会话编号的写法（UUID）查，`--settings` 的分页照包编号的写法查；分页在不在不查 | 编号放进网址不用转义，写错的当场说；设置页有哪些页要连核心读 `config.schema`、还有软件包挂的页，命令行不知道 | 都不查原样带（写错的到了页面才发现）；命令行列一张分页表（核心、软件包加了页就对不上） |
| 28 | 设置的首页在网址里写 `settings=`（空的），「访问」那一组写 `settings=access` | `#` 后面几项都是 `键=值`，页面照 `URLSearchParams` 读；`access` 不是一页，是「通用」里的一组，托盘程序只认这一个名字 | 首页写 `settings=general`（那就不是「上次看的那一页」了） |
| 29 | `session=`、`settings=` 页面读完就从地址栏抹掉，`package=` 照旧留着 | 这两项是「打开时去哪」，留着的话刷新、收藏都会再切一次会话、再开一次设置 | 照 `package=` 留着 |

### 施工时定的（W-1089，2026-11-03）

| # | 定了什么 | 为什么 | 别的选法 |
|---|---|---|---|
| 30 | 本机免密走网页软件的 `POST /ticket`，照本机令牌问核心要交接票（项目主人选「本机就不要凭证了」），页面拿到照 `#ticket=` 的路子握手 | 核心那边不用改：交接票本来就是给本机来的人免密进门的，`miyu web` 一直这么用；网页软件和核心在同一台电脑上、读得到本机令牌 | 核心对本机来的 WebSocket 直接放行（核心改协议，局域网、反向代理分不清的还得网页软件说）；页面一直显示密码屏、提示去终端（刚装好的人走不下去） |
| 31 | `/ticket` 只认本机的页面自己发的：回环、不带代理头、Host 只认本机三种写法、Origin 和 Host 逐字一样、带 `X-Miyu-Local: 1`、不是表单的正文；不对的一律 403 不说为什么（core1 提的防护） | 同机别的程序本来就读不到本机令牌，但别的网站的页面能往 `127.0.0.1` 发请求：Host 挡 DNS 重绑定，Origin 挡跨站，自定义头逼出预检（网页软件不答）、表单的三种正文挡不用预检的跨站表单 | 只看回环（DNS 重绑定、跨站表单都挡不住）；只看 Origin（没有 Origin 的老写法、表单的边角难说全） |
| 32 | `/ticket` 照 `connect_or_start` 连核心，没在跑就拉起 | 页面要票在开 `/ws` 之前；不拉起的话核心没在跑时每次都退回密码屏，到这一屏就真的是核心起不来，提示照实说 | `connect_running` 不拉起，等 `/ws` 拉起（第一次打开总要输一次密码或刷新） |
| 33 | 一个页面只问一次 `/ticket`：起来时没凭据、握手时令牌作废了，合起来只问这一次；要不到的（403、503、网络错）出「输入访问密码」，那一行暗字改成照实说「本来不用密码，这次没连上核心，去终端运行 miyu web 看原因」 | 握手被拒、再要、再被拒会来回；本机地址上能到密码屏的多半是核心起不来，原来那句「运行 miyu web 打开不用输入密码」不再是解法 | 每次握手被拒都再要（票作废、核心拒的时候来回转）；不出密码屏只出错误卡（旧核心、核心起不来时设过密码的人也进不去） |
| 34 | `miyu web` 交给浏览器的不带票，直接交 `<地址>/`、不写跳转页；`--print`、`--format json`、交不给浏览器的照旧带票（项目主人：地址栏、历史里看不到凭据） | 浏览器在本机地址上自己会要票；印出来的可能交给别的程序、别的浏览器配置，带着票照旧能用 | 照旧带票、页面读完用 `replaceState` 抹掉（交出去的那一刻网址已经到了浏览器手里，项目主人要的是一开始就不出现） |

### 施工时定的（W-1098，2026-11-04）

| # | 定了什么 | 为什么 | 别的选法 |
|---|---|---|---|
| 35 | 原始包由网页软件导：`POST /export` 照本机令牌叫核心写到系统临时目录下自己的子目录，再一次性交给浏览器（core1 11-04 定的） | 局域网来的连接调 `to.path` 核心回 `local_machine_only`；页面不该挑、也不该知道这台电脑的路径；网页软件和核心在同一台电脑上、读得到本机令牌 | 页面叫核心写进 blob 再走 `/media`（核心没有导到 blob 的写法）；Markdown 那样放进回应（原始包可能很大，核心只给 512 KiB 以内的） |
| 36 | 放在系统临时目录下 `miyu-webui-<进程号>/`、每次随机名，没人取的 10 分钟删，起来时清上回剩下的 | 数据根里核心不写；同名的不覆盖；包里有她碰过的文件内容，不该久放；进程号分开一台机器上几个数据根各自的网页软件，别的进程号的只删放久了的，不碰正在跑的那一个 | 放在数据根的 `tmp/`（核心拒 `export_in_data_root`）；起来时把别的进程号的整个删掉（另一个数据根上正在跑的网页软件给到一半的被删） |
| 37 | `/export` 只看 Origin 和 Host 逐字一样加登录令牌，不要 `/ticket` 那个自定义头 | 登录令牌在 `Authorization` 头里，别的网站的页面要带它本来就得先预检；局域网来的也要能导（Origin 是 IP 写法），所以不能照 `/ticket` 只认本机 | 照 `/ticket` 只认本机的三种写法（局域网、手机上导不了） |
