// @ts-check
//! 她 `show` 过的东西在正文里画成什么（蓝图 `web.md`「展示」；核心 D-5，设计 35 第三节；2026-10-17 项目主人定：画在正文里，和她发的图
//! 一样）：图片画缩略图（照回答里的图，点开是灯箱，灯箱里多「在右栏打开」）；视频、音频画成播放器；别的画一张卡片：图标照种类、标题（没写的照文件名）、
//! 一行小字写种类和大小，点了在右栏打开；别的文件（右栏看不了的）点了下载，存成原来的名字。

import { h, icon, setUrl } from './dom.js';
import { t } from '../util/res.js';
import { bytes } from '../lib/format.js';
import { shownUrl } from '../core/host.js';
import { imageCard, videoCard, audioCard } from './media.js';
import { blobType } from './artifacts.js';

/** 卡片的图标照种类 */
const ICONS = /** @type {Record<string, string>} */ ({ html: 'globe', markdown: 'file-text', code: 'file-code', text: 'file-text', pdf: 'file', file: 'file' });

/**
 * 一样展示过的。内容照「会话 + 调用编号」读（核心 SW-1，W-1172）；`state` 问一次文件还在不在、变没变，变了、没了的换成一张写着
 * 「文件已变」「文件已不在」的卡片（核心每次读都核对展示时的大小和修改时间）。
 * @param {import('../model/artifacts.js').Shown} s
 * @param {{session: string|null, lightbox?: () => any, reveal?: (path: string) => void, state?: (s: import('../model/artifacts.js').Shown) => Promise<string|null>}} how
 *   正在看的会话；现在的灯箱；在右栏打开它；问文件还在不在
 */
export function shownNode(s, how) {
  const node = drawn(s, how);
  how.state?.(s).then((problem) => {
    if (problem && node.isConnected !== false) node.replaceWith(missingCard(s, problem));
  });
  return node;
}

/** @param {import('../model/artifacts.js').Shown} s @param {Parameters<typeof shownNode>[1]} how */
function drawn(s, how) {
  const reveal = how.reveal ? () => how.reveal?.(s.path) : undefined;
  const url = (/** @type {string} */ type, download = false) => shownUrl(how.session, s, type, { download });
  if (s.kind === 'image') {
    return imageCard({
      url: url(s.type), name: s.title ?? s.name, width: s.width ?? undefined, height: s.height ?? undefined,
      lightbox: how.lightbox, workspace: reveal, download: url(s.type, true),
      vector: s.type === 'image/svg+xml',
    });
  }
  // 音视频在正文里直接播（同回答里单独一行的音视频地址）；网页软件照 Range 一段段给，拖得动进度
  if (s.kind === 'video') return videoCard({ url: url(blobType(s)), name: s.title ?? s.name });
  if (s.kind === 'audio') return audioCard({ url: url(blobType(s)), name: s.title ?? s.name, download: url(blobType(s), true) });
  const label = s.title ?? s.name;
  const sub = [t(`artifacts.types.${s.kind}`), s.size != null ? bytes(s.size) : null].filter(Boolean).join(' · ');
  const body = [h('span.shown-card-icon', icon(ICONS[s.kind] ?? 'file')), h('span.shown-card-text', h('span.shown-card-name', label), h('span.shown-card-sub', sub))];
  if (s.kind === 'file' || !reveal) {
    const link = h('a.shown-card', { title: t('artifacts.download_named', { name: s.name }), download: s.name }, ...body, h('span.shown-card-go', icon('download')));
    setUrl(link, 'href', url(blobType(s), true));
    return link;
  }
  return h('button.shown-card', { type: 'button', title: s.path, onclick: reveal }, ...body, h('span.shown-card-go', icon('panel-right')));
}

/**
 * 读不了的那一样：同一张卡片，小字写为什么（「文件已变」「文件已不在」），点不了。
 * @param {import('../model/artifacts.js').Shown} s @param {string} problem `file_changed`、`file_gone`
 */
function missingCard(s, problem) {
  return h('div.shown-card.is-missing', { title: s.path },
    h('span.shown-card-icon', icon('circle-alert')),
    h('span.shown-card-text', h('span.shown-card-name', s.title ?? s.name), h('span.shown-card-sub', t(`artifacts.${problem}`))));
}
