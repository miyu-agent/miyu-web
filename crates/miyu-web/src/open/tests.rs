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
