// @ts-check
//! 人叫的整理那一块（蓝图 `web.md`「记忆页」第 13 条；2026-10-20 项目主人选的「日月轮转」）：头一行、五行滚动区、像素舞台（夜空里
//! 月亮落下、太阳升起，开着吉祥物的它在左边原地睡着；右上角像素数字「合了 / 一共」）。记忆页的「整理」、`/dream` 都用它。数据照 `dream-model.js`。

import { h } from '../../src/lib/dom.js';
import { DreamTrack } from './dream-model.js';

/** 舞台多少格高、地面从第几格起（一格放大成 3px，舞台高 126px） */
const H = 42;
const GROUND = 35;
/** 滚动区留几行（多的从上面拿掉：看得见的是五行，上面两行淡出） */
const KEEP = 7;
/** 夜空、黎明、白天的颜色（舞台是自己的一套，深浅主题下都是夜里） */
const SKY = {
  night: ['#141833', '#262b55'], late: ['#2b2f60', '#5a4f86'], dawn: ['#e9a77f', '#f7d3a0'], day: ['#9fd0f5', '#e3f2ff'],
  groundNight: ['#2a2f4a', '#232842', '#3a4166'], groundDay: ['#b9d79a', '#a8ca88', '#d3e8b8'],
  moon: '#f3edc9', sun: '#ffc94d', ray: '#ffd36b', star: '#f4f1ff', z: '#cfd3ff', digitNight: '#e8e6fb', digitDay: '#3b3f6b',
};
/** 3×5 的像素数字和斜杠（一行一个字，`#` 是有） */
const DIGITS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'], '/': ['..#', '..#', '.#.', '#..', '#..'],
};

export class DreamCard {
  /**
   * @param {any} ctx `memory` 包的 ctx
   * @param {Map<string, string>} texts 记忆编号 → 正文（打开时读的那一份；滚动区照它写）
   */
  constructor(ctx, texts) {
    this.ctx = ctx;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.texts = texts;
    this.track = new DreamTrack();
    /** 平滑地追着进度走的那个数（舞台照它画） */
    this.shown = 0;
    this.finished = false;
    this.doneAt = 0;
    /** 摘要那一行（同一行跟着改） @type {HTMLElement|null} */
    this.summaryLine = null;
    this.title = h('b', this.t('dream.running'));
    this.batch = h('span.dream-batch');
    this.tally = h('span.dream-tally');
    this.list = h('div.dream-feed-list');
    this.canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { width: 400, height: H }));
    this.el = h('section.dream-card', { 'aria-live': 'polite' },
      h('div.dream-head', this.title, this.batch, this.tally),
      h('div.dream-feed', this.list),
      h('div.dream-stage', this.canvas));
    this.g = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));
    this.W = 400;
    this.frame = 0;
    this.sync();
    const tick = (/** @type {number} */ now) => {
      if (this.el.isConnected) {
        this.fit();
        this.draw(now);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** 不要了：停掉动画 */
  dispose() {
    cancelAnimationFrame(this.frame);
  }

  /**
   * 推送：记忆日志新的一行（`memory.event`）、模型写出来的一条决定（`memory.dreaming`）。
   * @param {string} method @param {any} params
   */
  push(method, params) {
    const lines = method === 'memory.event' ? this.track.logged(params?.event) : method === 'memory.dreaming' ? this.track.dreaming(params) : [];
    for (const line of lines) this.say(line);
    if (lines.length || method === 'memory.event') this.sync();
  }

  /** 合完了（`memory.dream` 的回应）：天亮，头一行换成结果。 @param {{given?: number, revised?: number, retired?: number}} got */
  finish(got) {
    this.finished = true;
    this.doneAt = performance.now();
    this.title.textContent = this.t('dream.done');
    this.batch.textContent = this.t('dream.result', { given: got?.given ?? 0, revised: got?.revised ?? 0, retired: got?.retired ?? 0 });
    this.tally.textContent = '';
    this.sync();
  }

  /** 头一行（只重看旧记忆的批写「重看 N 条旧记忆」，没有「合了 / 一共」可数） */
  sync() {
    const tr = this.track;
    if (this.finished) return;
    this.batch.textContent = !tr.batches ? '' : tr.total ? this.t('dream.batch', { n: tr.batches }) : this.t('dream.sweep', { n: tr.given });
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
    else row = h('div.dream-line.is-fail', h('span.dream-t', t('dream.retry')));
    // 新的一批：摘要那一行重新起
    if (line.kind === 'read' && this.summaryLine) this.summaryLine = null;
    this.list.append(row);
    while (this.list.children.length > KEEP) this.list.firstElementChild?.remove();
  }

  /** 画布照显示的宽高比折成格数（高 42 格，地面铺满） */
  fit() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.height) return;
    const w = Math.max(160, Math.round(r.width / (r.height / H)));
    if (w !== this.W) {
      this.W = w;
      this.canvas.width = w;
      this.canvas.height = H;
    }
  }

  /** 画一帧 @param {number} now */
  draw(now) {
    const g = this.g;
    const W = this.W;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = this.finished ? 1 : this.track.progress();
    this.shown += (target - this.shown) * 0.05;
    const t = this.shown;
    const day = this.finished ? Math.min(1, (now - this.doneAt) / 900) : 0;
    const top = day ? mix(SKY.dawn[0], SKY.day[0], day) : mix3(SKY.night[0], SKY.late[0], SKY.dawn[0], t);
    const bottom = day ? mix(SKY.dawn[1], SKY.day[1], day) : mix3(SKY.night[1], SKY.late[1], SKY.dawn[1], t);
    // 天：几档色带（像素的渐变）
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      g.fillStyle = mix(top, bottom, i / (bands - 1));
      g.fillRect(0, Math.floor(i * GROUND / bands), W, Math.ceil(GROUND / bands) + 1);
    }
    // 星星：天越亮越淡，慢慢闪
    g.fillStyle = SKY.star;
    for (let i = 0; i < 24; i++) {
      g.globalAlpha = Math.max(0, 1 - t * 1.25 - day) * (reduce ? 0.8 : 0.4 + 0.25 * (Math.sin(now / 900 + i) + 1));
      g.fillRect((i * 97) % W, 2 + ((i * 37) % 22), 1, 1);
    }
    g.globalAlpha = 1;
    // 月亮从头顶往右落，太阳在对面从左边升起来
    const cx = W / 2, cy = GROUND + 2, rx = W * 0.44, ry = GROUND - 6;
    const moonA = Math.PI * 0.62 - t * Math.PI * 0.72;
    const sunA = moonA + Math.PI + day * Math.PI * 0.12;
    const at = (/** @type {number} */ a) => [cx + rx * Math.cos(a), cy - ry * Math.sin(a)];
    const [mx, my] = at(moonA);
    if (my < GROUND - 2) {
      disc(g, mx, my, 4, SKY.moon);
      disc(g, mx + 2, my - 1, 3, mix(top, bottom, Math.max(0, my) / GROUND));
    }
    const [sx, sy] = at(sunA);
    if (sy < GROUND) {
      g.fillStyle = SKY.ray;
      if (!reduce) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + now / 3000; g.fillRect(Math.round(sx + Math.cos(a) * 8), Math.round(sy + Math.sin(a) * 8), 1, 1); }
      disc(g, sx, sy, 5, SKY.sun);
    }
    // 地面：天快亮时变绿
    const green = day ? 1 : t > 0.85 ? (t - 0.85) / 0.15 : 0;
    const [ga, gb, edge] = SKY.groundNight.map((c, i) => mix(c, SKY.groundDay[i], green));
    for (let x = 0; x < W; x += 4) { g.fillStyle = (x / 4) % 2 ? ga : gb; g.fillRect(x, GROUND, 4, H - GROUND); }
    g.fillStyle = edge;
    g.fillRect(0, GROUND, W, 1);
    // 右上角「合了 / 一共」：夜里浅色，天亮了深色
    const tr = this.track;
    if (tr.total) digits(g, `${this.finished ? tr.total : tr.merged}/${tr.total}`, W - 3, 3, mix(SKY.digitNight, SKY.digitDay, Math.max(day, green)));
    this.mascot(now, reduce);
  }

  /** 开着吉祥物的：左边原地睡着，一呼一吸、头上冒 Zz；天亮醒过来跳一下 @param {number} now @param {boolean} reduce */
  mascot(now, reduce) {
    const m = this.ctx.mascot;
    if (!m?.portrait) return;
    const woke = this.finished && now - this.doneAt > 450;
    const { canvas, bottom } = m.portrait(woke ? {} : { sleep: true });
    let dy = !woke && !reduce ? Math.floor(now / 1600) % 2 : 0;
    if (woke && !reduce) {
      const k = (now - this.doneAt - 450) / 520;
      if (k > 0 && k < 1) dy = -Math.round(Math.sin(k * Math.PI) * 7);
    }
    const x = Math.round(this.W * 0.16);
    const y = GROUND - (bottom + 1) + dy;
    this.g.drawImage(canvas, x, y);
    if (!woke) zz(this.g, x + canvas.width - 6, y + 4, now, reduce);
  }
}

