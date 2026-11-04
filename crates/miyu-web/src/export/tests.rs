//! 导出原始包的几样纯的（W-1098）：子目录名字认不认、存下来叫什么、`Content-Disposition` 怎么写、Origin 和 Host 逐字一样。

use hyper::header::{self, HeaderMap, HeaderValue};

use super::clean::pid_of;
use super::{disposition, file_name, same_origin};

#[test]
fn only_prefix_and_digits_are_ours() {
    assert_eq!(pid_of("miyu-webui-1234"), Some(1234));
    assert_eq!(pid_of("miyu-webui-"), None);
    assert_eq!(pid_of("miyu-webui-12a"), None);
    assert_eq!(pid_of("miyu-webui--1"), None);
    assert_eq!(pid_of("miyu-web-1234"), None);
    assert_eq!(pid_of("xmiyu-webui-1234"), None);
    // 超出进程号的范围的不认
    assert_eq!(pid_of("miyu-webui-99999999999"), None);
}

#[test]
fn the_saved_name_is_the_last_part_with_zip() {
    let id = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    assert_eq!(file_name(Some("修 bug"), id), "修 bug.zip");
    assert_eq!(file_name(Some("a/b\\c"), id), "c.zip");
    assert_eq!(file_name(Some("  x\u{7}y  "), id), "xy.zip");
    assert_eq!(file_name(Some("已经.ZIP"), id), "已经.ZIP");
    assert_eq!(file_name(Some("   "), id), format!("miyu-{id}.zip"));
    assert_eq!(file_name(Some(".."), id), format!("miyu-{id}.zip"));
    assert_eq!(file_name(None, id), format!("miyu-{id}.zip"));
    let long = "字".repeat(300);
    assert_eq!(file_name(Some(&long), id).chars().count(), 120 + 4);
}

#[test]
fn disposition_has_a_plain_name_and_the_real_one() {
    assert_eq!(
        disposition("修 bug.zip"),
        "attachment; filename=\"_ bug.zip\"; filename*=UTF-8''%E4%BF%AE%20bug.zip"
    );
    assert_eq!(
        disposition("a\"b%c\\d.zip"),
        "attachment; filename=\"a_b_c_d.zip\"; filename*=UTF-8''a%22b%25c%5Cd.zip"
    );
}

#[test]
fn origin_must_be_the_same_as_host() {
    let headers = |host: &str, origin: Option<&str>| {
        let mut map = HeaderMap::new();
        map.insert(header::HOST, HeaderValue::from_str(host).expect("写得成"));
        if let Some(origin) = origin {
            map.insert(
                header::ORIGIN,
                HeaderValue::from_str(origin).expect("写得成"),
            );
        }
        map
    };
    assert!(same_origin(&headers(
        "127.0.0.1:8300",
        Some("http://127.0.0.1:8300")
    )));
    assert!(same_origin(&headers(
        "192.168.1.5:8300",
        Some("http://192.168.1.5:8300")
    )));
    assert!(!same_origin(&headers("127.0.0.1:8300", None)));
    assert!(!same_origin(&headers("127.0.0.1:8300", Some("null"))));
    assert!(!same_origin(&headers(
        "127.0.0.1:8300",
        Some("http://evil.example")
    )));
    assert!(!same_origin(&headers(
        "127.0.0.1:8300",
        Some("http://localhost:8300")
    )));
    assert!(!same_origin(&headers(
        "127.0.0.1:8300",
        Some("https://127.0.0.1:8300")
    )));
}
