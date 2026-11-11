//! 找文件：照名字、大小、改的时刻认；先浅后深；不进的文件夹不进；到时限就停。

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::{Located, Wanted, millis, walk};

/// 一个临时的家目录，测完删掉。
struct Home(PathBuf);

impl Home {
    fn new(tag: &str) -> Home {
        let dir = std::env::temp_dir().join(format!("miyu-locate-{tag}-{}", std::process::id()));
        drop(std::fs::remove_dir_all(&dir));
        std::fs::create_dir_all(&dir).unwrap();
        // 临时目录可能是链接（macOS 的 `/var`）：照真实的路径比。
        Home(dir.canonicalize().unwrap())
    }

    fn file(&self, path: &str, bytes: usize) -> PathBuf {
        let at = self.0.join(path);
        std::fs::create_dir_all(at.parent().unwrap()).unwrap();
        std::fs::write(&at, vec![b'x'; bytes]).unwrap();
        at
    }
}

impl Drop for Home {
    fn drop(&mut self) {
        drop(std::fs::remove_dir_all(&self.0));
    }
}

fn wanted(name: &str, size: Option<u64>, modified_ms: Option<u64>) -> Wanted {
    Wanted {
        name: name.to_string(),
        size,
        modified_ms,
    }
}

fn find(home: &Home, wanted: &Wanted, roots: &[PathBuf]) -> Option<PathBuf> {
    let until = Instant::now() + Duration::from_secs(5);
    walk(wanted, roots, (Some(&home.0), &[]), until)
}

fn modified(at: &Path) -> u64 {
    millis(std::fs::metadata(at).unwrap().modified().unwrap())
}

#[test]
fn a_file_is_found_by_its_name_and_size_wherever_it_is() {
    let home = Home::new("found");
    let video = home.file("Movies/2026/trip/录像 01.mp4", 4096);
    home.file("Documents/notes.md", 10);
    let roots = [home.0.clone()];
    let got = find(&home, &wanted("录像 01.mp4", Some(4096), None), &roots);
    assert_eq!(got, Some(video));
    assert_eq!(
        find(&home, &wanted("录像 01.mp4", Some(4097), None), &roots),
        None,
        "大小不一样的不是"
    );
    assert_eq!(find(&home, &wanted("没有.mp4", None, None), &roots), None);
}

#[test]
fn the_one_whose_time_matches_wins_over_a_copy() {
    let home = Home::new("time");
    // 浅的那一份是拷出来的（时刻不一样），深的才是原来那个。
    let copy = home.file("a.bin", 100);
    let real = home.file("deep/er/a.bin", 100);
    let old = std::time::SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
    let file = std::fs::File::options().write(true).open(&real).unwrap();
    file.set_modified(old).unwrap();
    drop(file);
    let roots = [home.0.clone()];
    let at = Some(modified(&real));
    assert_eq!(
        find(&home, &wanted("a.bin", Some(100), at), &roots),
        Some(real.clone())
    );
    // 差 2 秒以内也算对得上。
    let near = at.map(|ms| ms + 1500);
    assert_eq!(
        find(&home, &wanted("a.bin", Some(100), near), &roots),
        Some(real)
    );
    // 哪个的时刻都对不上：交先找到的那个（浅的）。
    assert_eq!(
        find(&home, &wanted("a.bin", Some(100), Some(1)), &roots),
        Some(copy)
    );
}

#[test]
fn the_places_named_first_are_looked_at_first() {
    let home = Home::new("near");
    home.file("Downloads/report.pdf", 7);
    let work = home.file("code/project/docs/report.pdf", 7);
    let roots = [home.0.join("code/project"), home.0.clone()];
    assert_eq!(
        find(&home, &wanted("report.pdf", Some(7), None), &roots),
        Some(work),
        "先看工作区"
    );
}

#[test]
fn hidden_and_bulky_folders_are_not_entered_and_avoided_ones_neither() {
    let home = Home::new("skip");
    home.file(".cache/x.bin", 3);
    home.file("proj/node_modules/pkg/x.bin", 3);
    home.file("proj/target/debug/x.bin", 3);
    home.file("Library/Caches/x.bin", 3);
    let data = home.file("miyu-data/var/x.bin", 3);
    let roots = [home.0.clone()];
    let avoid = [data.parent().unwrap().parent().unwrap().to_path_buf()];
    let until = Instant::now() + Duration::from_secs(5);
    let want = wanted("x.bin", Some(3), None);
    assert_eq!(walk(&want, &roots, (Some(&home.0), &avoid), until), None);
    // 家目录以外的 `Library` 照常进。
    let inner = home.file("proj/Library/x.bin", 3);
    let until = Instant::now() + Duration::from_secs(5);
    assert_eq!(
        walk(&want, &roots, (Some(&home.0), &avoid), until),
        Some(inner)
    );
}

#[test]
fn a_folder_or_a_past_deadline_gives_nothing() {
    let home = Home::new("misc");
    std::fs::create_dir_all(home.0.join("pics/shot.png")).unwrap();
    let roots = [home.0.clone()];
    assert_eq!(
        find(&home, &wanted("shot.png", None, None), &roots),
        None,
        "同名的文件夹不算"
    );
    home.file("pics/real.png", 1);
    let want = wanted("real.png", None, None);
    let past = Instant::now() - Duration::from_millis(1);
    assert_eq!(walk(&want, &roots, (Some(&home.0), &[]), past), None);
}

#[test]
fn names_that_are_not_file_names_are_refused_and_the_reply_is_json() {
    for bad in ["", ".", "..", "a/b", "a\\b", "a\nb"] {
        assert!(!wanted(bad, None, None).valid(), "{bad:?}");
    }
    assert!(wanted("报告 (终版).pdf", None, None).valid());
    assert_eq!(Located::Nowhere.json(), "{}");
    let at = Located::At(PathBuf::from("/home/a/b \"c\".txt"));
    let json: serde_json::Value = serde_json::from_str(&at.json()).unwrap();
    assert_eq!(json["path"], "/home/a/b \"c\".txt");
}

/// 量尺（`cargo test -p miyu-desk ruler -- --ignored --nocapture`）：在这台机器真的家目录里找一个没有的文件要多久、时限里翻得完吗。
#[test]
#[ignore = "量尺：翻真的家目录"]
fn ruler_walking_the_real_home() {
    let Some(home) = super::home() else { return };
    let roots = [home.clone()];
    for limit in [2, 30] {
        let started = Instant::now();
        let until = started + Duration::from_secs(limit);
        let got = walk(
            &wanted("miyu-no-such-file-7f3a.bin", None, None),
            &roots,
            (Some(&home), &[]),
            until,
        );
        println!("limit {limit}s: {got:?} after {:?}", started.elapsed());
    }
}

#[tokio::test]
async fn locating_looks_near_first_and_refuses_bad_names() {
    let home = Home::new("async");
    let file = home.file("work/clip.mov", 9);
    let got = super::locate(
        wanted("clip.mov", Some(9), Some(modified(&file))),
        vec![home.0.join("work")],
        Vec::new(),
        super::LIMIT,
    )
    .await;
    assert_eq!(got, Located::At(file));
    let bad = super::locate(
        wanted("../clip.mov", None, None),
        Vec::new(),
        Vec::new(),
        super::LIMIT,
    )
    .await;
    assert_eq!(bad, Located::Nowhere);
}
