//! `/listen` 的两样小事（`web-ui.md`「怎么走」第一条第 11 款）：别的设备打开用的网址怎么写；接连接的那一圈怎么换监听。

use super::*;

#[test]
fn lan_address_follows_what_is_listened_on() {
    let lan = |listen: IpAddr, port: u16| {
        lans(listen, port, false)
            .into_iter()
            .next()
            .map(|lan| lan.url)
    };
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

/// 听 `0.0.0.0` 的照网卡全列（2026-11-10 项目主人：全部列出、不分先后，组网、代理的虚拟网卡也列，带网卡名）：照网卡的先后；回环、链路本地不列；
/// 同一个地址只列一次；读不到网卡的照往外的那个，不知道网卡名；听 `::` 的列 IPv6。
#[test]
fn the_lan_addresses_list_every_card_in_order_with_its_name() {
    let ip = |s: &str| -> IpAddr { s.parse().expect("是地址") };
    let cards = |list: &[(&str, &str)]| -> Vec<(String, IpAddr)> {
        list.iter().map(|(n, a)| ((*n).to_owned(), ip(a))).collect()
    };
    let named = |list: &[(&str, &str)]| -> Vec<(Option<String>, IpAddr)> {
        list.iter()
            .map(|(n, a)| (Some((*n).to_owned()), ip(a)))
            .collect()
    };
    let (v4, v6) = (ip("0.0.0.0"), ip("::"));
    let mac = cards(&[
        ("lo0", "127.0.0.1"),
        ("utun4", "198.18.5.1"),
        ("en0", "10.20.30.12"),
        ("utun5", "100.64.1.2"),
        ("bridge100", "169.254.3.1"),
        ("en0", "fe80::1"),
        ("en0", "10.20.30.12"),
    ]);
    assert_eq!(
        pick(&mac, &[ip("198.18.5.3")], &[v4]),
        named(&[
            ("utun4", "198.18.5.1"),
            ("en0", "10.20.30.12"),
            ("utun5", "100.64.1.2")
        ])
    );
    assert_eq!(
        pick(&[], &[ip("192.168.7.3")], &[v4]),
        vec![(None, ip("192.168.7.3"))]
    );
    assert_eq!(pick(&[], &[ip("169.254.0.3")], &[v4]), Vec::new());
    let six = cards(&[
        ("en0", "fe80::1"),
        ("en0", "2001:db8::5"),
        ("tailscale0", "fd7a::5"),
    ]);
    assert_eq!(
        pick(&six, &[], &[v6]),
        named(&[("en0", "2001:db8::5"), ("tailscale0", "fd7a::5")])
    );
    // 听 `::` 的套接字双栈（审计 #078 第 2 点）：IPv4 的也列、排在前面，各族里照网卡的先后；只收 IPv6 的不列 IPv4
    let both = cards(&[
        ("en0", "2001:db8::5"),
        ("en0", "192.168.1.5"),
        ("tailscale0", "fd7a::5"),
        ("tailscale0", "100.64.0.7"),
    ]);
    assert_eq!(
        pick(&both, &[], &[v4, v6]),
        named(&[
            ("en0", "192.168.1.5"),
            ("tailscale0", "100.64.0.7"),
            ("en0", "2001:db8::5"),
            ("tailscale0", "fd7a::5")
        ])
    );
    assert_eq!(
        pick(&both, &[], &[v6]),
        named(&[("en0", "2001:db8::5"), ("tailscale0", "fd7a::5")])
    );
    // 读不到网卡的：往外的两族各一个，IPv4 在前
    assert_eq!(
        pick(&[], &[ip("2001:db8::9"), ip("192.168.7.3")], &[v4, v6]),
        vec![(None, ip("192.168.7.3")), (None, ip("2001:db8::9"))]
    );
}

/// 双栈照套接字实际的 `IPV6_V6ONLY` 读（审计 #078 第 2 点）：同是听 `::`，只收 IPv6 的不是、也收 IPv4 的是；听 IPv4 的不是。
#[tokio::test]
async fn dual_stack_follows_the_socket_not_the_system() {
    let any = |only: bool| -> Option<TcpListener> {
        let socket =
            socket2::Socket::new(socket2::Domain::IPV6, socket2::Type::STREAM, None).ok()?;
        socket.set_only_v6(only).ok()?;
        socket
            .bind(&SocketAddr::from((Ipv6Addr::UNSPECIFIED, 0)).into())
            .ok()?;
        socket.listen(8).ok()?;
        socket.set_nonblocking(true).ok()?;
        TcpListener::from_std(socket.into()).ok()
    };
    let (Some(six), Some(both)) = (any(true), any(false)) else {
        eprintln!("这台机器听不了 ::，跳过");
        return;
    };
    assert!(!dual_stack(&six), "只收 IPv6 的");
    assert!(dual_stack(&both), "也收 IPv4 的");
    let four = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .expect("听得上");
    assert!(!dual_stack(&four), "听 IPv4 的");
}

#[tokio::test]
async fn same_port_new_address_rebinds_in_place() {
    // 换到这台机器的局域网地址（不开 0.0.0.0：测试只露这一个口子）；没有的跳过
    let Some(lan) = outward(IpAddr::V4(Ipv4Addr::UNSPECIFIED)) else {
        eprintln!("这台机器没有局域网地址，跳过");
        return;
    };
    let first = outside_ephemeral().await;
    let port = first.local_addr().expect("有地址").port();
    let (kept, done) = swap(first, lan, None).await;
    assert_eq!(done, Ok(()));
    let at = kept.expect("接着听").local_addr().expect("有地址");
    assert_eq!(at, SocketAddr::new(lan, port), "端口不变、换了地址");
}

/// 在回环上听一个系统临时端口段以外的端口（20000–29999，从进程号错开起点）。
///
/// 让系统挑（端口 0）会落进临时端口段（Windows 是 49152–65535），同一时刻并行的测试往外连时也从这一段拿端口、绑在通配地址上；
/// 撞上同一个号，再在局域网地址上绑这个端口，Windows 就报占用（2026-11-19 CI 撞见过一次：`port 62622 in use`）。
async fn outside_ephemeral() -> TcpListener {
    let start = std::process::id() % 10_000;
    for step in 0..10_000 {
        let port = 20_000 + u16::try_from((start + step) % 10_000).expect("不到一万");
        if let Ok(listener) = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await {
            return listener;
        }
    }
    panic!("20000–29999 都被占了");
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
