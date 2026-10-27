//! 跳转页（网页-乙，`web-ui.md`「怎么走」第二条第 4 款）：`forget` 只删 `run/open/` 里的跳转页，放久了的下一次写跳转页时删掉，
//! 网址里的 `</` 拆开。

use crate::support::*;

#[tokio::test]
async fn forget_only_touches_jump_pages_and_open_sweeps_stale_ones() {
    let home = Home::new();
    let jumps = home.root.run().join(miyu_web::open::JUMPS);
    std::fs::create_dir_all(&jumps).expect("建得了");
    // 不是跳转页的、不在 run/open 里的：forget 不碰
    let other = jumps.join("notes.html");
    std::fs::write(&other, "x").expect("写得进");
    let outside = home
        .root
        .run()
        .join("0123456789abcdef0123456789abcdef.html");
    std::fs::write(&outside, "x").expect("写得进");
    miyu_web::open::forget(&home.root, &other, std::time::Duration::ZERO);
    miyu_web::open::forget(&home.root, &outside, std::time::Duration::ZERO);
    assert!(other.exists() && outside.exists());
    // 放久了的跳转页：下一次写跳转页时删掉
    let stale = jumps.join("ffffffffffffffffffffffffffffffff.html");
    std::fs::write(&stale, "x").expect("写得进");
    let old = std::time::SystemTime::now() - std::time::Duration::from_secs(600);
    std::fs::File::options()
        .write(true)
        .open(&stale)
        .expect("开得了")
        .set_modified(old)
        .expect("改得了时刻");
    let fresh =
        miyu_web::open::jump(&home.root, "http://127.0.0.1:1/#ticket=ab</script>").expect("写得了");
    assert!(!stale.exists(), "放久了的删掉了");
    assert!(other.exists(), "不是跳转页的不删");
    let page = std::fs::read_to_string(&fresh).expect("读得到");
    assert!(!page.contains("ab</script>"), "</ 拆开了：{page}");
    miyu_web::open::forget(&home.root, &fresh, std::time::Duration::ZERO);
    assert!(!fresh.exists());
}
