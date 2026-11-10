//! `/listen`（`web-ui.md`「怎么走」第一条第 11 款，2026-10-30 项目主人：网页默认只给本机，设置页一个开关放开到局域网、能填监听地址和
//! 端口；网页软件开着就不空闲退出，等它重启才生效等于不生效）：
//!
//! - `GET`：在听的地址、端口，别的设备打开用的网址（`lan`，几块网卡都能开的全列在 `lans`，[`lans`]）。
//! - `POST`：带设备令牌（同 `/media`），拿它连核心读 `web.listen`、`web.port`（不替请求出示本机令牌），和在听的不一样就请接连接的那一圈
//!   换监听（[`Swap`]，[`swap`] 照它换）。已经连着的不断；别的机器来的、新地址不再包含它连进来的地址的（关了局域网）例外：WebSocket
//!   关掉，再来的请求 403（2026-11-02 第四轮审查 W4-2，`serve`）。

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, UdpSocket};
use std::sync::Arc;

use hyper::body::Incoming;
use hyper::header::{self, HeaderValue};
use hyper::{Method, Request, Response, StatusCode};
use serde_json::{Value, json};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot};

use crate::TARGET;
use crate::serve::{Body, Site, bind, empty, full};

/// 请接连接的那一圈换监听：地址换成 `listen`；`port` 是要换的端口和被占了能不能往后挪（空的不换端口）。换完照 `done` 回话。
pub(crate) struct Swap {
    pub(crate) listen: IpAddr,
    pub(crate) port: Option<(u16, bool)>,
    pub(crate) done: oneshot::Sender<Result<(), String>>,
}

/// 往接连接的那一圈递 [`Swap`] 的口子。
pub(crate) type Swaps = mpsc::Sender<Swap>;

/// 一个 `/listen` 请求。`POST` 只给这台电脑上来的（`remote` 是空的）：它替请求连核心用的是另一条连法，不说远程（第二轮审查 W2-1）；
/// 局域网上的页面照样改配置，网页软件自己跟着配置换（`follow`），用不着它。
pub(crate) async fn handle(
    request: Request<Incoming>,
    site: Arc<Site>,
    remote: Option<std::net::IpAddr>,
) -> Response<Body> {
    match *request.method() {
        Method::GET | Method::HEAD => answer(&site, None),
        Method::POST if remote.is_some() => empty(StatusCode::FORBIDDEN),
        Method::POST => {
            let Some(login) = crate::media::bearer(&request) else {
                return empty(StatusCode::UNAUTHORIZED);
            };
            match relisten(&site, &login).await {
                Err(Refusal::Login) => empty(StatusCode::UNAUTHORIZED),
                Err(Refusal::Said(error)) => answer(&site, Some(error)),
                Ok(()) => answer(&site, None),
            }
        }
        _ => empty(StatusCode::METHOD_NOT_ALLOWED),
    }
}

/// 换不了的为什么。
enum Refusal {
    /// 设备令牌不认。
    Login,
    /// 别的：写进回应的 `error`。
    Said(String),
}

/// 照核心的配置换：读 `web.listen`、`web.port`，算出要不要换、换成什么，递给接连接的那一圈等它换完。
async fn relisten(site: &Arc<Site>, login: &str) -> Result<(), Refusal> {
    let mut core = miyu_client::open::Core::connect_login(&site.root, login, "miyu-web")
        .await
        .map_err(|refused| match refused.reason.as_str() {
            "bad_login" => Refusal::Login,
            _ => Refusal::Said(refused.message),
        })?;
    let got = core
        .call(
            "listen",
            "config.get",
            json!({"keys": ["web.listen", "web.port"]}),
        )
        .await
        .map_err(|refused| Refusal::Said(refused.message))?;
    apply(site, &got["items"]).await.map_err(Refusal::Said)
}

