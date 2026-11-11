// @ts-check
//! 附件（软件包 `attachments`，蓝图 `web.md`「附件」）：输入框里放图片和文件，跟着话一起发。
//!
//! - 放进来：回形针按钮（挂进 `composer.bar`，只在用手指点的设备上露，`style.css`）打开选文件；把文件拖进窗口（整页盖一层，正中一个文件加号和一句话，在哪松开都收，
//!   照 Claude 网页端）；在输入框里粘贴文件。
//!   选文件、拖放、缩略图都经宿主（服务 `host` 的 `files`，蓝图 `web/architecture.md`「宿主」）：浏览器给内容，桌面端给路径。
//! - 传：有本机路径的（`@` 选文件交过来的、桌面端）直接 `blob.put` 的 `path`；只有内容的（浏览器）分块传给核心
//!   （`blob.open`、`blob.write`、`blob.close`，核心施工 W-5，`src/lib/upload.js`），字节由宿主读（`files.read`）。
//! - 原来的路径（第 2 条的子条目，2026-11-11 项目主人定）：浏览器不给拖进来、选进来的文件的路径，传的同时请网页软件在这台电脑上照名字、大小、
//!   改的时刻找一找（宿主的 `files.locate`，只认改的时刻也对得上的），找到了记在这一块上、发的时候带 `path`：她看得到原文件在哪，能直接改它。
//! - 只给路径（第 10 条，2026-11-11 项目主人定，核心 AT-1）：超过上限的、传完核心嫌大的（图片超过 5 MiB、一边超过 8000 像素）不传内容，
//!   照样进框里，请网页软件找它在这台电脑上的哪儿（不认改的时刻也行，最多找 10 秒），找到了发的时候只交路径；没找到的等人贴路径。页面
//!   开在别的设备上的（文件不在核心那台电脑上）照旧不收。
//! - 框里那一排挂进 `composer.head`（`tray.js`）；发的时候经 `composer.payload` 交出去，核心拒了放回来（`model.js` 的 `Tray`）；
//!   记进输入历史的是核心存好的那一份，翻出来的照它回到框里（蓝图「输入历史」）。
//!
//! 停用了按钮、那一排、拖放都没了，框里没发的附件丢掉。

import { h, icon } from '../../src/lib/dom.js';
import { show, hide } from '../../src/lib/motion.js';
import { Tray, admit, mediaType, attachable, findable, withoutPaths } from './model.js';
import { TrayView } from './tray.js';
import { upload, serial } from '../../src/lib/upload.js';

