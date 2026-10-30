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
