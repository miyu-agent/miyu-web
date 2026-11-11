// @ts-check
//! 你说的话和她一轮末尾的按钮（蓝图 `web.md`「对话区」的「你的话的按钮」「编辑」「她的一轮的按钮」，照 Claude 网页端）。
//!
//! - 别人说的（别的账号、子代理、别的 harness、平台上的人，蓝图「不是你说的话」）：一样的气泡，上面一行小字写是谁，没有编辑。
//! - 你的话：悬停时气泡右下角下面出复制、编辑；编辑在气泡里直接改，改完这一轮照新的话重来。带的附件在气泡上面一排
//!   （蓝图「附件」第 6 条）：图片点开是灯箱，文件点了下载；只有附件、没有字的没有气泡，也没有复制。只给路径的（第 10 条）是一张
//!   带「仅路径」小标签的文件卡，不预览、不下载，点了请这台电脑的文件管理器打开它所在的文件夹（开不了的复制路径）。
//! - 她的一轮：收尾那一行后面一排复制、重做。
//! - 编辑、重做只有最新的那一轮有，在回答时没有：由对话区给节点打 `is-latest`、给整块打 `is-running`，CSS 藏。
//!   做什么由整页给（`app.js`），这里只画、接键。

import { h, icon, replace, setUrl } from './dom.js';
import { levelNodes } from './level-glyph.js';
import { res, t } from '../util/res.js';
import { leave } from '../lib/motion.js';
import { imageCard } from './media.js';
import { bytes } from '../lib/format.js';
import { blobUrl } from '../core/host.js';
import { shortSession } from '../model/words.js';
import { fitText } from '../model/entries.js';
import { skillPieces } from '../model/skills.js';

/**
 * @typedef {{copy: (text: string) => void, edit: (text: string) => void, copyTurn: (turn: number) => void, redo: () => void, openJobs: () => void, openSession: (id: string) => void, compacted?: (session: string|null) => void, reveal?: (path: string) => void, revealFile?: (path: string) => void, turnTools?: (turn: number) => Node[]}} Actions
 *   复制一段字；照改过的话重做最新的一轮；复制她这一轮说的全部正文；原样重做最新的一轮；打开后台任务的浮层；看另一个会话；
 *   在右栏打开她展示过的那一样；只给路径的附件点了在文件管理器里打开它所在的文件夹（`revealFile`，第 10 条）；收尾那一行软件包挂的
 *   按钮（挂载位 `turn.actions`，朗读这类，W-1128）
 * @typedef {{session: string|null, lightbox: () => any, mine?: boolean, titleOf?: (id: string) => string|null, skills?: Set<string>}} Media
 *   附件的地址照哪个会话取、现在的灯箱、是不是你说的、一个会话的标题（「来自「标题」」用）、能点名的技能（气泡里 `$名字` 着色，W-1124）
 * @typedef {{kind: 'image'|'file', blob: string, media_type: string, width: number|null, height: number|null, name: string|null, path?: string, path_only?: boolean, size?: number|null}} Attachment
 *   `path_only`：只给路径的（核心 AT-1，没有 `blob`），带 `path`、`size`
 */

/**
 * 你说的一句话：附件一排、靠右的气泡，下面悬停才露的按钮。
 * @param {{text: string, attachments?: Attachment[], speaker?: {kind: string, name: string, id?: string}}} it
 * @param {Actions} on
 * @param {Media} media
 */
export function userNode(it, on, media) {
  // 点了名的技能（`$名字`）照人打的字写、着色，不展开正文（蓝图「`$` 点名技能」第 4 条，W-1124）
  const said = media.skills?.size ? skillPieces(it.text, media.skills).map((p) => (p.skill ? h('span.user-skill', p.text) : p.text)) : it.text;
  const bubble = it.text ? h('div.user-bubble', said) : null;
  const edit = button('pencil', t('said.edit'), () => startEdit());
  edit.classList.add('is-edit');
  const mine = media.mine !== false;
  const actions = h('div.msg-actions.user-actions', it.text ? button('copy', t('said.copy'), () => on.copy(it.text)) : null, mine ? edit : null);
  const who = mine ? null : speakerNode(it.speaker, on, media);
  const node = h(`div.user-message${mine ? '' : '.is-other'}`, who, attachmentsNode(it.attachments ?? [], media, on), bubble, actions);

  // 编辑：气泡换成一个输入框，原话填好、全选；Enter 发、Shift+Enter 换行、Esc 取消
  const startEdit = () => {
    const box = /** @type {HTMLTextAreaElement} */ (h('textarea.edit-input', { rows: 1, spellcheck: 'false' }));
    box.value = it.text;
    const grow = () => {
      box.style.height = 'auto';
      box.style.height = `${box.scrollHeight}px`;
    };
    // 收起：输入框淡出，再换回气泡（蓝图「动效」）
    const stop = () => leave(editor, () => {
      if (bubble) editor.replaceWith(bubble);
      else editor.remove();
      node.classList.remove('is-editing');
    });
    const go = () => {
      const text = box.value.trim();
      if (!text) return;
      stop();
      on.edit(text);
    };
    const editor = h('div.user-edit', box,
      h('div.edit-bar',
        h('button.edit-cancel', { type: 'button', onclick: stop }, t('said.cancel')),
        h('button.edit-send', { type: 'button', onclick: go }, t('said.send'))));
    box.addEventListener('input', grow);
    box.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        go();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        stop();
      }
    });
    node.classList.add('is-editing');
    if (bubble) bubble.replaceWith(editor);
    else actions.before(editor);
    grow();
    box.focus();
    box.select();
  };
  return node;
}