/** @param {any} ctx */
export function apply(ctx) {
  const t = (path, fields) => ctx.text(path, fields);
  const tray = new Tray();
  const files = ctx.host.files;
  /** 这台电脑上能不能找文件在哪：能的话太大的只给路径，不能的照旧不收 */
  const local = () => !!files.local?.();
  const home = () => ctx.chat?.home?.() ?? null;
  const view = new TrayView(tray, t, (id) => tray.remove(id), files, ctx.config, {
    // 人贴了路径：写法不对的说一句
    fill: (id, text) => {
      const ok = tray.fill(id, text, home());
      if (!ok) ctx.composer.say(t('bad_path'));
      return ok;
    },
  });
  ctx.effect(() => () => view.destroy());
  ctx.effect(() => tray.watch(() => ctx.composer.changed()));

  // 分块传的一个接一个（核心一条连接同时开的上传有上限）
  const queue = serial();
  /**
   * 这个文件原来在这台电脑上的哪儿：请网页软件找（先看这个会话的工作区），找到了记在这一块上。只有内容、带着改的时刻的才找
   * （`findable`）；找不了、没找到的就不带，不提示。
   */
  const locate = (/** @type {import('./model.js').Item} */ item) => {
    if (!files.local?.() || !findable(item.file, Date.now())) return;
    const near = [ctx.chat?.workdir?.()].filter((dir) => typeof dir === 'string' && dir);
    files.locate({ name: item.name, size: item.size, modified: item.file.modified, near, exact: true })
      .then((/** @type {string|null} */ path) => { if (path) tray.located(item.id, path); }, () => {});
  };

  /** 只给路径的那一块在哪：请网页软件找（先看这个会话的工作区，最多 `seek_ms`），找到没找到都记上。 */
  const seek = (/** @type {import('./model.js').Item} */ item) => {
    if (item.state !== 'locating') return;
    const near = [ctx.chat?.workdir?.()].filter((dir) => typeof dir === 'string' && dir);
    files.locate({ name: item.name, size: item.size, modified: item.file.modified, near, wait: ctx.config.seek_ms })
      .then((/** @type {string|null} */ path) => tray.found(item.id, path), () => tray.found(item.id, null));
  };

  /** 传一个：有路径的核心照路径存，只有内容的分块传（同时找它原来在哪）；出错的那一块拿掉，提示一句。 */
  const put = async (/** @type {import('./model.js').Item} */ item) => {
    const type = mediaType(item.file.type);
    const request = (method, params) => ctx.core.request(method, params);
    locate(item);
    try {
      const path = item.file.path;
      const got = path
        ? await request('blob.put', type ? { path, media_type: type } : { path })
        : await queue(() => upload(request, { name: item.name, size: item.size }, type, (offset, length) => files.read(item.file, offset, length),
          { chunk: ctx.config.chunk_bytes, tries: ctx.config.resume_tries }));
      tray.ready(item.id, got);
    } catch (err) {
      // 核心嫌大（图片另有上限）：这台电脑上能找的改成只给路径，不拿掉
      const big = /** @type {any} */ (err)?.reason === 'attachment_too_big' && local() ? tray.overflow(item.id) : null;
      if (big) seek(big);
      else if (tray.remove(item.id)) ctx.composer.say(t('failed', { name: item.name, reason: reasonOf(err, t) }));
    }
  };

  /**
   * 放进来几个：放不下的不收，提示；收下的一个个传。超过上限的：这台电脑上能找的照样收、只给路径（去找它在哪）；页面开在别的设备上的
   * 不收，说明白为什么。
   */
  const take = (/** @type {import('./model.js').FileLike[]} */ list) => {
    if (!list.length) return;
    const r = admit(tray.items.length, list, ctx.config, local());
    for (const f of r.tooBig) ctx.composer.say(t(files.elsewhere?.() ? 'too_big_remote' : 'too_big', { name: f.name, mib: ctx.config.max_mib }));
    if (r.tooMany) ctx.composer.say(t('too_many', { max: ctx.config.max_files }));
    for (const f of r.accepted) put(tray.add(f));
    for (const f of r.oversize) seek(tray.addBare(f));
    ctx.composer.focus();
  };

  // 回形针：打开系统的选文件，能多选
  const button = h('button.icon-button.attach-button', { type: 'button', title: t('attach'), 'aria-label': t('attach'), onclick: async () => take(await files.pick()) }, icon('paperclip'));
  ctx.slots.mount('composer.bar', { id: 'attachments', order: 10, render: () => h('span.attach-tools', button) });
  ctx.slots.mount('composer.head', { id: 'attachments', order: 10, render: () => view.el });
  ctx.slots.mount('composer.payload', {
    id: 'attachments',
    order: 10,
    render: () => null,
    has: () => tray.has(),
    busy: () => tray.busy(),
    // 只是在找文件位置（没有在传的）：按了发送说的那一句另写，不说「上传中」
    busyText: () => (tray.seeking() ? t('locating_wait') : null),
    // 有一块还没有路径（没找到、人还没贴）：发不出去，说是哪一块。页面开在别的设备上、框里却有只给路径的（输入历史翻出来的、
    // 撤销放回来的）：核心不收远程连接带路径的附件（`local_machine_only`），先说明白
    blocked: () => {
      const lost = tray.pathless();
      if (lost != null) return t('need_path', { name: lost });
      const bare = files.elsewhere?.() ? tray.bareName() : null;
      return bare == null ? null : t('need_local', { name: bare });
    },
    // 页面开在别的设备上：有内容的附件不带原来的路径（核心整条拒 `local_machine_only`）
    take: () => (files.elsewhere?.() ? withoutPaths(tray.take()) : tray.take()),
    putBack: (given) => tray.putBack(given),
    // 输入历史（蓝图「输入历史」第 1、2 条）：交出去的记成核心存好的那一份；翻出来的换上、走回没发的那句拿掉；改了字留下
    keep: (given) => tray.keep(given),
    recall: (saved) => tray.recall(saved?.kept ?? null, saved?.session ?? null),
    settle: () => tray.settle(),
    // 切会话（W-1137）：这一排收起来跟着原来的会话，切回来放回去
    stow: () => tray.stow(),
    unstow: (/** @type {any} */ row) => tray.unstow(row),
    // 光标在最前面按退格：拿掉最后一张（蓝图「附件」第 3 条）
    dropLast: () => tray.dropLast(),
    // 一句话太长、发不出去的（施工 YC-11，蓝图「附件」第 4 条）：输入框交过来的字转成一个文字附件放进框里，收下了交 `true`；
    // 放不下（超过 `max_mib`、框里满了）的交 `false`，字留在框里
    adopt: (/** @type {string} */ text, /** @type {string} */ name) => {
      const [ref] = files.refs([new File([text], name, { type: 'text/plain' })]);
      const r = admit(tray.items.length, ref ? [ref] : [], ctx.config);
      if (!r.accepted.length) return false;
      put(tray.add(r.accepted[0]));
      return true;
    },
    // `@` 选文件交过来的（蓝图「`@` 选文件」第 5 条）：图片、PDF、音频、视频收下（本机的路径直接交给核心存），交回不收的
    offer: (refs) => {
      const mine = refs.filter(attachable);
      take(mine);
      return refs.filter((r) => !mine.includes(r));
    },
  });

  // 粘贴：粘的是文件（截图）的收下，是字的照旧
  const onPaste = (/** @type {ClipboardEvent} */ e) => {
    const pasted = files.refs(e.clipboardData?.files ?? []);
    if (!pasted.length) return;
    e.preventDefault();
    take(pasted);
  };
  const input = ctx.composer.input;
  input.addEventListener('paste', onPaste);
  ctx.effect(() => () => input.removeEventListener('paste', onPaste));

  // 拖进来（第 1 条）：文件一拖进窗口，整页盖一层（页面淡成几乎看不清），正中一个文件加号和一句话；在哪松开都收（宿主分辨拖的
  // 是不是文件）；拖出窗口、松开以后淡出。这一层挂在 `body` 上盖住整页，不接鼠标
  const layer = h('div.attach-drop', { hidden: true }, h('div.attach-drop-card', icon('file-plus'), h('span.attach-drop-text', t('drop_here'))));
  document.body.append(layer);
  const unwatch = files.watchDrop(document.body, {
    enter: () => show(layer),
    over: () => {},
    leave: () => hide(layer),
    drop: take,
  });
  ctx.effect(() => () => {
    unwatch();
    layer.remove();
  });
}

/** 出错的原因：核心拒的照原因码查这个包的字，查不到的、桥不收的写原话。 */
function reasonOf(err, t) {
  const code = err?.reason;
  const known = code ? t(`reasons.${code}`) : null;
  return known && known !== `reasons.${code}` ? known : err?.message ?? String(err);
}
