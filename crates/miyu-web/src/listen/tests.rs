//! `/listen` 的两样小事（`web-ui.md`「怎么走」第一条第 11 款）：别的设备打开用的网址怎么写；接连接的那一圈怎么换监听。

use super::*;

#[test]
fn lan_address_follows_what_is_listened_on() {
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