/** 像素数字，右边对齐到 `right`（一个字 3 格宽、隔 1 格） */
function digits(/** @type {CanvasRenderingContext2D} */ g, /** @type {string} */ text, /** @type {number} */ right, /** @type {number} */ top, /** @type {string} */ color) {
  g.fillStyle = color;
  let x = right - text.length * 4 + 1;
  for (const ch of text) {
    const rows = DIGITS[/** @type {keyof typeof DIGITS} */ (ch)];
    if (rows) rows.forEach((row, y) => [...row].forEach((c, dx) => { if (c === '#') g.fillRect(x + dx, top + y, 1, 1); }));
    x += 4;
  }
}

/** 头上冒 Zz：一个小 z、一个大 Z 往右上飘着淡掉 */
function zz(/** @type {CanvasRenderingContext2D} */ g, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ now, /** @type {boolean} */ reduce) {
  g.fillStyle = SKY.z;
  for (let n = 0; n < 2; n++) {
    const life = (now / 1600 + n * 0.5) % 1;
    const zx = x + Math.round(life * 8), zy = y - Math.round(life * 10);
    g.globalAlpha = reduce ? 0.8 : Math.max(0, 1 - life);
    const size = n ? 4 : 3;
    g.fillRect(zx, zy, size, 1);
    g.fillRect(zx, zy + size - 1, size, 1);
    for (let k = 1; k < size - 1; k++) g.fillRect(zx + size - 1 - k, zy + k, 1, 1);
  }
  g.globalAlpha = 1;
}

/** 像素圆（填满） */
function disc(/** @type {CanvasRenderingContext2D} */ g, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r, /** @type {string} */ color) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
}

/** 两个 `#rrggbb` 之间取 `t`，交回 `#rrggbb` @param {string} a @param {string} b @param {number} t */
export function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const rgb = (/** @type {string} */ c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const x = rgb(a), y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
/** 三个颜色之间走：前一半 a→b，后一半 b→c */
const mix3 = (/** @type {string} */ a, /** @type {string} */ b, /** @type {string} */ c, /** @type {number} */ t) => (t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2));
