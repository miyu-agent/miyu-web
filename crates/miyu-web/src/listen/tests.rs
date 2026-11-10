//! `/listen` 的两样小事（`web-ui.md`「怎么走」第一条第 11 款）：别的设备打开用的网址怎么写；接连接的那一圈怎么换监听。

use super::*;

#[test]
fn lan_address_follows_what_is_listened_on() {
    let lan = |listen: IpAddr, port: u16| lans(listen, port).into_iter().next();
    assert_eq!(
        lan(IpAddr::V4(Ipv4Addr::LOCALHOST), 8300),
        None,
        "回环的没有"
    );
    assert_eq!(lan(IpAddr::V6(Ipv6Addr::LOCALHOST), 8300), None);
    assert_eq!(
        lan("192.168.1.5".parse().expect("是地址"), 8300).as_deref(),
        Some("http://192.168.1.5:8300"),
        "听某一个地址的就是它"
    );
    assert_eq!(
        lan("fe80::1".parse().expect("是地址"), 8301).as_deref(),
        Some("http://[fe80::1]:8301"),
        "IPv6 加方括号"
    );
    // 听 0.0.0.0 的照往外的那个地址：没有网的机器上拿不到，有的话不是回环、不是没指定
    if let Some(url) = lan(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 8300) {
        assert!(
            url.starts_with("http://") && url.ends_with(":8300"),
            "{url}"
        );
        assert!(!url.contains("0.0.0.0") && !url.contains("127."), "{url}");
    }
}

/// 听 `0.0.0.0` 的照网卡挑：代理的 TUN 网卡（Mac 上 Clash 的 `utun` 带 198.18 的假地址，2026-11-10 项目主人撞见）、Tailscale 的 100.64
/// 网段、Docker 网桥都不要；私有网段在前，往外的那个在同一档最前；挑没了的照往外的那个，它也是虚拟网段的就什么都不给。
#[test]
fn the_lan_address_skips_tunnels_and_puts_private_cards_first() {
    let ip = |s: &str| -> IpAddr { s.parse().expect("是地址") };
    let cards = |list: &[(&str, &str)]| -> Vec<(String, IpAddr)> {
        list.iter().map(|(n, a)| ((*n).to_owned(), ip(a))).collect()
    };
    let mac = cards(&[
        ("lo0", "127.0.0.1"),
        ("utun4", "198.18.0.1"),
        ("en0", "192.168.0.3"),
        ("utun5", "100.101.1.2"),
        ("bridge100", "192.168.64.1"),
        ("en7", "10.0.0.8"),
        ("en0", "fe80::1"),
    ]);
    // 默认路由在 TUN 上：往外的那个是 198.18.0.3
    assert_eq!(
        pick(&mac, Some(ip("198.18.0.3")), false),
        vec![ip("192.168.0.3"), ip("10.0.0.8")]
    );
    // 往外的那个是第二块实体网卡：同一档里它排前面
    let two = cards(&[("eth0", "192.168.1.9"), ("wlan0", "192.168.0.3")]);
    assert_eq!(
        pick(&two, Some(ip("192.168.0.3")), false),
        vec![ip("192.168.0.3"), ip("192.168.1.9")]
    );
    // Linux 上的容器、虚拟机、WireGuard、Tailscale 网卡
    let linux = cards(&[
        ("docker0", "172.17.0.1"),
        ("virbr0", "192.168.122.1"),
        ("wg0", "10.8.0.2"),
        ("tailscale0", "100.64.0.5"),
        ("enp5s0", "172.20.1.4"),
    ]);
    assert_eq!(pick(&linux, None, false), vec![ip("172.20.1.4")]);
    // 读不到网卡的照往外的那个；它也是代理的假地址的不给
    assert_eq!(
        pick(&[], Some(ip("192.168.0.3")), false),
        vec![ip("192.168.0.3")]
    );
    assert_eq!(
        pick(&[], Some(ip("198.19.2.1")), false),
        Vec::<IpAddr>::new()
    );
    // 听 `::` 的挑 IPv6：链路本地不要，唯一本地在前
    let six = cards(&[
        ("en0", "fe80::1"),
        ("en0", "2001:db8::5"),
        ("en0", "fd00::5"),
    ]);
    assert_eq!(
        pick(&six, None, true),
        vec![ip("fd00::5"), ip("2001:db8::5")]
    );
    // 同一个地址只列一次
    let twice = cards(&[("en0", "192.168.0.3"), ("en0", "192.168.0.3")]);
    assert_eq!(pick(&twice, None, false), vec![ip("192.168.0.3")]);
}

#[tokio::test]
async fn same_port_new_address_rebinds_in_place() {
    // 换到这台机器的局域网地址（不开 0.0.0.0：测试只露这一个口子）；没有的跳过
    let Some(lan) = outward(IpAddr::V4(Ipv4Addr::UNSPECIFIED)) else {
        eprintln!("这台机器没有局域网地址，跳过");
        return;
    };
    let first = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .expect("听得上");
    let port = first.local_addr().expect("有地址").port();
    let (kept, done) = swap(first, lan, None).await;
    assert_eq!(done, Ok(()));
    let at = kept.expect("接着听").local_addr().expect("有地址");
    assert_eq!(at, SocketAddr::new(lan, port), "端口不变、换了地址");
}

#[tokio::test]
async fn a_new_port_binds_first_and_a_taken_one_keeps_the_old() {
    let first = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .expect("听得上");
    let old = first.local_addr().expect("有地址").port();
    let taken = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .expect("听得上");
    let busy = taken.local_addr().expect("有地址").port();
    let (kept, done) = swap(first, IpAddr::V4(Ipv4Addr::LOCALHOST), Some((busy, false))).await;
    assert_eq!(done, Err(format!("port {busy} in use")));
    let kept = kept.expect("接着听原来的");
    assert_eq!(kept.local_addr().expect("有地址").port(), old);
    let free = {
        let probe = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("听得上");
        probe.local_addr().expect("有地址").port()
    };
    let (kept, done) = swap(kept, IpAddr::V4(Ipv4Addr::LOCALHOST), Some((free, false))).await;
    assert_eq!(done, Ok(()));
    assert_eq!(
        kept.expect("听着").local_addr().expect("有地址").port(),
        free
    );
    assert!(
        tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, old))
            .await
            .is_err(),
        "旧端口放掉了"
    );
}