/// 照核心交回的配置（`config.get` 的 `items`）换监听：`web.listen`、`web.port` 和在听的不一样就递给接连接的那一圈，等它换完。没有这一项的
/// （网页包没装、旧核心）不动那一样；地址写得不对的当回环。`POST /listen`、跟着推送（[`crate::follow`]）都走这里。
///
/// # Errors
///
/// 换不了（听不上、端口被占）、网页软件在停：交回原因。
pub(crate) async fn apply(site: &Arc<Site>, items: &Value) -> Result<(), String> {
    let now = miyu_webserve::Site::listen(site.as_ref());
    let listen = match items.get("web.listen") {
        Some(item) => item["value"]
            .as_str()
            .and_then(|text| text.trim().parse::<IpAddr>().ok())
            .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST)),
        None => now,
    };
    let configured = items["web.port"]["value"]
        .as_i64()
        .and_then(|port| u16::try_from(port).ok());
    let chosen = items["web.port"]["origin"]["layer"]
        .as_str()
        .is_some_and(|layer| layer != "default");
    let port = site.port_for(configured).map(|port| (port, !chosen));
    if listen == now && port.is_none() {
        return Ok(());
    }
    let (done, heard) = oneshot::channel();
    site.swaps
        .send(Swap { listen, port, done })
        .await
        .map_err(|_| "stopping".to_string())?;
    heard.await.map_err(|_| "stopping".to_string())??;
    if let Some(port) = configured.filter(|_| port.is_some()) {
        site.wanted(port);
    }
    Ok(())
}

/// 接连接的那一圈换监听：`current` 是在听的。端口不变的先放掉旧的再听新的（同一个端口两个地址会冲突），新的听不上再听回旧的；端口变了的
/// 先听新的、听上了再放掉旧的。交回接着听的那一个（再听回旧的也不行的是空的：没得听了）和换没换成。
pub(crate) async fn swap(
    current: TcpListener,
    listen: IpAddr,
    port: Option<(u16, bool)>,
) -> (Option<TcpListener>, Result<(), String>) {
    let was = match current.local_addr() {
        Ok(was) => was,
        Err(error) => return (Some(current), Err(error.to_string())),
    };
    if let Some((port, fallback)) = port.filter(|(port, _)| *port != was.port()) {
        return match bind(listen, port, fallback).await {
            Ok(fresh) => (Some(fresh), Ok(())),
            Err(error) => (Some(current), Err(error)),
        };
    }
    drop(current);
    match bind(listen, was.port(), false).await {
        Ok(fresh) => (Some(fresh), Ok(())),
        Err(error) => {
            let back = bind(was.ip(), was.port(), false).await.ok();
            if back.is_none() {
                tracing::error!(target: TARGET, port = was.port(), "listener lost");
            }
            (back, Err(error))
        }
    }
}

/// 回应：在听的地址、端口、别的设备打开用的网址；换不了的多一个 `error`。
fn answer(site: &Site, error: Option<String>) -> Response<Body> {
    let listen = miyu_webserve::Site::listen(site);
    let port = miyu_webserve::Site::port(site);
    let all = lans(listen, port);
    let mut body =
        json!({"listen": listen.to_string(), "port": port, "lan": all.first(), "lans": all});
    if let Some(error) = error {
        body["error"] = Value::String(error);
    }
    let mut response = Response::new(full(body.to_string()));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    crate::serve::secure(headers);
    response
}

/// 别的设备打开用的网址，好用的在前：听回环的没有；听某一个地址的就是它；听 `0.0.0.0`、`::` 的照这台电脑的网卡挑（[`pick`]），
/// 读不到网卡的照往外的那个地址（[`outward`]）。
pub(crate) fn lans(listen: IpAddr, port: u16) -> Vec<String> {
    let ips = match listen {
        ip if ip.is_loopback() => Vec::new(),
        ip if ip.is_unspecified() => {
            let cards: Vec<(String, IpAddr)> = if_addrs::get_if_addrs()
                .map(|all| {
                    all.into_iter()
                        .map(|card| (card.name.clone(), card.ip()))
                        .collect()
                })
                .unwrap_or_default();
            pick(&cards, outward(ip), ip.is_ipv6())
        }
        ip => vec![ip],
    };
    ips.into_iter()
        .map(|ip| format!("http://{}", SocketAddr::new(ip, port)))
        .collect()
}

