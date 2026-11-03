use super::*;

use hyper::header::HeaderValue;

/// 本机的三种写法，端口 8300。
fn hosts() -> [String; 3] {
    [
        "127.0.0.1:8300".to_string(),
        "localhost:8300".to_string(),
        "[::1]:8300".to_string(),
    ]
}

/// 照给的几行造请求头。
fn headers(lines: &[(&'static str, &'static str)]) -> HeaderMap {
    let mut map = HeaderMap::new();
    for (name, value) in lines {
        map.append(*name, HeaderValue::from_static(value));
    }
    map
}

/// 页面自己发的那一种：Host、Origin 一样，带自定义头。
const PAGE: [(&str, &str); 3] = [
    ("host", "127.0.0.1:8300"),
    ("origin", "http://127.0.0.1:8300"),
    ("x-miyu-local", "1"),
];

#[test]
fn the_page_itself_is_local_on_each_loopback_name() {
    assert!(local(&hosts(), &headers(&PAGE)));
    assert!(local(
        &hosts(),
        &headers(&[
            ("host", "localhost:8300"),
            ("origin", "http://localhost:8300"),
            ("x-miyu-local", "1"),
            ("content-type", "application/json"),
        ])
    ));
    assert!(local(
        &hosts(),
        &headers(&[
            ("host", "[::1]:8300"),
            ("origin", "http://[::1]:8300"),
            ("x-miyu-local", "1"),
        ])
    ));
}

#[test]
fn anything_else_is_not() {
    let without = |name: &str| -> Vec<(&'static str, &'static str)> {
        PAGE.iter()
            .copied()
            .filter(|(key, _)| *key != name)
            .collect()
    };
    let with = |extra: (&'static str, &'static str)| -> Vec<(&'static str, &'static str)> {
        let mut lines: Vec<_> = PAGE
            .iter()
            .copied()
            .filter(|(key, _)| *key != extra.0)
            .collect();
        lines.push(extra);
        lines
    };
    assert!(!local(&hosts(), &headers(&without("host"))), "没有 Host");
    assert!(
        !local(&hosts(), &headers(&without("origin"))),
        "没有 Origin"
    );
    assert!(
        !local(&hosts(), &headers(&without("x-miyu-local"))),
        "没有自定义头"
    );
    assert!(!local(&hosts(), &headers(&with(("x-miyu-local", "yes")))));
    assert!(!local(
        &hosts(),
        &headers(&with(("origin", "http://evil.example")))
    ));
    assert!(!local(&hosts(), &headers(&with(("origin", "null")))));
    assert!(!local(
        &hosts(),
        &headers(&with(("origin", "https://127.0.0.1:8300")))
    ));
    assert!(
        !local(
            &hosts(),
            &headers(&with(("origin", "http://localhost:8300")))
        ),
        "和 Host 不是逐字一样"
    );
    for host in ["evil.example:8300", "192.168.1.20:8300", "127.0.0.1:9999"] {
        let mut map = headers(&[("x-miyu-local", "1")]);
        map.insert("host", HeaderValue::from_str(host).expect("写得成头"));
        let origin = format!("http://{host}");
        map.insert("origin", HeaderValue::from_str(&origin).expect("写得成头"));
        assert!(!local(&hosts(), &map), "Host 只认本机的三种写法：{host}");
    }
    for form in [
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
        "Text/Plain;charset=UTF-8",
    ] {
        let mut map = headers(&PAGE);
        map.insert("content-type", HeaderValue::from_static(form));
        assert!(!local(&hosts(), &map), "表单的正文：{form}");
    }
}
