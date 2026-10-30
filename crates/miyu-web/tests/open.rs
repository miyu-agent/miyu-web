//! `miyu-web open`（施工 W-9，`web-module.md`「怎么走」第十一条）：网页软件没在跑先拉起来（真的 `miyu-web serve`）；
//! `--reset` 的网址带 `#setup=<一次性码>`，别的（没设过密码的也是，2026-10-30）带交接票 `#ticket=<票>`（网页-乙；SU-1 起不带账号，回应里带了也不用）、旧核心要不到票的什么都不带；
//! `--package` 的再带 `package=<编号>`（施工 F-6 下）；带凭据的交给浏览器的是只给本人的跳转页；`--print` 印网址和提醒；交不给浏览器的照
//! `--print` 办；`--logout` 说作废了几个。核心是替身：照方法名答。

use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::support::*;
use miyu_ipc::Listener;
use miyu_web::open::{Browser, Launch, Open, open};

pub(crate) const CODE: &str = "9f03b21c9f03b21c9f03b21c9f03b21c9f03b21c9f03b21c9f03b21c9f03b21c";
pub(crate) const TICKET: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/// 核心的替身：一条条连接接着，`hello` 回中文，`account.setup_code` 照 `first` 回，`login.ticket` 照 `ticket` 回（旧核心没有这个
/// 方法的回空的），`account.logout` 写了 `all` 的回作废了 3 个。
pub(crate) fn answer(core: Listener, first: bool) {
    answer_with(core, first, true);
}

fn answer_with(mut core: Listener, first: bool, ticket: bool) {
    tokio::spawn(async move {
        while let Ok(connection) = core.accept().await {
            tokio::spawn(async move {
                let (read, mut write) = tokio::io::split(connection);
                let mut lines = BufReader::new(read);
                let mut line = String::new();
                while lines.read_line(&mut line).await.is_ok_and(|read| read > 0) {
                    let request: Value = serde_json::from_str(&line).expect("是 JSON");
                    let result = match request["method"].as_str() {
                        Some("hello") => {
                            json!({"account": "admin", "language": "zh", "protocol": 1})
                        }
                        Some("account.setup_code") => {
                            json!({"code": CODE, "expires": "2026-10-04T00:05:00.000Z", "first": first})
                        }
                        Some("login.ticket") if ticket => {
                            // 回应里带的账号（SU-1 以前的核心）不用
                            json!({"ticket": TICKET, "expires": "2026-10-28T00:01:00.000Z", "account": "小 明"})
                        }
                        // 只有 `all` 的作废全部；本机令牌的连接不写 `all` 真核心会拒。
                        Some("account.logout") if request["params"]["all"] == json!(true) => {
                            json!({"revoked": 3})
                        }
                        Some("account.logout") => json!({"revoked": 0}),
                        _ => json!({}),
                    };
                    let reply = json!({"jsonrpc": "2.0", "id": request["id"], "result": result});
                    if write
                        .write_all(format!("{reply}\n").as_bytes())
                        .await
                        .is_err()
                    {
                        return;
                    }
                    line.clear();
                }
            });
        }
    });
}

/// 记下交给它的网址；`works` 是假的就当交不出去。
pub(crate) struct FakeBrowser {
    works: bool,
    pub(crate) opened: Mutex<Vec<String>>,
}

impl Browser for FakeBrowser {
    fn open(&self, url: &str) -> bool {
        self.opened.lock().expect("没坏").push(url.to_string());
        self.works
    }
}

/// 交出去的是跳转页的：读出它要跳去的网址（`location.replace("…")` 里那一段）；不是的照原样。
fn followed(url: &str) -> String {
    let Some(path) = url.strip_prefix("file://") else {
        return url.to_string();
    };
    let path = path.replace("%20", " ");
    let path = if cfg!(windows) {
        path.trim_start_matches('/').to_string()
    } else {
        path
    };
    let page = std::fs::read_to_string(&path).expect("跳转页在");
    let inside = page
        .split("location.replace(")
        .nth(1)
        .and_then(|rest| rest.split(");").next())
        .expect("有跳转");
    serde_json::from_str::<String>(&inside.replace("<\\/", "</")).expect("是一段字")
}