/**
 * 收尾那一行，后面一排复制、重做。照常结束的带着短写法（`shorter`）：窄屏上和按钮排一行，放不下换短的（`fitNarrow`）。
 * @param {{text: string, tone: string, turn: number, shorter?: string[]}} it
 * @param {Actions} on
 */
export function endNode(it, on) {
  const redo = button('rotate-cw', t('said.redo'), () => on.redo());
  redo.classList.add('is-redo');
  // 打断的那一轮，后台还有在跑的：接一句，点了打开后台任务（蓝图「后台任务」第 6 条）
  const jobs = it.jobs ? h('button.turn-end-jobs', { type: 'button', onclick: () => on.openJobs() }, t('interrupted_jobs', { count: it.jobs })) : null;
  const text = h('span.turn-end-text', ...levelNodes(it.text), jobs);
  const actions = h('span.msg-actions.turn-actions', button('copy', t('said.copy'), () => on.copyTurn(it.turn)), ...(on.turnTools?.(it.turn) ?? []), redo);
  const fit = !!it.shorter?.length;
  const node = h(`div.turn-end.tone-${it.tone}${fit ? '.is-fit' : ''}`, text, actions);
  if (fit) fitNarrow(node, text, actions, [it.text, ...(it.shorter ?? [])]);
  return node;
}

/**
 * 收尾那一行在窄屏（`layout.json` 的 `narrow_below`）上先试一行（2026-11-03 项目主人，W-1082）：照先后换短的写法，挑第一个放得下的
 * （`fitText`：先去掉出字速度，再去掉用时）；最短的也放不下的折成几行写全，不截成 `…`（2026-11-11 项目主人：「无论如何都不应该省略成点点点」，
 * W-1154；原来 CSS 截掉）。写的是短的那种时点一下这行字换成全的（折行），再点换回去——手机上没有悬停看全的。宽屏照旧写全的。
 * 留给字的地方变了再挑一遍：这一行变宽变窄（转屏、开收左栏），后面的按钮多了少了（重做只有最新的一轮有、在回答时藏起来）；
 * 地方没变的不量（每一行都量要逼着重排）。
 * @param {HTMLElement} node @param {HTMLElement} text @param {HTMLElement} actions @param {string[]} texts 从全到短
 */
function fitNarrow(node, text, actions, texts) {
  const narrow = matchMedia(`(max-width: ${res.layout.narrow_below}px)`);
  let room = -1;
  const watch = new ResizeObserver(() => {
    const now = narrow.matches ? node.clientWidth - actions.offsetWidth : 0;
    if (now === room) return;
    room = now;
    draw();
  });
  /** 点开看全的 */
  let full = false;
  let shown = texts[0];
  const fill = (/** @type {string} */ s) => replace(text, ...levelNodes(s));
  const draw = () => {
    // 量的时候照一行排（`is-wrap` 是折行的样子）
    node.classList.remove('is-wrap');
    const fits = (/** @type {string} */ s) => { fill(s); return text.scrollWidth <= text.clientWidth; };
    shown = room > 0 && !full ? fitText(texts, fits) : texts[0];
    fill(shown);
    node.classList.toggle('is-wrap', room > 0 && text.scrollWidth > text.clientWidth);
    node.classList.toggle('is-short', room > 0 && (full || shown !== texts[0]));
    if (shown === texts[0]) text.removeAttribute('title');
    else text.title = texts[0];
  };
  text.addEventListener('click', () => {
    if (!(room > 0) || (!full && shown === texts[0])) return;
    full = !full;
    draw();
  });
  watch.observe(node);
  watch.observe(actions);
}

/**
 * 附件一排（蓝图「附件」第 6 条）：图片照宽高比先占好地方，最宽最高 `layout.json` 的 `user_media`，点开是灯箱；视频画第一帧、
 * 中间一个播放记号，点了原地换成带控制条的播放器；别的文件是一张小卡（图标照种类），点了经桥的 `/blob` 下载，存成原来的名字。
 * 取不出第一帧的视频照文件画。只给路径的（第 10 条）照 [`pathCard`]。没有附件的是 `null`。
 * @param {Attachment[]} list
 * @param {Media} media
 * @param {Actions} [on]
 */
