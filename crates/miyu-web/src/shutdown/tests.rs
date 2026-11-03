//! 钥匙逐字比（W-1091）。

use super::*;

#[test]
fn keys_match_only_byte_for_byte() {
    assert!(same(b"abc", b"abc"));
    assert!(!same(b"abc", b"abd"), "最后一位不同");
    assert!(!same(b"abc", b"abcd"), "长短不同");
    assert!(!same(b"", b"a"));
}