/// 交给浏览器的几个，照跳到哪儿写。
fn went(browser: &FakeBrowser) -> Vec<String> {
    browser
        .opened
        .lock()
        .expect("没坏")
        .iter()
        .map(|url| followed(url))
        .collect()
}

/// 拉起的是真的 `miyu-web serve`：数据根、资源目录照这个临时目录，空闲 1 秒就走。
fn launch(home: &Home) -> Launch {
    let resources = home.dir.join("resources");
    std::fs::create_dir_all(resources.join("packages/miyu-webui")).expect("建得了");
    // 网页包（这个仓库的 `miyu-webui/`：清单、`web.json`）照装好的样子放进 `packages/miyu-webui/`
    let package = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../miyu-webui");
    std::fs::copy(
        package.join("web.json"),
        resources.join("packages/miyu-webui/web.json"),
    )
    .expect("拷得了");
    // 空闲多久照清单的默认值（施工 9-1 下）：这里改成 1 秒，测完很快就走。核心没在跑，`serve` 照默认起。
    let ours = package.join("package.toml");
    let manifest = std::fs::read_to_string(ours).expect("出厂的读得到");
    let quick = manifest.replace("default = 600\n", "default = 1\n");
    assert_ne!(quick, manifest, "清单里有空闲的默认值");
    std::fs::write(resources.join("packages/miyu-webui/package.toml"), quick).expect("写得进");
    let data = home.root.path().to_path_buf();
    let data_forget = data.clone();
    let pages = home.pages.clone();
    Launch {
        serve: Box::new(move |port| {
            let mut serve = Command::new(env!("CARGO_BIN_EXE_miyu-web"));
            serve
                .arg("serve")
                .env("MIYU_HOME", &data)
                .env("MIYU_RESOURCES", &resources)
                .env("MIYU_WEB_PAGES", &pages);
            if let Some(port) = port {
                serve.args(["--port", &port.to_string()]);
            }
            serve
        }),
        core: no_core(),
        forget: Box::new(move |page| {
            let mut forget = Command::new(env!("CARGO_BIN_EXE_miyu-web"));
            forget
                .arg("forget")
                .arg(page)
                .env("MIYU_HOME", &data_forget)
                .env("MIYU_WEB_FORGET_MS", "300");
            forget
        }),
    }
}

/// 走一遍 `open`：交回退出码、标准输出、标准错误。
pub(crate) async fn run_open(
    home: &Home,
    args: Open,
    browser: &FakeBrowser,
) -> (u8, String, String) {
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = open(
        &home.root,
        &args,
        &launch(home),
        browser,
        &mut out,
        &mut err,
    )
    .await;
    (
        code,
        String::from_utf8(out).expect("UTF-8"),
        String::from_utf8(err).expect("UTF-8"),
    )
}

pub(crate) fn browser(works: bool) -> FakeBrowser {
    FakeBrowser {
        works,
        opened: Mutex::new(Vec::new()),
    }
}

#[tokio::test]
async fn the_first_time_opens_with_a_ticket_after_starting_the_web_ui() {
    let home = Home::new();
    answer(fake_core(&home), true);
    let browser = browser(true);
    let (code, out, err) = run_open(
        &home,
        Open {
            port: Some(0),
            ..Open::default()
        },
        &browser,
    )
    .await;
    assert_eq!(code, 0, "{err}");
    let site = miyu_web::serve::address(&home.root).expect("拉起来了、写了地址");
    assert!(miyu_web::serve::running(&home.root));
    // 没设过访问密码也拿票（2026-10-30 项目主人：访问密码只给局域网用，本机打开不逼着设）
    assert_eq!(went(&browser), [format!("{site}/#ticket={TICKET}")]);
    assert!(
        browser.opened.lock().expect("没坏")[0].starts_with("file://"),
        "带票的交跳转页，票不进进程列表"
    );
    // 结果行带着整个网址（2026-10-29 项目主人：原来要再 --print 才看得到），提示在标准错误上（核心设计 47）
    assert_eq!(out, format!("已在浏览器中打开：{site}/#ticket={TICKET}\n"));
    assert_eq!(err, "提示：链接 60 秒内有效，只能用一次\n");
    // 已经在跑的照它的地址，不再拉起。
    let again = browser_again(&home, Open::default(), true).await;
    assert_eq!(again, [format!("{site}/#ticket={TICKET}")]);
}

