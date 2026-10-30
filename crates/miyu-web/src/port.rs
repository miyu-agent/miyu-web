//! 听哪个端口（`web-ui.md`「怎么走」第一条第 1 款）：出厂端口被占往后挪几个；绑之前先看本机这个端口有没有人在听。

use std::net::{IpAddr, Ipv4Addr};
use std::time::Duration;

use tokio::net::TcpListener;

/// 出厂端口被占时往后试几个（2026-10-30 项目主人：固定端口配端口回退）：8300 被占试 8301 到 8309。
pub const FALLBACK_PORTS: u16 = 9;

/// 照先后要试的端口：`port` 本身；能回退的（`fallback`，`0` 不算）再接后面 [`FALLBACK_PORTS`] 个，到 65535 为止。
pub fn candidates(port: u16, fallback: bool) -> Vec<u16> {
    let more = match fallback && port != 0 {
        true => FALLBACK_PORTS,
        false => 0,
    };
    (0..=more)
        .filter_map(|step| port.checked_add(step))
        .collect()
}

/// 听端口：照 [`candidates`] 的先后，头一个空着、绑得上的；都被占的说第一个被占（人认得的那个），别的错照原话。
pub(crate) async fn bind(listen: IpAddr, port: u16, fallback: bool) -> Result<TcpListener, String> {
    for one in candidates(port, fallback) {
        if answered(one).await {
            continue;
        }
        match TcpListener::bind((listen, one)).await {
            Ok(listener) => {
                if one != port {
                    tracing::info!(target: crate::TARGET, wanted = port, port = one, "port in use, fell back");
                }
                return Ok(listener);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Err(format!("port {port} in use"))
}

/// 连本机这个端口最多等多久：有人接就算被占。连不上（没人听）的回环上马上被拒，平常不等。
const PROBE: Duration = Duration::from_millis(300);

/// 本机这个端口上已经有人在听：绑之前先连一下。macOS（照 BSD）让 `127.0.0.1:<端口>` 和别人的 `*:<端口>` 同时绑得上，
/// 绑得上不等于空着，新起的会把本机的连接接走、盖住原来那个（2026-10-31 桌面端撞见）；Linux 上这样绑不上。`0` 是随便挑，不查。
async fn answered(port: u16) -> bool {
    if port == 0 {
        return false;
    }
    matches!(
        tokio::time::timeout(
            PROBE,
            tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, port))
        )
        .await,
        Ok(Ok(_))
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 别人听着 `*:<端口>` 的时候，`127.0.0.1:<端口>` 算被占：Linux 本来就绑不上；macOS 绑得上，靠先连一下认出来（2026-10-31 桌面端）。
    #[tokio::test]
    async fn a_wildcard_listener_makes_the_port_taken() {
        let other = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
            .await
            .expect("绑得上随便一个端口");
        let port = other.local_addr().expect("有地址").port();
        let got = bind(IpAddr::V4(Ipv4Addr::LOCALHOST), port, false).await;
        assert_eq!(got.err(), Some(format!("port {port} in use")));
        assert!(answered(port).await, "有人接");
        drop(other);
        assert!(!answered(port).await, "没人听的马上被拒");
        assert!(!answered(0).await, "0 是随便挑，不查");
    }
}
