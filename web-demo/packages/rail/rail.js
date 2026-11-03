// @ts-check
//! 右边的跳转条（蓝图 `web.md`「右边的跳转条」，照 ChatGPT 网页端）：你说的一句话一条短横线，正在看的那条亮；指针靠近
//! 弹出一个浮层列出每一句，点哪句平滑滚到哪句（浮层照样开着，指针离开才收）。哪一句算正在看的由 `reading.js` 算。
//! 任何宽度都画（窄屏、预览工作区开着、右栏开着缝放不下时也画，贴着对话区右边缘；2026-10-24 项目主人）。数都是这个包的设置项（清单）。
//! 列这个会话里你问过的全部（W-1069，核心 SP-2 的 `session.prompts`，`listed.js` 拼）：画出来的句子变了（换了会话、说了新的、撤销、重做）
//! 再问一次；没读进来的那一句点了先往前读到它（`chat.reach`），画出来再滚过去。

import { h, offsetIn } from '../../src/lib/dom.js';
import { reading } from './reading.js';
import { listed } from './listed.js';

/**
 * @typedef {{min_prompts: number, current_at: number, jump_margin: number, close_ms: number}} Config 这个包的设置项
 * @typedef {import('./listed.js').Shown} Shown
 * @typedef {import('./listed.js').Asked} Asked
 * @typedef {import('./listed.js').Listed} Listed
 * @typedef {{scroller: HTMLElement, current: () => string|null, reach: (seq: number) => Promise<boolean>}} Chat 对话区（服务 `chat`）
 * @typedef {{request: (method: string, params: any) => Promise<any>}} Core
 */

/** 画出来的句子变了以后等多久再问核心（连着变的只问一次） */
const ASK_AFTER_MS = 250;

