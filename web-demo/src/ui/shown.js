// @ts-check
//! 她 `show` 过的东西在正文里画成什么（蓝图 `web.md`「展示」；核心 D-5，设计 35 第三节；2026-10-17 项目主人定：画在正文里，和她发的图
//! 一样）：图片画缩略图（照回答里的图，点开是灯箱，灯箱里多「在右栏打开」）；别的画一张卡片：图标照种类、标题（没写的照文件名）、
//! 一行小字写种类和大小，点了在右栏打开；别的文件（右栏看不了的）点了下载，存成原来的名字。

import { h, icon, setUrl } from './dom.js';
import { t } from '../util/res.js';
import { bytes } from '../lib/format.js';
import { blobUrl } from '../core/host.js';
import { imageCard } from './media.js';
import { blobType } from './artifacts.js';

/** 卡片的图标照种类 */
const ICONS = /** @type {Record<string, string>} */ ({ html: 'globe', markdown: 'file-text', code: 'file-code', text: 'file-text', pdf: 'file', file: 'file' });

/**
 * 一样展示过的。
 * @param {import('../model/artifacts.js').Shown} s
 * @param {{lightbox?: () => any, reveal?: (path: string) => void}} how 现在的灯箱；在右栏打开它
 */
export function shownNode(s, how) {
  const reveal = how.reveal ? () => how.reveal?.(s.path) : undefined;
  if (s.kind === 'image') {
    return imageCard({
      url: blobUrl(s.blob, s.type), name: s.title ?? s.name, width: s.width ?? undefined, height: s.height ?? undefined,
      lightbox: how.lightbox, workspace: reveal, download: blobUrl(s.blob, s.type, { download: true, name: s.name }),
      vector: s.type === 'image/svg+xml',
    });
  }
  const label = s.title ?? s.name;
  const sub = [t(`artifacts.types.${s.kind}`), s.size != null ? bytes(s.size) : null].filter(Boolean).join(' · ');
  const body = [h('span.shown-card-icon', icon(ICONS[s.kind] ?? 'file')), h('span.shown-card-text', h('span.shown-card-name', label), h('span.shown-card-sub', sub))];
  if (s.kind === 'file' || !reveal) {
    const link = h('a.shown-card', { title: t('artifacts.download_named', { name: s.name }), download: s.name }, ...body, h('span.shown-card-go', icon('download')));
    setUrl(link, 'href', blobUrl(s.blob, blobType(s), { download: true, name: s.name }));
    return link;
  }
  return h('button.shown-card', { type: 'button', title: s.path, onclick: reveal }, ...body, h('span.shown-card-go', icon('panel-right')));
}
