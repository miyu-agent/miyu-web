//! 程序 `miyu-web`（`web-module.md`「怎么走」第九条、第十一条，施工 W-9）：`open` 是 `miyu web` 交来的，`serve`、`forget` 是 `open`
//! 拉起来的，不写进帮助（`forget <跳转页>`：过 30 秒删掉 `open` 写的跳转页，`web-ui.md`「怎么走」第二条第 4 款）。
//!
//! - `miyu-web serve [--port <端口>]`
//! - `miyu-web open [--port <端口>] [--print] [--reset] [--logout] [--package <编号>]`

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::sync::Arc;
use std::time::Duration;

use miyu_client::places::DataRoot;
use miyu_client::places::Env;
use miyu_client::places::ResourceRoot;
use miyu_web::open::{Launch, Open, SystemBrowser, open};
use miyu_web::serve::Serve;
use miyu_web::settings::Settings;

/// 用法不对的退出码。
const USAGE: u8 = 2;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some((command, rest)) = args.split_first() else {
        return usage();
    };
    if command == "forget" {
        return forget(rest);
    }
    let Some(parsed) = parse(rest) else {
        return usage();
    };
    let Ok(runtime) = tokio::runtime::Runtime::new() else {
        eprintln!("miyu-web: no runtime");
        return ExitCode::from(1);
    };
    let env = Env::current();
    let root = match DataRoot::locate(&env) {
        Ok(root) => root,
        Err(error) => {
            eprintln!("miyu-web: {error}");
            return ExitCode::from(1);
        }
    };
    if let Err(error) = root.prepare() {
        eprintln!("miyu-web: {error}");
        return ExitCode::from(1);
    }
    match command.as_str() {
        "serve" if !parsed.print && !parsed.reset && !parsed.logout => {
            ExitCode::from(runtime.block_on(serve(root, &env, parsed.port)))
        }
        "open" => {
            let launch = Launch {
                serve: Box::new(|port| {
                    let mut serve = Command::new(myself());
                    serve.arg("serve");
                    if let Some(port) = port {
                        serve.args(["--port", &port.to_string()]);
                    }
                    serve
                }),
                core: Arc::new(core),
                forget: Box::new(|page| {
                    let mut forget = Command::new(myself());
                    forget.arg("forget").arg(page);
                    forget
                }),
            };
            let code = runtime.block_on(open(
                &root,
                &parsed,
                &launch,
                &SystemBrowser,
                &mut std::io::stdout(),
                &mut std::io::stderr(),
            ));
            ExitCode::from(code)
        }
        _ => usage(),
    }
}

/// `serve`：读资源、装运行日志，跑到空闲退出。
async fn serve(root: DataRoot, env: &Env, port: Option<u16>) -> u8 {
    let failed = |reason: String| {
        print!("{}", miyu_client::connect::Ready::Failed(reason).line());
        1
    };
    // 网页包的文件夹：核心挑的、程序带着装的，都不是的照资源目录（`web-ui.md`「怎么走」第一条第 6 款）
    let given = std::env::var_os("MIYU_PACKAGE_DIR").map(PathBuf::from);
    let web = match miyu_web::settings::package_dir(given.as_deref(), env.exe.as_deref()) {
        Some(dir) => dir,
        None => match ResourceRoot::locate(env) {
            Ok(resources) => resources.path().join(miyu_web::settings::DIR),
            Err(error) => return failed(error.to_string()),
        },
    };
    let settings = match Settings::load(&web) {
        Ok(settings) => settings,
        Err(error) => return failed(error),
    };
    let pages = std::env::var_os("MIYU_WEB_PAGES")
        .filter(|pages| !pages.is_empty())
        .map_or_else(|| web.join("pages"), PathBuf::from);
    let _log = miyu_client::log::install(
        &root.state().join("logs"),
        "web",
        miyu_client::log::LevelFilter::INFO,
        env.home.as_deref(),
    );
    let settings = settings.from_core(&root).await;
    let serve = Serve {
        root,
        port: port.unwrap_or(settings.port),
        pages,
        settings,
        core: Arc::new(core),
    };
    let ran = miyu_web::serve::run(serve, |ready| {
        print!("{}", ready.line());
        use std::io::Write;
        if std::io::stdout().flush().is_err() {
            // 拉起它的那一头走了：照常跑。
        }
    })
    .await;
    u8::from(ran.is_err())
}

/// 读参数：`--port <端口>`、`--print`、`--reset`、`--logout`、`--package <编号>`（编号的写法不对的不认），别的不认。
fn parse(args: &[String]) -> Option<Open> {
    let mut open = Open::default();
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => open.port = Some(args.next()?.parse().ok()?),
            "--print" => open.print = true,
            "--reset" => open.reset = true,
            "--logout" => open.logout = true,
            "--package" => {
                open.package = Some(
                    args.next()
                        .filter(|id| miyu_web::backstage::valid_package(id))?
                        .clone(),
                );
            }
            _ => return None,
        }
    }
    Some(open)
}

/// `forget <跳转页>`：过一会儿删掉 `open` 写的跳转页（只删 `run/open/` 里的）。等多久照 `MIYU_WEB_FORGET_MS`（测试用），不写是 30 秒。
fn forget(rest: &[String]) -> ExitCode {
    let [page] = rest else {
        return usage();
    };
    let Ok(root) = DataRoot::locate(&Env::current()) else {
        return ExitCode::from(1);
    };
    let after = std::env::var("MIYU_WEB_FORGET_MS")
        .ok()
        .and_then(|ms| ms.parse().ok())
        .map_or(Duration::from_secs(30), Duration::from_millis);
    miyu_web::open::forget(&root, Path::new(page), after);
    ExitCode::SUCCESS
}

/// 用法不对。
fn usage() -> ExitCode {
    eprintln!(
        "usage: miyu-web open [--port <port>] [--print] [--reset] [--logout] [--package <id>]"
    );
    ExitCode::from(USAGE)
}

/// 自己在哪。
fn myself() -> PathBuf {
    std::env::current_exe().unwrap_or_else(|_| PathBuf::from("miyu-web"))
}

/// 拉起核心的命令（施工 W-9「施工时定的」第 3 条）：主程序照核心给的 `MIYU_PROGRAM`（主程序的真实位置，核心 G-15；打成包装进数据根的旁边没有主程序），没设、
/// 不是绝对路径、那里没有文件的照自己真实位置旁边的（`web-ui.md`「怎么走」第一条第 7 款）。
fn core() -> Command {
    let given = std::env::var_os("MIYU_PROGRAM")
        .map(PathBuf::from)
        .filter(|program| program.is_absolute() && program.is_file());
    let mut core = Command::new(given.unwrap_or_else(|| sibling(&myself(), "miyu")));
    core.arg("core");
    core
}

/// `program` 真实位置旁边叫 `name` 的程序（Windows 上加 `.exe`）。
fn sibling(program: &Path, name: &str) -> PathBuf {
    let real = std::fs::canonicalize(program).unwrap_or_else(|_| program.to_path_buf());
    let file = format!("{name}{}", std::env::consts::EXE_SUFFIX);
    real.parent()
        .map_or_else(|| PathBuf::from(&file), |dir| dir.join(&file))
}