async fn browser_again(home: &Home, args: Open, works: bool) -> Vec<String> {
    let browser = browser(works);
    let (code, _, _) = run_open(home, args, &browser).await;
    assert_eq!(code, 0);
    went(&browser)
}

#[tokio::test]
async fn later_opens_carry_a_ticket_unless_reset() {
    let home = Home::new();
    answer(fake_core(&home), false);
    let browser = browser(true);
    let (code, _, err) = run_open(
        &home,
        Open {
            port: Some(0),
            ..Open::default()
        },
        &browser,
    )
    .await;
    assert_eq!(code, 0, "{err}");
    let site = miyu_web::serve::address(&home.root).expect("有地址");
    assert_eq!(
        went(&browser),
        [format!("{site}/#ticket={TICKET}")],
        "带票，不带账号"
    );
    assert_eq!(err, "提示：链接 60 秒内有效，只能用一次\n");
    let reset = browser_again(
        &home,
        Open {
            reset: true,
            ..Open::default()
        },
        true,
    )
    .await;
    assert_eq!(reset, [format!("{site}/#setup={CODE}")]);
}

#[tokio::test]
async fn a_named_package_rides_after_the_hash() {
    let home = Home::new();
    answer(fake_core(&home), false);
    let browser = browser(true);
    let (code, _, err) = run_open(
        &home,
        Open {
            port: Some(0),
            package: Some("onebot".to_string()),
            ..Open::default()
        },
        &browser,
    )
    .await;
    assert_eq!(code, 0, "{err}");
    let site = miyu_web::serve::address(&home.root).expect("有地址");
    assert_eq!(
        went(&browser),
        [format!("{site}/#ticket={TICKET}&package=onebot")]
    );
    let reset = browser_again(
        &home,
        Open {
            reset: true,
            package: Some("onebot".to_string()),
            ..Open::default()
        },
        true,
    )
    .await;
    assert_eq!(
        reset,
        [format!("{site}/#setup={CODE}&package=onebot")],
        "和一次性码一起"
    );
}

#[tokio::test]
async fn print_and_a_missing_browser_print_the_address() {
    let home = Home::new();
    answer(fake_core(&home), true);
    let browser = browser(true);
    let (code, out, err) = run_open(
        &home,
        Open {
            port: Some(0),
            print: true,
            ..Open::default()
        },
        &browser,
    )
    .await;
    assert_eq!(code, 0, "{err}");
    let site = miyu_web::serve::address(&home.root).expect("有地址");
    assert!(
        browser.opened.lock().expect("没坏").is_empty(),
        "--print 不开浏览器"
    );
    assert_eq!(
        out,
        format!("{site}/#ticket={TICKET}\n"),
        "--print 只印网址"
    );
    assert!(err.contains("链接 60 秒内有效"), "{err}");
    let nothing = FakeBrowser {
        works: false,
        opened: Mutex::new(Vec::new()),
    };
    let (code, out, err) = run_open(&home, Open::default(), &nothing).await;
    assert!(
        err.starts_with("miyu: 无法打开浏览器，请手动打开上面的地址\n"),
        "{err}"
    );
    assert_eq!(code, 0);
    assert_eq!(
        out,
        format!("{site}/#ticket={TICKET}\n"),
        "交不出去照 --print 办"
    );
}

#[tokio::test]
async fn an_old_core_without_tickets_opens_the_bare_address() {
    let home = Home::new();
    answer_with(fake_core(&home), false, false);
    let browser = browser(true);
    let (code, _, err) = run_open(
        &home,
        Open {
            port: Some(0),
            ..Open::default()
        },
        &browser,
    )
    .await;
    assert_eq!(code, 0, "{err}");
    let site = miyu_web::serve::address(&home.root).expect("有地址");
    assert_eq!(
        *browser.opened.lock().expect("没坏"),
        [format!("{site}/")],
        "不带凭据的直接交"
    );
    assert!(!err.contains("提示"), "什么凭据都不带的不提示：{err}");
}

