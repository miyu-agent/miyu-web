//! 拆查询串（`web-ui.md`「怎么走」第五条）：页面照 `URLSearchParams` 写，空格是 `+`、中文是 `%xx`。

use super::*;

#[test]
fn the_query_is_read_like_url_search_params_writes_it() {
    let got = query(
        "path=%7E%2F.miyu%2Fskills&title=%E9%80%89%E6%8B%A9+%E6%96%87%E4%BB%B6%E5%A4%B9&start=",
    );
    assert_eq!(got.get("path").map(String::as_str), Some("~/.miyu/skills"));
    assert_eq!(got.get("title").map(String::as_str), Some("选择 文件夹"));
    assert_eq!(got.get("start").map(String::as_str), Some(""));
    assert!(!query("path=%FF%FE").contains_key("path"), "解不开的不要");
}

#[test]
fn locate_reads_the_file_and_every_place_to_look_first() {
    let text = "name=%E5%BD%95%E5%83%8F+01.mp4&size=4096&modified=1794378736422&near=%2Fhome%2Fa%2Fwork&near=%2Ftmp%2Fb&near=";
    let got = wanted(&query(text));
    assert_eq!(got.name, "录像 01.mp4");
    assert_eq!(
        (got.size, got.modified_ms),
        (Some(4096), Some(1_794_378_736_422))
    );
    let places: Vec<String> = near(text)
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    assert_eq!(places, ["/home/a/work", "/tmp/b"], "空的不要");
    // 没写、写得不是数的不比。
    let loose = wanted(&query("name=a.txt&size=big"));
    assert_eq!((loose.size, loose.modified_ms), (None, None));
    assert!(!loose.exact && wanted(&query("name=a.txt&exact=1")).exact);
    assert!(PATHS.contains(&"/locate"));
    assert_eq!(wait(&query("name=a")), miyu_desk::locate::LIMIT);
    assert_eq!(wait(&query("wait=10000")).as_millis(), 10_000);
}