export class PromptRail {
  /**
   * @param {Chat} chat
   * @param {Core} core
   * @param {Config} config
   */
  constructor(chat, core, config) {
    this.config = config;
    this.chat = chat;
    this.scroller = chat.scroller;
    this.core = core;
    /** @type {Shown[]} 对话区画出来的 */
    this.shown = [];
    /** @type {{session: string, prompts: Asked[]|null}|null} 核心列的、是哪个会话的（问不到的 `prompts` 是 `null`） */
    this.asked = null;
    /** @type {Listed[]} */
    this.prompts = [];
    this.drawn = '';
    this.shownSig = '';
    this.current = -1;
    this.closeTimer = 0;
    this.askTimer = 0;
    this.asking = 0;
    /** @type {Set<string>} 核心不认 `session.prompts` 的会话：不再问 */
    this.unsupported = new Set();
    /** @type {number|null} 点了没读进来的那一句：画出来了再滚过去 */
    this.want = null;
    this.lines = h('div.rail-lines');
    this.list = h('div.rail-list', { role: 'menu' });
    this.pop = h('div.rail-pop', this.list);
    this.el = h('nav.prompt-rail', { hidden: true }, this.pop, this.lines);
    // 指针进这一列或浮层：弹出；离开：过一小会儿收起，在两者之间挪不算离开
    this.el.addEventListener('mouseenter', () => this.show(true));
    this.el.addEventListener('mouseleave', () => this.show(false));
    let frame = 0;
    this.onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; this.mark(); });
    };
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    // 换宽、换高以后哪一句算正在看的会变
    this.watch = new ResizeObserver(() => this.mark());
    this.watch.observe(this.scroller);
  }

  /**
   * 对话区画完了一次：交来画出来的句子。句子变了（序号）过一小会儿再问核心；点过的那一句画出来了就滚过去。
   * @param {Shown[]} shown
   */
  update(shown) {
    this.shown = shown;
    const sig = `${this.chat.current() ?? ''}|${shown.map((p) => p.seq).join(',')}`;
    if (sig !== this.shownSig) {
      this.shownSig = sig;
      clearTimeout(this.askTimer);
      this.askTimer = window.setTimeout(() => this.ask(), ASK_AFTER_MS);
    }
    this.redraw();
    if (this.want != null) this.reached();
  }

  /** 问核心这个会话里你问过的全部（`session.prompts`）：问的时候换了会话、又问了一次的，回来的不要。不认的记下，这个会话不再问。 */
  async ask() {
    const session = this.chat.current();
    const run = ++this.asking;
    if (!session || this.unsupported.has(session)) {
      this.asked = null;
      this.redraw();
      return;
    }
    let prompts = null;
    try {
      const got = await this.core.request('session.prompts', { session });
      prompts = Array.isArray(got?.prompts) ? got.prompts.filter((/** @type {any} */ p) => Number.isInteger(p?.seq)) : null;
    } catch (err) {
      // 旧核心（没有这个方法）照画出来的列；别的错（会话删了、连接断了）这一次照画出来的，下次句子变了再问
      const e = /** @type {any} */ (err);
      if (e?.code === -32601 || e?.reason === 'unknown_method' || e?.data?.reason === 'unknown_method') this.unsupported.add(session);
    }
    if (run !== this.asking || session !== this.chat.current()) return;
    this.asked = { session, prompts: prompts?.map((p) => ({ seq: p.seq, text: String(p.text ?? '') })) ?? null };
    this.redraw();
  }

  /** 照核心列的、画出来的拼一份；句子变了才重排横线和浮层。 */
  redraw() {
    const session = this.chat.current();
    const asked = this.asked?.session === session ? this.asked.prompts : null;
    this.prompts = listed(asked, this.shown);
    // 画不画只看句子够不够（`rail.min_prompts`）
    this.el.hidden = this.prompts.length < this.config.min_prompts;
    const sig = JSON.stringify(this.prompts.map((p) => [p.seq, p.text]));
    if (sig !== this.drawn) {
      this.drawn = sig;
      this.current = -1;
      this.lines.replaceChildren(...this.prompts.map((p) => h('button.rail-line', { type: 'button', 'aria-label': p.text, onclick: () => this.jump(p.seq) })));
      this.list.replaceChildren(...this.prompts.map((p) => h('button.rail-item', { type: 'button', role: 'menuitem', title: p.text, onclick: () => this.jump(p.seq) }, oneLine(p.text))));
    }
    this.mark();
  }

  /** 照现在滚到哪，亮正在看的那一句（没读进来的都在读进来的上面）；横线多过这一列放得下的，亮的那条露在中间。 */
  mark() {
    if (this.el.hidden) return;
    const tops = this.prompts.map((p) => (p.node ? offsetIn(p.node, this.scroller) : -Infinity));
    const now = reading(tops, this.scroller.clientHeight, this.config.current_at);
    if (now === this.current) return;
    this.current = now;
    [...this.lines.children].forEach((el, i) => el.classList.toggle('is-current', i === now));
    [...this.list.children].forEach((el, i) => el.classList.toggle('is-current', i === now));
    const line = /** @type {HTMLElement|undefined} */ (this.lines.children[now]);
    if (line && this.lines.scrollHeight > this.lines.clientHeight) {
      this.lines.scrollTop = line.offsetTop - this.lines.offsetTop - (this.lines.clientHeight - line.offsetHeight) / 2;
    }
  }

  /** 弹出、收起浮层（CSS 照 `is-open` 淡入淡出）；弹出时正在看的那一句滚进视野。 */
  show(yes) {
    clearTimeout(this.closeTimer);
    if (yes) {
      if (!this.pop.classList.contains('is-open')) this.list.children[this.current]?.scrollIntoView({ block: 'nearest' });
      this.pop.classList.add('is-open');
      return;
    }
    this.closeTimer = window.setTimeout(() => this.pop.classList.remove('is-open'), this.config.close_ms);
  }

  /**
   * 跳到序号 `seq` 的那一句：画出来了的平滑滚过去，它的顶离视口顶 `rail.jump_margin`（算人滚的，`follow.js` 照滚动事件认）；没读进来的先往前读，
   * 画出来了再滚（`reached`）。读不到的（没有更早的了、换了会话）不动。
   * @param {number} seq
   */
  jump(seq) {
    const p = this.prompts.find((x) => x.seq === seq);
    if (!p) return;
    if (p.node) {
      this.want = null;
      this.scrollTo(p.node);
      return;
    }
    this.want = seq;
    this.chat.reach(seq).then((got) => {
      if (!got && this.want === seq) this.want = null;
      else if (this.want === seq) this.reached();
    }, () => {
      if (this.want === seq) this.want = null;
    });
  }

  /**
   * 点过的那一句画出来了：滚过去。等两帧再滚：更早的一页刚接在前面，这一帧里正文还要照原来看着的地方把 `scrollTop` 放回去，
   * 那一下会把平滑滚动掐掉（2026-11-03 实测：叫了滚动，一动没动）。
   */
  reached() {
    const p = this.shown.find((x) => x.seq === this.want);
    if (!p) return;
    this.want = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (p.node.isConnected) this.scrollTo(p.node);
    }));
  }

  /** @param {HTMLElement} node */
  scrollTo(node) {
    const top = this.scroller.scrollTop + offsetIn(node, this.scroller) - this.config.jump_margin;
    this.scroller.scrollTo({ top, behavior: 'smooth' });
  }

  /** 不画了：停掉量尺寸的、收起的、等着问核心的计时。 */
  dispose() {
    this.scroller.removeEventListener('scroll', this.onScroll);
    this.watch.disconnect();
    clearTimeout(this.closeTimer);
    clearTimeout(this.askTimer);
    this.asking += 1;
  }
}

/** 浮层里一行：换行压成空格，放不下的由 CSS 截掉加 `…`。 */
function oneLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}
