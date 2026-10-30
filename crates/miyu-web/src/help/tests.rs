//! `miyu web` 的参数和帮助页（`web-ui.md`「怎么走」第二条第 1 款）：`-h` 在哪都是帮助；写错的说哪里不对、提示看帮助；帮助页照
//! 核心设计 47 写，`--ticket` 不进帮助。

use super::*;

fn args(list: &[&str]) -> Vec<String> {
    list.iter().map(|arg| (*arg).to_string()).collect()
}

#[test]
fn help_wins_over_everything_else() {
    assert_eq!(parse(&args(&["-h"])), Ok(Parsed::Help));
    assert_eq!(parse(&args(&["--print", "--help"])), Ok(Parsed::Help));
    assert_eq!(
        parse(&args(&["--bogus", "-h"])),
        Ok(Parsed::Help),
        "写错的也先印帮助"
    );
}

#[test]
fn reads_every_option() {
    let got = parse(&args(&[
        "--port",
        "8310",
        "--format",
        "json",
        "--ticket",
        "--logout",
        "--package",
        "notes",
    ]));
    let want = Open {
        port: Some(8310),
        json: true,
        ticket: true,
        logout: true,
        package: Some("notes".to_string()),
        ..Open::default()
    };
    assert_eq!(got, Ok(Parsed::Open(want)));
    assert_eq!(parse(&[]), Ok(Parsed::Open(Open::default())));
}

#[test]
fn says_what_is_wrong() {
    assert_eq!(
        parse(&args(&["--bogus"])),
        Err(Bad::Unknown("--bogus".into()))
    );
    assert_eq!(parse(&args(&["--port"])), Err(Bad::Missing("--port")));
    assert_eq!(
        parse(&args(&["--port", "x"])),
        Err(Bad::Value("--port", "x".into()))
    );
    assert_eq!(
        parse(&args(&["--format", "yaml"])),
        Err(Bad::Value("--format", "yaml".into()))
    );
    assert_eq!(
        parse(&args(&["--package", "a b"])),
        Err(Bad::Value("--package", "a b".into()))
    );
    assert_eq!(
        parse(&args(&["--ticket", "--reset"])),
        Err(Bad::TicketWithReset)
    );
}

#[test]
fn errors_follow_the_cli_wording() {
    let zh = bad("zh_CN.UTF-8", &Bad::Unknown("--bogus".into()));
    assert_eq!(
        zh,
        "miyu: 未知选项 '--bogus'\n提示：运行 'miyu web --help' 查看用法"
    );
    let en = bad("C", &Bad::Value("--format", "yaml".into()));
    assert_eq!(
        en,
        "miyu: invalid value 'yaml' for '--format'\nhint: run 'miyu web --help' for usage"
    );
    for one in [Bad::Missing("--port"), Bad::TicketWithReset] {
        for locale in ["zh_CN.UTF-8", "en_US.UTF-8"] {
            let said = bad(locale, &one);
            let first = said.lines().next().expect("有一行");
            assert!(first.starts_with("miyu: "), "{said}");
            assert!(
                !first.ends_with('。') && !first.ends_with('.'),
                "不带句号：{said}"
            );
        }
    }
}

#[test]
fn the_page_picks_the_language_and_leaves_out_ticket() {
    assert!(page("zh_CN.UTF-8").starts_with("用法：miyu web [选项]\n"));
    assert!(page("en_US.UTF-8").starts_with("Usage: miyu web [options]\n"));
    assert!(page("").starts_with("Usage:"), "没设语言的说英文");
    for locale in ["zh_CN.UTF-8", "C"] {
        let text = page(locale);
        assert!(text.ends_with('\n'));
        for option in [
            "--port",
            "--print",
            "--format",
            "--reset",
            "--logout",
            "--package",
            "--help",
        ] {
            assert!(text.contains(option), "{option} 在帮助里");
        }
        assert!(!text.contains("--ticket"), "--ticket 不写进帮助");
        assert!(
            !text.contains('她') && !text.contains("用户名"),
            "照命令行文案"
        );
    }
}