#[tokio::test]
async fn print_with_a_ticket_warns_about_sixty_seconds() {
    let home = Home::new();
    answer(fake_core(&home), false);
    let (code, out, err) = run_open(
        &home,
        Open {
            port: Some(0),
            print: true,
            ..Open::default()
        },
        &browser(true),
    )
    .await;
    assert_eq!(code, 0, "{err}");
    let site = miyu_web::serve::address(&home.root).expect("有地址");
    assert_eq!(out, format!("{site}/#ticket={TICKET}\n"));
    assert!(err.contains("60 秒内有效，只能用一次"), "{err}");
    let jumps = home.root.run().join(miyu_web::open::JUMPS);
    assert!(
        std::fs::read_dir(&jumps).map_or(true, |mut dir| dir.next().is_none()),
        "--print 不写跳转页"
    );
}

#[tokio::test]
async fn the_jump_page_is_private_and_forgotten() {
    let home = Home::new();
    answer(fake_core(&home), false);
    let browser = browser(true);
    let (code, _, err) = run_open(
        &home,
        Open {
            port: Some(0),
            ..Open::default()
        },
        &browser,
    )
    .await;
    assert_eq!(code, 0, "{err}");
    let url = browser.opened.lock().expect("没坏")[0].clone();
    let jumps = home.root.run().join(miyu_web::open::JUMPS);
    let pages: Vec<_> = std::fs::read_dir(&jumps)
        .expect("有目录")
        .flatten()
        .map(|e| e.path())
        .collect();
    assert_eq!(pages.len(), 1, "{pages:?}");
    assert!(miyu_web::open::is_jump(&pages[0]));
    assert!(
        url.ends_with(&*pages[0].file_name().expect("有名字").to_string_lossy()),
        "{url}"
    );
    let page = std::fs::read_to_string(&pages[0]).expect("读得到");
    assert!(
        page.contains("location.replace(") && page.contains("no-referrer"),
        "{page}"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = |p: &Path| std::fs::metadata(p).expect("在").permissions().mode() & 0o777;
        assert_eq!(mode(&pages[0]), 0o600, "只给本人读");
        assert_eq!(mode(&jumps), 0o700);
    }
    // `forget` 过一会儿删掉（测试里等 300 毫秒）
    for _ in 0..100 {
        if !pages[0].exists() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(!pages[0].exists(), "forget 删掉了");
}

#[tokio::test]
async fn logout_says_how_many_and_leaves_the_web_ui_alone() {
    let home = Home::new();
    answer(fake_core(&home), false);
    let browser = browser(true);
    let (code, out, err) = run_open(
        &home,
        Open {
            logout: true,
            ..Open::default()
        },
        &browser,
    )
    .await;
    assert_eq!(code, 0, "{err}");
    assert_eq!(out, "已退出 3 个登录\n");
    assert_eq!(err, "提示：浏览器需要重新输入访问密码\n");
    assert!(browser.opened.lock().expect("没坏").is_empty());
    assert!(!miyu_web::serve::running(&home.root), "没拉起网页软件");
}

#[tokio::test]
async fn a_taken_port_is_said_in_the_persons_language() {
    let home = Home::new();
    answer(fake_core(&home), true);
    let taken = std::net::TcpListener::bind("127.0.0.1:0").expect("占得了");
    let port = taken.local_addr().expect("有地址").port();
    let (code, _, err) = run_open(
        &home,
        Open {
            port: Some(port),
            ..Open::default()
        },
        &browser(true),
    )
    .await;
    assert_eq!(code, 1);
    assert_eq!(
        err,
        format!("miyu: 端口 {port} 已被占用\n提示：用 'miyu web --port <端口>' 换一个\n")
    );
    let _ = Arc::new(());
}
