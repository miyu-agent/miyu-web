//! 网页演示的桥（库）：一个端口上给页面文件，`/ws` 上把浏览器的 WebSocket 转到核心的本机套接字。
//!
//! 它顶替核心里还没有的网页模块（设计 21 X5「页面由核心的 HTTP 模块提供」、04 P5），所以只做模块会做的事：
//!
//! - 只听 127.0.0.1（04 P6：远程访问默认关闭）；
//! - 起来时换一个访问口令，打出带着它的网址（`#k=…` 在 `#` 后面，不发给服务器、不进 Referer）；页面拿到以后
//!   从地址栏抹掉，连 `/ws` 时带上。没有口令的连不上：同一台机器上的别的程序、沙盒里的命令不能冒充你
//!   （设计 21 X6 的一次性登录链接，演示里简化成这一次启动有效）；
//! - 核对 Origin，别的网站连不进来（04 第二节「各平台的坑」）；
//! - 握手时替页面出示本机令牌：浏览器读不到本机令牌，也不该读到（11 第五节）；
//! - 核心还没有 `events.read`，桥读会话日志顶替它（只读，照 `miyu-store` 的 `read_events`）。
//! - 页面读不到本机的资源目录：给人看的字由桥照 `MIYU_RESOURCES` 读好，经 `web.human` 给（`human.rs`）；
//! - mermaid 图由桥画成 SVG，经 `web.mermaid` 给（`mermaid.rs`），核心的网页模块做出来以后搬过去；
//! - 本机文件、blob 经 `/file`、`/blob` 给（`media.rs`），带口令，数据根不给。
//! - 页面连不上时经 `/key?k=口令` 问口令对不对（`204`、`403`，别的不说），好写清楚是桥重启过换了口令还是别的。
//! - 附件由桥先收下（`upload.rs`）：页面拿不到文件在本机的路径，`POST /upload` 存进临时目录，交回路径给 `blob.put`；
//!   `web.upload_done` 删掉。
//! - 链接卡片由桥去抓（`link_preview/`）：元数据经 `web.link_preview` 给，图经 `/link-image` 给，带口令；每一跳过地址闸、
//!   钉住解析好的地址。核心有了 `link.preview` 查询以后搬过去。
//! - `@` 选文件由桥列目录、在工作目录里找（`mention.rs`，`web.files`），数据根不给；核心以后经协议给。
//!
//! 这一份是和传输无关的那一半（跟着蓝图 `web/architecture.md`「宿主怎么搬」第 3 步拆出来）：页面文件、核心连接、
//! `web.*` 顶替、本机文件和 blob 的规矩、收附件、链接卡片都在这里；HTTP、WebSocket 那一层是 `main.rs` 这个外壳，
//! 桌面端（`../desktop/`）的外壳用同一个库，只换外面那一层。
//!
//! 核心没在跑、给了 `MIYU_CORE_BIN` 的，拉起来（`<它> core`）；别的环境变量（`MIYU_HOME`、
//! `DEEPSEEK_API_KEY`、`MIYU_DEV_*`）由拉起的核心照常读。

mod files;
mod history;
mod human;
mod link;
mod link_preview;
mod media;
mod mention;
mod mermaid;
mod upload;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tokio::net::{TcpListener, TcpStream};

/// 这一次启动的几样：页面文件在哪、访问口令、端口。
pub struct Site {
    /// 页面文件的目录（`web-demo/`）。
    pub dir: PathBuf,
    /// 访问口令：十六进制。
    pub key: String,
    /// 在哪个端口上听。
    pub port: u16,
    /// 画 mermaid 图（`web.mermaid`）。
    pub mermaid: mermaid::Mermaid,
    /// 给本机文件、blob 时的媒体类型（`/file`、`/blob`）。
    pub types: media::Types,
    /// 链接卡片（`web.link_preview`、`/link-image`）：抓取的规矩、抓过的、抓回来的图。
    pub link_preview: link_preview::LinkPreview,
    /// `@` 选文件（`web.files`）：列一层目录、在工作目录里模糊找。
    pub mention: mention::Mention,
    /// 用页面的是哪个账号：握手的回应里有，`/blob` 照它找会话日志和 blob。
    pub account: Mutex<Option<String>>,
}

/// 桥跑起来了：打开就用的网址，还有让它在后台继续跑的运行时。
///
/// 拿着它，桥就一直在跑；丢了它（进程退出、状态被换掉）桥跟着停。桌面端的外壳把它存进 Tauri 的状态里。
pub struct Running {
    /// 打开就用的网址：`http://127.0.0.1:<端口>/#k=<口令>`。
    pub url: String,
    /// 让 accept 循环一直跑着的运行时；名字前面带下划线是给编译器看的：它只在被拿着时有用，丢了桥就停。
    _runtime: tokio::runtime::Runtime,
}

/// 起一个桥：在 `port` 上听（0 是让系统挑一个空的），加载页面目录里的资源以后就一直在后台接连接。
///
/// 和 `main.rs` 里那个外壳一样，但把「起好了没有」交回给调用方：桌面端在外壳起来时先起桥，拿到网址再开窗口。
///
/// # Errors
///
/// 页面目录不存在、取不到随机数、起不了异步运行时、听不了端口、页面目录里的资源（mermaid、媒体类型、
/// 链接卡片、`@` 选文件的名单）读不了时交回原因。
pub fn spawn(dir: PathBuf, port: u16) -> Result<Running, String> {
    let dir = dir.canonicalize().map_err(|e| format!("找不到页面文件的目录 {}：{e}", dir.display()))?;
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|e| format!("取不到随机数：{e}"))?;
    let key: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("起不了异步运行时：{e}"))?;
    let listener = runtime
        .block_on(async { TcpListener::bind(("127.0.0.1", port)).await })
        .map_err(|e| format!("听不了 127.0.0.1:{port}：{e}"))?;
    let port = listener.local_addr().map_err(|e| format!("问不到端口：{e}"))?.port();
    let mermaid = mermaid::Mermaid::load(&dir)?;
    let types = media::Types::load(&dir)?;
    let link_preview = link_preview::LinkPreview::load(&dir)?;
    let mention = mention::Mention::load(&dir)?;
    // 上一次没删掉的附件（页面没来得及说的）
    upload::sweep();
    let site = Arc::new(Site { dir, key: key.clone(), port, mermaid, types, link_preview, mention, account: Mutex::new(None) });
    let accept_site = site.clone();
    runtime.spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let site = accept_site.clone();
                    tokio::spawn(async move { serve(stream, site).await });
                }
                Err(e) => eprintln!("接不了连接：{e}"),
            }
        }
    });
    let url = format!("http://127.0.0.1:{port}/#k={key}");
    Ok(Running { url, _runtime: runtime })
}

/// 一条连接：看一眼请求行，`/ws` 的交给 WebSocket，别的当页面文件。
async fn serve(stream: TcpStream, site: Arc<Site>) {
    let mut head = [0u8; 1024];
    let mut seen = 0;
    for _ in 0..50 {
        seen = match stream.peek(&mut head).await {
            Ok(n) => n,
            Err(_) => return,
        };
        if seen == 0 || head[..seen].contains(&b'\n') {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    if head[..seen].starts_with(b"GET /ws") {
        link::run(stream, site).await;
    } else if let Err(e) = files::serve(stream, &site).await {
        eprintln!("给页面文件时出错：{e}");
    }
}