function attachmentsNode(list, media, on) {
  if (!list.length) return null;
  return h('div.user-attachments', { style: `--user-media: ${res.layout.user_media}px` }, ...list.map((a) => {
    if (a.path_only || !a.blob) return pathCard(a, on);
    if (a.kind === 'image') {
      const url = blobUrl(a.blob, a.media_type);
      return imageCard({ url, name: a.name ?? '', width: a.width ?? undefined, height: a.height ?? undefined, lightbox: media.lightbox });
    }
    const card = fileCard(a);
    return /^video\//.test(a.media_type) ? videoThumb(a, card) : card;
  }));
}

/** 文件的卡（和框里的一样大，蓝图「附件」第 6 条）：名字、一行小字写媒体类型，左下角扩展名大写（没有扩展名的不写）。 */
function fileCard(a) {
  const name = a.name ?? a.blob;
  const dot = name.lastIndexOf('.');
  const card = h('a.user-file', {
    title: t('said.download', { name }),
    download: '',
  },
  h('span.user-file-name', name),
  h('span.user-file-sub', a.media_type ?? ''),
  dot > 0 ? h('span.user-file-ext', name.slice(dot + 1).toUpperCase()) : null);
  setUrl(card, 'href', blobUrl(a.blob, a.media_type, { download: true, name }));
  return card;
}

/**
 * 只给路径的附件（蓝图「附件」第 10 条，核心 AT-1）：和文件一样的卡，名字、一行小字写大小（不知道的不写），左下角扩展名、右下角「仅路径」；
 * 悬停写路径。没有内容可看、可下：点了在这台电脑的文件管理器里打开它所在的文件夹（`on.revealFile`，没给的点不了）。
 * @param {Attachment} a @param {Actions} [on]
 */
export function pathCard(a, on) {
  const path = a.path ?? '';
  const name = a.name ?? (path.split(/[\\/]/).filter(Boolean).pop() || path);
  const dot = name.lastIndexOf('.');
  const can = !!on?.revealFile && !!path;
  return h(`${can ? 'button' : 'div'}.user-file.is-path`, {
    ...(can ? { type: 'button', onclick: () => on?.revealFile?.(path) } : {}),
    title: path ? `${name}\n${path}` : name,
  },
  h('span.user-file-name', name),
  h('span.user-file-sub', typeof a.size === 'number' ? bytes(a.size) : ''),
  dot > 0 ? h('span.user-file-ext', name.slice(dot + 1).toUpperCase()) : null,
  h('span.user-file-tag', t('said.path_only')));
}

/** 视频：第一帧加一个播放记号，点了原地换成带控制条的播放器；取不出第一帧的换成文件的小卡。 */
function videoThumb(a, card) {
  const url = blobUrl(a.blob, a.media_type);
  const video = /** @type {HTMLVideoElement} */ (h('video', { muted: true, preload: 'metadata', playsinline: true }));
  setUrl(video, 'src', url, '#t=0.1');
  const node = h('div.user-video', { role: 'button', tabindex: '0', title: a.name ?? '' }, video, h('span.user-video-play', icon('play')));
  video.addEventListener('error', () => node.replaceWith(card), { once: true });
  const play = () => {
    const player = h('video.user-video-player', { controls: true, autoplay: true, playsinline: true });
    setUrl(player, 'src', url);
    node.replaceWith(player);
  };
  node.addEventListener('click', play);
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    play();
  });
  return node;
}

/**
 * 气泡上面那一行小字：是谁说的。子代理的会话里派它的会话发来的，写「来自「标题」」、后面一个小箭头，点了回到那个会话（蓝图「不是你
 * 说的话」）；标题拿不到的写「派它的会话」。别的会话发来的写「从会话 短编号「标题」收到消息」，会话表里有它的才带箭头、能点开；
 * 没标题的不写「」（2026-10-01 项目主人定，照终端）。
 */
function speakerNode(speaker, on, media) {
  const id = speaker?.id;
  if ((speaker?.kind !== 'parent' && speaker?.kind !== 'session') || !id) return h('div.user-speaker', speaker?.name ?? '');
  const title = media.titleOf?.(id) ?? null;
  if (speaker.kind === 'session' && !title) return h('div.user-speaker', speaker.name);
  const text = speaker.kind === 'parent'
    ? (title ? t('said.from', { title }) : speaker.name)
    : t('said.from_session', { id: shortSession(id), title });
  return h('button.user-speaker.is-link', { type: 'button', title: title ?? speaker.name, onclick: () => on.openSession(id) },
    h('span.user-speaker-text', text), icon('arrow-up-right'));
}

/** 一个图标按钮：名字写在 `title`、`aria-label` 里。 */
function button(name, label, onclick) {
  return h('button.msg-action', { type: 'button', title: label, 'aria-label': label, onclick }, icon(name));
}
