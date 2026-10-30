//! `miyu-web open` 给程序读的两个开关（`web-ui.md`「怎么走」第二条第 6 款，2026-10-29 桌面端的外壳要的）：`--format json` 只印一行
//! `{url, first}`、不开浏览器不印提醒；没设过访问密码也给交接票（`--ticket` 写不写一样，2026-10-30），`--reset` 的带一次性码。核心是替身，替身和走一遍的办法借 `open`。

use serde_json::{Value, json};

use crate::open::{CODE, TICKET, answer, browser, run_open};
use crate::support::*;
use miyu_web::open::Open;

/// 照 `args` 走一遍：退出码是 0、标准错误是空的、浏览器没开，交回那一行 JSON 和网址的开头。
async fn one_line(home: &Home, args: Open) -> (Value, String) {
    let browser = browser(true);
    let (code, out, err) = run_open(home, args, &browser).await;
    assert_eq!(code, 0, "{err}");
    assert!(err.is_empty(), "不印提醒：{err}");
    assert_eq!(out.lines().count(), 1, "{out}");
    assert!(
        browser.opened.lock().expect("没坏").is_empty(),
        "不开浏览器"
    );
    let site = miyu_web::serve::address(&home.root).expect("有地址");
    (
        serde_json::from_str(out.trim_end()).expect("一行 JSON"),
        site,
    )
}

#[tokio::test]
async fn format_json_prints_one_line_with_the_address_and_whether_it_is_the_first_time() {
    let home = Home::new();
    answer(fake_core(&home), true);
    let json = Open {
        port: Some(0),
        json: true,
        ..Open::default()
    };
    let (got, site) = one_line(&home, json).await;
    assert_eq!(
        got,
        json!({"url": format!("{site}/#ticket={TICKET}"), "first": true}),
        "没设过密码也给票，first 照实"
    );
    let reset = Open {
        json: true,
        reset: true,
        ..Open::default()
    };
    let (got, site) = one_line(&home, reset).await;
    assert_eq!(
        got,
        json!({"url": format!("{site}/#setup={CODE}"), "first": true})
    );
}

#[tokio::test]
async fn ticket_asks_for_a_ticket_even_before_a_password_is_set() {
    let home = Home::new();
    answer(fake_core(&home), true);
    let args = Open {
        port: Some(0),
        json: true,
        ticket: true,
        ..Open::default()
    };
    let (got, site) = one_line(&home, args).await;
    assert_eq!(
        got,
        json!({"url": format!("{site}/#ticket={TICKET}"), "first": true}),
        "没设过密码也给票，first 照实"
    );
}
