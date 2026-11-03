use super::*;

#[test]
fn unix_and_drive_paths_keep_their_shape() {
    assert_eq!(url_path("/home/a/run/x.html"), "/home/a/run/x.html");
    assert_eq!(url_path(r"C:\Users\a\x.html"), "/C:/Users/a/x.html");
}

#[test]
fn the_long_path_prefix_is_dropped() {
    assert_eq!(url_path(r"\\?\C:\Users\a\x.html"), "/C:/Users/a/x.html");
}

#[test]
fn shares_put_the_host_after_the_slashes() {
    assert_eq!(
        url_path(r"\\?\UNC\srv\share\a\x.html"),
        "srv/share/a/x.html"
    );
    assert_eq!(url_path(r"\\srv\share\a\x.html"), "srv/share/a/x.html");
}

#[test]
fn the_whole_address_is_escaped() {
    assert_eq!(
        file_url(Path::new(r"\\?\C:\Users\我\x y.html")),
        "file:///C:/Users/%E6%88%91/x%20y.html"
    );
    assert_eq!(
        file_url(Path::new(r"\\?\UNC\srv\share\x.html")),
        "file://srv/share/x.html"
    );
}

#[test]
fn the_address_carries_where_to_go_after_the_credentials() {
    let site = "http://127.0.0.1:8300";
    assert_eq!(
        address_of(site, None, None, &Open::default()),
        "http://127.0.0.1:8300/"
    );
    let go = Open {
        package: Some("onebot".to_string()),
        session: Some("019a4b2c-7d3e-7f10-8a2b-3c4d5e6f7a8b".to_string()),
        settings: Some("access".to_string()),
        ..Open::default()
    };
    assert_eq!(
        address_of(site, None, Some("ab12"), &go),
        "http://127.0.0.1:8300/#ticket=ab12&package=onebot&session=019a4b2c-7d3e-7f10-8a2b-3c4d5e6f7a8b&settings=access"
    );
    let home = Open {
        settings: Some(String::new()),
        ..Open::default()
    };
    assert_eq!(
        address_of(site, Some("9f03"), None, &home),
        "http://127.0.0.1:8300/#setup=9f03&settings=",
        "设置的首页写空的"
    );
}
