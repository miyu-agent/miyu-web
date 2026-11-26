//! 找不到数据根、拉不起核心时告诉页面的那一句（`bridge.error`）照这台机器的语言说（核心 EN-1、EN-2）：照底层错的说法从资源目录
//! 取整句，取不到的照原话。资源目录是测试自己写的一小份（演示的桥在 CI 上测时没有核心的资源目录），句子照核心 `en.json` 抄的。

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use miyu_client::places::{Env, Platform};

use super::{Unreached, connect_in};

/// 一个没用过的临时目录（测完删掉）。
fn scratch(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    std::env::temp_dir().join(format!("bridge-{name}-{}-{nanos}", std::process::id()))
}

/// 在 `dir` 下写一份只有英文、只有这几句的资源目录，交回它的位置。
fn resources(dir: &Path) -> PathBuf {
    let human = dir.join("resources/core/human");
    std::fs::create_dir_all(&human).expect("建得了资源目录");
    let words = serde_json::json!({"said": {
        "start/miyu_home_relative": "MIYU_HOME must be an absolute path, got {path}",
        "start/spawn_failed": "Cannot launch the core: {error}",
        "start/stopped_by_user": "The core was stopped",
    }});
    std::fs::write(human.join("en.json"), words.to_string()).expect("写得了字");
    dir.join("resources")
}

/// 数据根在 `home`、字照 `words` 那个资源目录读的环境。
fn env(home: impl Into<OsString>, words: &Path) -> Env {
    Env {
        platform: Platform::current(),
        miyu_home: Some(home.into()),
        home: None,
        xdg_cache_home: None,
        local_app_data: None,
        miyu_resources: Some(words.as_os_str().to_owned()),
        exe: None,
    }
}

#[tokio::test]
async fn a_relative_data_root_is_said_in_the_machine_language() {
    let dir = scratch("relative");
    let words = resources(&dir);
    let got = connect_in(&env("rel/path", &words), "en", None, false, &|| {}).await;
    std::fs::remove_dir_all(&dir).expect("删得掉临时目录");
    let Err(Unreached { message: said, .. }) = got else {
        panic!("相对路径找不到数据根");
    };
    assert_eq!(said, "MIYU_HOME must be an absolute path, got rel/path");
}

#[tokio::test]
async fn a_core_that_cannot_be_launched_is_said_in_the_machine_language() {
    let dir = scratch("spawn");
    let words = resources(&dir);
    let missing = dir.join("no-such-miyu");
    let got = connect_in(
        &env(dir.join("home"), &words),
        "en",
        Some(missing.into_os_string()),
        false,
        &|| {},
    )
    .await;
    std::fs::remove_dir_all(&dir).expect("删得掉临时目录");
    let Err(Unreached { message: said, .. }) = got else {
        panic!("没有这个程序，拉不起来");
    };
    assert!(
        said.starts_with("Cannot launch the core: "),
        "照 start/spawn_failed 说：{said}"
    );
}

#[tokio::test]
async fn without_words_the_original_is_said() {
    let dir = scratch("no-words");
    let got = connect_in(
        &env("rel/path", &dir.join("nothing")),
        "en",
        None,
        false,
        &|| {},
    )
    .await;
    let Err(Unreached { message: said, .. }) = got else {
        panic!("相对路径找不到数据根");
    };
    assert_eq!(said, "MIYU_HOME 要写绝对路径，写的是 rel/path");
}

#[tokio::test]
async fn a_core_that_is_not_running_keeps_the_bridge_hint() {
    let dir = scratch("idle");
    let words = resources(&dir);
    let got = connect_in(&env(dir.join("home"), &words), "en", None, false, &|| {}).await;
    std::fs::remove_dir_all(&dir).expect("删得掉临时目录");
    let Err(Unreached { message: said, .. }) = got else {
        panic!("核心没在跑");
    };
    assert!(said.contains("MIYU_CORE_BIN"), "{said}");
}

/// 人停的核心（数据根 `run/stopped`，核心 CS-5）：页面自己重连（`again`）的不拉起，交回人停的那一句；页面刚打开、点了「启动」的照常去拉
/// （这里的程序不存在，拉不起来）。
#[tokio::test]
async fn reconnecting_does_not_start_a_core_the_user_stopped() {
    let dir = scratch("stopped");
    let words = resources(&dir);
    let env = env(dir.join("home"), &words);
    let root = miyu_client::places::DataRoot::locate(&env).expect("找得到数据根");
    root.prepare().expect("建得了骨架");
    std::fs::write(root.run().join("stopped"), b"").expect("写得进记号");
    let missing = || Some(dir.join("no-such-miyu").into_os_string());
    let again = connect_in(&env, "en", missing(), true, &|| {}).await;
    let asked = connect_in(&env, "en", missing(), false, &|| {}).await;
    std::fs::remove_dir_all(&dir).expect("删得掉临时目录");
    let Err(stopped) = again else {
        panic!("人停的不拉起");
    };
    assert!(stopped.stopped);
    assert_eq!(stopped.message, "The core was stopped");
    let Err(launched) = asked else {
        panic!("没有这个程序，拉不起来");
    };
    assert!(!launched.stopped);
    assert!(
        launched.message.starts_with("Cannot launch the core: "),
        "人要用的照常去拉：{}",
        launched.message
    );
}
