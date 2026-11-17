//! 找不到数据根、拉不起核心时给人看的那一句（`web.error`、网页软件起不来时说的）照这台机器的语言说（核心 EN-1、EN-2）：照底层
//! 错的说法从资源目录取整句，取不到的照原话。资源目录是测试自己写的一小份，句子照核心 `en.json` 抄的。

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use miyu_client::connect::StartError;
use miyu_client::places::{Env, Platform};

use super::{data_root, language, spoken_in};

/// 一个没用过的临时目录（测完删掉）。
fn scratch(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    std::env::temp_dir().join(format!("webserve-{name}-{}-{nanos}", std::process::id()))
}

/// 在 `dir` 下写一份只有英文、只有这几句的资源目录，交回它的位置。
fn resources(dir: &Path) -> PathBuf {
    let human = dir.join("resources/core/human");
    std::fs::create_dir_all(&human).expect("建得了资源目录");
    let words = serde_json::json!({"said": {
        "start/miyu_home_relative": "MIYU_HOME must be an absolute path, got {path}",
        "start/timeout": "Timed out waiting for the core to start",
        "start/socket_occupied": "The core couldn't start: something else is at {reason}",
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

#[test]
fn a_relative_data_root_is_said_in_the_machine_language() {
    let dir = scratch("relative");
    let words = resources(&dir);
    let got = data_root(&env("rel/path", &words), "en");
    std::fs::remove_dir_all(&dir).expect("删得掉临时目录");
    let Err(said) = got else {
        panic!("相对路径找不到数据根");
    };
    assert_eq!(said, "MIYU_HOME must be an absolute path, got rel/path");
}

#[test]
fn the_web_error_carries_the_whole_sentence_of_the_core() {
    let dir = scratch("web-error");
    let words = resources(&dir);
    let env = env(dir.join("home"), &words);
    let speak = |said, error: &dyn std::fmt::Display| spoken_in(&env, "en", said, error);
    let occupied = StartError::Refused {
        code: Some("socket_occupied".into()),
        reason: "/x/run/core.sock".into(),
    };
    let notice = crate::start::unreachable(&occupied, speak);
    let timeout = crate::start::unreachable(&StartError::Timeout, speak);
    std::fs::remove_dir_all(&dir).expect("删得掉临时目录");
    assert_eq!(notice["method"], "web.error");
    assert_eq!(
        notice["params"]["message"],
        "The core couldn't start: something else is at /x/run/core.sock"
    );
    assert_eq!(
        timeout["params"]["message"],
        "Timed out waiting for the core to start"
    );
    assert!(
        notice["params"].get("reason").is_none(),
        "连不上的不带原因码"
    );
}

/// 人停的核心、页面自己重连（核心 CS-5）：整句照核心 `core/start/stopped_by_user`，多一格 `reason`，页面照它出「核心已停止」的卡。
#[test]
fn a_core_stopped_by_the_user_is_told_with_its_reason() {
    let dir = scratch("stopped");
    let words = resources(&dir);
    let env = env(dir.join("home"), &words);
    let speak = |said, error: &dyn std::fmt::Display| spoken_in(&env, "en", said, error);
    let notice = crate::start::unreachable(&StartError::StoppedByUser, speak);
    std::fs::remove_dir_all(&dir).expect("删得掉临时目录");
    assert_eq!(notice["method"], "web.error");
    assert_eq!(notice["params"]["message"], "The core was stopped");
    assert_eq!(notice["params"]["reason"], "stopped_by_user");
}

#[test]
fn only_again_in_the_query_means_reconnecting() {
    use crate::start::again;
    assert!(again(Some("again=1")));
    assert!(again(Some("k=abc&again=1")));
    assert!(!again(None));
    assert!(!again(Some("again=0")));
    assert!(!again(Some("xagain=1")));
}

#[test]
fn without_words_the_original_is_said() {
    let dir = scratch("no-words");
    let got = data_root(&env("rel/path", &dir.join("nothing")), "en");
    let Err(said) = got else {
        panic!("相对路径找不到数据根");
    };
    assert_eq!(said, "MIYU_HOME 要写绝对路径，写的是 rel/path");
}

#[test]
fn the_machine_language_picks_the_words() {
    assert_eq!(language("ja_JP.UTF-8"), "ja");
    assert_eq!(language("zh_CN.UTF-8"), "zh");
    assert_eq!(language("C"), "en");
    assert_eq!(language(""), "en");
}
