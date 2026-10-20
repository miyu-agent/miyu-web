// @ts-check
//! 人叫的整理那一块（蓝图 `web.md`「记忆页」第 13 条）：头一行、五行滚动区、下面一条星空（`stars.js`；2026-10-20 项目主人看过几版样板定的，
//! 原来的光点、日月舞台和吉祥物不要了）。记忆页的「整理」、`/dream` 都用它。数据照 `dream-model.js`。
//! 合完了（或者叫停了，核心 R-22）收成结果那一行（`receipt`），点开列这一趟真正存下的。

import { h, icon } from '../../src/lib/dom.js';
import { clock } from '../../src/lib/format.js';
import { DreamTrack } from './dream-model.js';
import { Sky } from './stars.js';

/** 滚动区留几行（多的从上面拿掉：看得见的是五行，上面两行淡出） */
const KEEP = 7;
/** 合完以后那一块留多久再收成结果那一行（光点淡下去，再看一会儿） */
export const SETTLE_MS = 3000;

export class DreamCard {
  /**
   * @param {any} ctx `memory` 包的 ctx
   * @param {Map<string, string>} texts 记忆编号 → 正文（打开时读的那一份；滚动区照它写）
   * @param {{stop?: () => Promise<void>}} [opts] 头一行右边的「停止」叫停这一趟（核心 R-23 的 `memory.dream_stop`；人叫的整理才有）
   */
  constructor(ctx, texts, opts = {}) {
    this.ctx = ctx;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.texts = texts;
    this.track = new DreamTrack();
    this.finished = false;
    /** 叫停了（`memory.dream` 回了 `stopped`）：收成「整理已中断」 */
    this.stopped = false;
    this.doneAt = 0;
    this.dots = new Sky();
    this.startedAt = performance.now();
    /** 合完的回应（结果那一行照它写） @type {any} */
    this.got = null;
    /** 摘要那一行（同一行跟着改） @type {HTMLElement|null} */
    this.summaryLine = null;
    this.title = h('b', this.t('dream.running'));
    this.batch = h('span.dream-batch');
    this.tally = h('span.dream-tally');
    /** 「1m 20s」：整理了多久，每秒走一下，合完停住 */
    this.time = h('span.dream-time');
    this.second = -1;
    /** 「停止」：点了写「正在停止…」、灰着；叫停成了等回应收成「整理已中断」，没成的（已经合完了）照原样 */
    this.stopBtn = opts.stop ? h('button.dream-stop', {
      type: 'button',
      onclick: async () => {
        const btn = /** @type {HTMLButtonElement} */ (this.stopBtn);
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = this.t('dream.stopping');
        await opts.stop?.();
        if (!this.finished) {
          btn.disabled = false;
          btn.textContent = this.t('dream.stop');
        }
      },
    }, this.t('dream.stop')) : null;
    this.list = h('div.dream-feed-list');
    this.canvas = /** @type {HTMLCanvasElement} */ (h('canvas.dream-sky', { 'aria-hidden': 'true' }));
    this.el = h('section.dream-card', { 'aria-live': 'polite' },
      h('div.dream-head', this.title, this.batch, this.time, this.tally, this.stopBtn),
      h('div.dream-feed', this.list),
      this.canvas);
    // 进场的动画只放一次：记忆页每次重画都把这一块拿出来再放回去，CSS 动画会从头再放（看着闪一下；2026-10-20 项目主人：点整理、整理完卡片会闪）
    this.el.addEventListener('animationend', (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      if (el === this.el && !el.classList.contains('is-leaving')) el.classList.add('is-in');
      else if (el.classList?.contains('dream-line')) el.classList.add('is-in');
    });
    this.g = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));
    // 输入框上那只跟着一起睡（2026-10-20 项目主人：一起睡），合完了醒
    this.sleeping = true;
    ctx.mascot?.sleep?.(true);
    this.frame = 0;
    this.sync();
    const tick = (/** @type {number} */ now) => {
      if (this.el.isConnected) {
        this.fit();
        this.draw(now);
        this.clock(now);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** 不要了：停掉动画；还睡着的叫醒 */
  dispose() {
    cancelAnimationFrame(this.frame);
    this.wake();
  }

  /** 叫醒输入框上那只（只叫一次） */
  wake() {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.ctx.mascot?.sleep?.(false);
  }

  /**
   * 推送：记忆日志新的一行（`memory.event`）、模型写出来的一条决定（`memory.dreaming`）。
   * @param {string} method @param {any} params
   */
  push(method, params) {
    const lines = method === 'memory.event' ? this.track.logged(params?.event) : method === 'memory.dreaming' ? this.track.dreaming(params) : [];
    for (const line of lines) this.say(line);
    // 一批合完了：留下的点就地连起来
    if (method === 'memory.event' && params?.event?.kind === 'ext.memory.merged') this.dots.settle(performance.now());
    if (lines.length || method === 'memory.event') this.sync();
  }

  /**
   * 合完了（`memory.dream` 的回应）：光点慢慢淡下去，头一行换成结果；叫停了的（`stopped`，核心 R-22）写「整理已中断」。输入框上那只醒过来。
   * @param {{given?: number, revised?: number, retired?: number, stopped?: boolean}} got
   */
  finish(got) {
    this.finished = true;
    this.got = got ?? {};
    this.stopped = got?.stopped === true;
    this.doneAt = performance.now();
    // 合完一圈一圈点亮（叫停的不亮）
    if (!this.stopped) {
      this.dots.settle(this.doneAt);
      this.dots.finish(this.doneAt);
    }
    this.stopBtn?.remove();
    setTimeout(() => this.wake(), 450);
    this.title.textContent = this.t(this.stopped ? 'dream.stopped_title' : 'dream.done');
    this.batch.textContent = this.counted() ? this.t('dream.result', { parts: this.parts() }) : '';
    this.tally.textContent = '';
    this.sync();
  }

  /** 合完了的有没有数可写（叫停在头一批里的什么都没合完） */
  counted() {
    const g = this.got ?? {};
    return !this.stopped || (g.given ?? 0) + (g.revised ?? 0) + (g.retired ?? 0) > 0;
  }

  /** 「检查 N 条，修改 N 条，作废 N 条」：0 条的不写（2026-10-20 项目主人：0 条的就不用显示了） */
  parts() {
    const g = this.got ?? {};
    return /** @type {[string, number][]} */ ([['part_given', g.given ?? 0], ['part_revised', g.revised ?? 0], ['part_retired', g.retired ?? 0]])
      .filter(([, n]) => n > 0).map(([k, n]) => this.t(`dream.${k}`, { n })).join(this.t('dream.sep'));
  }

  /**
   * 结果那一句（同核心 `/dream` 的回执）：合完的「整理完成：检查…」，叫停的「整理已中断：…其余下次再整理。」，一批都没合完的「整理已中断，下次再整理。」；
   * 后面接用了多久（同一天项目主人：没有时间）。
   */
  resultText() {
    const took = clock(Math.max(1, Math.round(((this.doneAt || performance.now()) - this.startedAt) / 1000)));
    const text = !this.stopped ? this.t('dreamed', { parts: this.parts() })
      : this.counted() ? this.t('dream.stopped', { parts: this.parts() }) : this.t('dream.stopped_none');
    return `${text} · ${took}`;
  }

  /**
   * 收成结果那一行（2026-10-20 项目主人在终端定的，网页照着）：暗色 ✦ 打头的一行；这一趟有改、删、摘要的能点开，列日志里真正存下的
   * （写法同滚动区，摘要写全文）。只在这一次打开的正文里，不进会话记录。
   */
  receipt() {
    const items = this.track.saved;
    const text = (/** @type {string} */ id) => this.texts.get(id) ?? id;
    const t = this.t;
    const tag = (/** @type {string} */ kind) => h(`span.dream-k.is-${kind}`, t(`dream.k.${kind}`));
    const list = h('div.dream-receipt-list', { hidden: true }, items.map((s) => {
      if (s.kind === 'new') return h('div.dream-receipt-item', tag('new'), h('span', h('s', text(s.id)), ' → ', s.text));
      if (s.kind === 'del') {
        const label = s.retire ? t(`dream.retire.${s.retire}`) : null;
        return h('div.dream-receipt-item', tag('del'), h('span', h('s', text(s.id)), label ? h('span.dream-why', ` · ${label}`) : null, s.kept ? h('span.dream-why', ` · ${t('dream.kept', { text: text(s.kept) })}`) : null));
      }
      return h('div.dream-receipt-item', tag('sum'), h('span.dream-receipt-summary', s.text));
    }));
    // 正文里的写成提示行的样子（同「后台任务完成」那一行：缩进、字号、上下间距一样；2026-10-20 项目主人：间距和那类输出不一样）
    const head = h(`div.dream-receipt-head.note-line.tone-module${items.length ? '.is-link' : ''}`, items.length ? { role: 'button', tabindex: '0', 'aria-expanded': 'false' } : null,
      h('span.note-mark', '✦'), h('span.note-text.dream-receipt-text', this.resultText()), items.length ? h('span.dream-receipt-arrow', icon('chevron-right')) : null);
    const box = h('div.note.dream-receipt', head, list);
    if (items.length) {
      const toggle = () => {
        list.hidden = !list.hidden;
        box.classList.toggle('is-open', !list.hidden);
        head.setAttribute('aria-expanded', String(!list.hidden));
      };
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggle();
      });
    }
    return box;
  }

  /** 头一行的用时：每秒走一下，合完停住（2026-10-20 项目主人：前面的「做梦中… · 」删掉） @param {number} now */
  clock(now) {
    if (this.finished) return;
    const sec = Math.floor((now - this.startedAt) / 1000);
    if (sec === this.second) return;
    this.second = sec;
    this.time.textContent = clock(sec);
  }

  /** 头一行（只重看旧记忆的批写「重看 N 条旧记忆」，没有「合了 / 一共」可数） */
  sync() {
    const tr = this.track;
    if (this.finished) return;
    const planned = tr.planned();
    this.batch.textContent = !tr.batches ? '' : !tr.total ? this.t('dream.sweep', { n: tr.given })
      : planned && planned > 1 ? this.t('dream.batch_of', { n: tr.batches, m: planned }) : this.t('dream.batch', { n: tr.batches });
    this.tally.textContent = this.t('dream.tally', tr.tally);
  }

  /** 浮过一行 @param {import('./dream-model.js').Line} line */
  say(line) {
    const t = this.t;
    const text = (/** @type {string} */ id) => this.texts.get(id) ?? id;
    const tag = (/** @type {string} */ kind) => h(`span.dream-k.is-${kind}`, t(`dream.k.${kind}`));
    if (line.kind === 'sum' && this.summaryLine) {
      const body = this.summaryLine.querySelector('.dream-t');
      if (body) body.textContent = line.done ? t('dream.summary_done') : t('dream.summary', { n: line.chars });
      return;
    }
    let row;
    if (line.kind === 'read') row = h('div.dream-line.is-read', tag('read'), h('span.dream-t', text(line.id)));
    else if (line.kind === 'batch') row = h('div.dream-line.is-read', tag('read'), h('span.dream-t', t('dream.batch_read', { n: line.count })));
    else if (line.kind === 'new') row = h('div.dream-line', tag('new'), h('span.dream-t', h('s', text(line.id)), ' → ', line.text));
    else if (line.kind === 'del') {
      const label = line.retire ? t(`dream.retire.${line.retire}`) : null;
      // 为什么和类别说的一样的（「用不着」）不写两遍
      const why = [label, line.why && line.why !== label ? line.why : null, line.kept ? t('dream.kept', { text: text(line.kept) }) : null].filter(Boolean).join(' · ');
      row = h('div.dream-line', tag('del'), h('span.dream-t', h('s', text(line.id)), why ? h('span.dream-why', ` · ${why}`) : null));
    } else if (line.kind === 'sum') {
      row = h('div.dream-line', tag('sum'), h('span.dream-t', line.done ? t('dream.summary_done') : t('dream.summary', { n: line.chars })));
      this.summaryLine = row;
    } else if (line.kind === 'kw') row = h('div.dream-line', tag('kw'), h('span.dream-t', text(line.id), h('span.dream-why', ` · ${line.keywords}`)));
    else if (line.kind === 'stopped') row = h('div.dream-line.is-fail', h('span.dream-t', t('dream.stopped_line')));
    else row = h('div.dream-line.is-fail', h('span.dream-t', t('dream.retry')));
    // 光点：读进来一条一个点，并进别的飞过去、过时的淡掉，改写的亮一下
    const now = performance.now();
    if (line.kind === 'read') this.dots.add(line.id, now);
    else if (line.kind === 'batch') this.dots.addMany(line.count, now);
    else if (line.kind === 'del') this.dots.merge(line.id, line.kept, now);
    else if (line.kind === 'new') this.dots.flash(line.id, now);
    // 新的一批：摘要那一行重新起
    if ((line.kind === 'read' || line.kind === 'batch') && this.summaryLine) this.summaryLine = null;
    this.list.append(row);
    while (this.list.children.length > KEEP) this.list.firstElementChild?.remove();
  }

  /** 画布照显示的大小和像素比 */
  fit() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), hh = Math.round(r.height * dpr);
    if (w !== this.canvas.width || hh !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = hh;
    }
    this.dots.resize(r.width, r.height);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** 画一帧 @param {number} now */
  draw(now) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dots.step(now, reduce);
    // 深色主题用亮的那套颜色、光叠着加（主题服务说了算，没有的照系统）
    const dark = this.ctx.theme?.dark?.() ?? matchMedia('(prefers-color-scheme: dark)').matches;
    this.dots.draw(this.g, now, dark, reduce);
  }
}
