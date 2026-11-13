//! 分段、下载的名字（施工 W-10）。

use super::range::{Span, attachment, span};
use super::tickets::Source;
use super::{PDF, SANDBOX, policy, source_of};

#[test]
fn one_range_or_the_whole() {
    let part = |start, end| Span::Part { start, end };
    for (header, want) in [
        (None, Span::Whole),
        (Some("bytes=0-4"), part(0, 4)),
        (Some("BYTES=0-4"), part(0, 4)),
        (Some("bytes=5-"), part(5, 9)),
        (Some("bytes=-3"), part(7, 9)),
        (Some("bytes=-30"), part(0, 9)),
        (Some("bytes=8-100"), part(8, 9)),
        (Some("bytes=9-9"), part(9, 9)),
        (Some("bytes=10-"), Span::Beyond),
        (Some("bytes=10-12"), Span::Beyond),
        (Some("bytes=-0"), Span::Beyond),
        (Some("bytes=0-1,4-5"), Span::Whole),
        (Some("bytes=4-1"), Span::Whole),
        (Some("bytes=a-"), Span::Whole),
        (Some("bytes=+1-2"), Span::Whole),
        (Some("bytes=-"), Span::Whole),
        (Some("bytes 0-1"), Span::Whole),
        (Some("items=0-1"), Span::Whole),
        (Some("byte"), Span::Whole),
    ] {
        assert_eq!(span(header, 10), want, "{header:?}");
    }
    assert_eq!(span(Some("bytes=-5"), 0), Span::Beyond, "空的没有哪一段");
    assert_eq!(span(Some("bytes=0-"), 0), Span::Beyond);
}

#[test]
fn a_download_name_keeps_its_last_part_escaped() {
    assert_eq!(attachment(None), "attachment");
    assert_eq!(attachment(Some("a/b/")), "attachment", "最后一段是空的");
    assert_eq!(
        attachment(Some("/home/me/plain.txt")),
        "attachment; filename*=UTF-8''plain.txt"
    );
    assert_eq!(
        attachment(Some("C:\\x\\a b.txt")),
        "attachment; filename*=UTF-8''a%20b.txt"
    );
    assert_eq!(
        attachment(Some("报告;\"'%.pdf")),
        "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A%3B%22%27%25.pdf"
    );
    assert_eq!(
        attachment(Some("a!#$&+-.^_`|~z")),
        "attachment; filename*=UTF-8''a!#$&+-.^_`|~z"
    );
}

#[test]
fn only_pdf_leaves_the_sandbox() {
    assert_eq!(policy("image/png"), SANDBOX);
    assert_eq!(policy("text/html; charset=utf-8"), SANDBOX);
    assert_eq!(policy("application/pdf"), PDF);
    assert!(!PDF.contains("sandbox") && PDF.contains("default-src 'none'"));
}

/// 核心 SW-1（W-1172）：展示的文件照「会话 + 调用编号」换票据；三种正好写一样，只写一半的不收。
#[test]
fn a_ticket_names_exactly_one_kind_of_source() {
    let s = |v: &str| Some(v.to_string());
    assert_eq!(
        source_of(s("sha256:a"), None, None, None),
        Some(Source::Blob("sha256:a".into()))
    );
    assert_eq!(
        source_of(None, s("/a"), None, None),
        Some(Source::Path("/a".into()))
    );
    assert_eq!(
        source_of(None, None, s("0193"), s("call_1")),
        Some(Source::Shown {
            session: "0193".into(),
            call: "call_1".into()
        })
    );
    assert_eq!(source_of(None, None, s("0193"), None), None, "少了调用编号");
    assert_eq!(
        source_of(None, s("/a"), s("0193"), s("call_1")),
        None,
        "两样都写"
    );
    assert_eq!(source_of(None, None, None, None), None);
}