/// 从网卡里挑别的设备连得进来的地址（2026-11-10 项目主人：Mac 上开着代理的 TUN 网卡，显示的是 198.18 开头的虚拟地址，局域网里的设备打不开；
/// 原来只照往外的那个地址，默认路由在哪块网卡上就是哪块）：同一族（听 `::` 的挑 IPv6）；不要回环、链路本地；不要代理、VPN、虚拟机、容器的
/// 虚拟网卡（照名字认，[`virtual_card`]），也不要它们常用的网段（`198.18.0.0/15` 代理的假地址、`100.64.0.0/10` Tailscale 这类）。
/// 私有网段在前（`192.168`、`10`、`172.16`），往外的那个地址在挑出来的里面的排在同一档最前，别的照网卡的先后；一个地址只列一次。
/// 都挑没了、往外的那个地址又不是虚拟网段的，就交它。
fn pick(cards: &[(String, IpAddr)], outward: Option<IpAddr>, v6: bool) -> Vec<IpAddr> {
    let mut got: Vec<IpAddr> = Vec::new();
    for (name, ip) in cards {
        if ip.is_ipv6() == v6 && usable(*ip) && !virtual_card(name) && !got.contains(ip) {
            got.push(*ip);
        }
    }
    // 先后照档；同一档里往外的那个排最前，别的照原来的先后（稳定排序）
    got.sort_by_key(|ip| (rank(*ip), Some(*ip) != outward));
    if got.is_empty()
        && let Some(ip) = outward.filter(|ip| ip.is_ipv6() == v6 && usable(*ip))
    {
        got.push(ip);
    }
    got
}

/// 别的设备连得进来：不是回环、没指定、链路本地，也不是代理、VPN 常用的那两段。
fn usable(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            !(v4.is_loopback()
                || v4.is_unspecified()
                || v4.is_link_local()
                || (a == 198 && (b & 0xfe) == 18)
                || (a == 100 && (b & 0xc0) == 64))
        }
        IpAddr::V6(v6) => {
            !(v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xffc0) == 0xfe80)
        }
    }
}

/// 网卡的档：私有网段在前。
fn rank(ip: IpAddr) -> u8 {
    match ip {
        IpAddr::V4(v4) => match v4.octets() {
            [192, 168, ..] => 0,
            [10, ..] => 1,
            [172, b, ..] if (b & 0xf0) == 16 => 2,
            _ => 3,
        },
        // 唯一本地地址（`fc00::/7`）在前
        IpAddr::V6(v6) => u8::from((v6.segments()[0] & 0xfe00) != 0xfc00),
    }
}

/// 照名字认的虚拟网卡：代理、VPN 的隧道（`utun`、`tun`、`tap`、`wg`、Tailscale、ZeroTier），容器、虚拟机的网桥（Docker、libvirt、
/// VirtualBox、VMware、Hyper-V 的 `vEthernet`），macOS 的 AirDrop 那几块（`awdl`、`llw`）。
fn virtual_card(name: &str) -> bool {
    const SIGNS: [&str; 20] = [
        "utun",
        "tun",
        "tap",
        "wg",
        "tailscale",
        "zt",
        "docker",
        "br-",
        "veth",
        "virbr",
        "vboxnet",
        "vmnet",
        "vethernet",
        "awdl",
        "llw",
        "bridge",
        "lxc",
        "lxd",
        "podman",
        "cni",
    ];
    let name = name.to_ascii_lowercase();
    SIGNS.iter().any(|sign| name.starts_with(sign))
        || name.contains("clash")
        || name.contains("meta")
        || name.contains("vpn")
}

/// 这台电脑往外的那个地址：UDP 套接字 `connect` 一个文档地址（`192.0.2.1`、`2001:db8::1`），不发包，读本地地址；拿不到的、是回环的、
/// 没指定的是空的。
fn outward(family: IpAddr) -> Option<IpAddr> {
    let (any, far): (IpAddr, IpAddr) = match family {
        IpAddr::V4(_) => (
            Ipv4Addr::UNSPECIFIED.into(),
            Ipv4Addr::new(192, 0, 2, 1).into(),
        ),
        IpAddr::V6(_) => (
            Ipv6Addr::UNSPECIFIED.into(),
            Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1).into(),
        ),
    };
    let socket = UdpSocket::bind((any, 0)).ok()?;
    socket.connect((far, 9)).ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

#[cfg(test)]
mod tests;
