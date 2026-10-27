// @ts-check
//! 新建定时任务浮窗里的时刻、日期（蓝图 `web.md`「定时任务」第 1 条；2026-10-27 项目主人：浏览器自带的选取器不好看，选「软件自己画的浮层」）：
//! 时刻一格能直接打字的框，点了下面开「时」「分」两列的浮层；日期一个按钮，点了开月历浮层。浮层同设置页的下拉菜单（`.set-menu` 那一套样子、
//! 进出动画），挂在设置框上（同 `kit.select` 的菜单，浮在浮窗上面）；点外面、`Esc` 收起浮层，不收浮窗。认字、排月历的纯函数在 `model.js`。

import { h, icon } from '../../src/lib/dom.js';
import { parseClock, monthCells, dateLabel, ymd } from './model.js';

/** 分钟一格几分钟 */
const MINUTE_STEP = 5;

/**
 * 在 `anchor` 下面开一块浮层（左边对齐；下面放不下往上开）；点外面、`Esc` 收起。交回收起它的函数。
 * @param {HTMLElement} anchor @param {HTMLElement} el
 */
function float(anchor, el) {
  document.querySelector('.sch-float')?.dispatchEvent(new CustomEvent('sch-dismiss'));
  const host = /** @type {HTMLElement} */ (anchor.closest('.set-panel') ?? document.body);
  el.classList.add('set-menu', 'sch-float');
  const box = host.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const scale = box.width / (host.offsetWidth || box.width) || 1;
  el.style.left = `${(at.left - box.left) / scale}px`;
  el.style.top = `${(at.bottom - box.top) / scale + 4}px`;
  host.append(el);
  if (el.getBoundingClientRect().bottom > box.bottom - 8) el.style.top = `${(at.top - box.top) / scale - el.offsetHeight - 4}px`;
  const outside = (/** @type {Event} */ e) => { const at2 = /** @type {Node} */ (e.target); if (!el.contains(at2) && !anchor.contains(at2)) close(); };
  // `Esc` 先收浮层：抓在最前面，收了就不再往下传（浮窗、设置框不跟着收）
  const key = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  const close = () => {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
    el.remove();
  };
  el.addEventListener('sch-dismiss', close);
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', key, true);
  return close;
}

/**
 * 时刻：一格能打字的框（失焦、回车时认字，认不得的回到原来的），点了开「时」「分」两列；点「时」留着、点「分」收起。
 * @param {(key: string, fields?: any) => string} t @param {string} value `HH:MM` @param {(v: string) => void} [change]
 * @returns {{el: HTMLElement, value: () => string}}
 */
export function clockField(t, value, change = () => {}) {
  let now = parseClock(value) ?? '08:00';
  const input = /** @type {HTMLInputElement} */ (h('input.set-input.set-tool-input.sch-clock', { type: 'text', value: now, inputMode: 'numeric', spellcheck: 'false', autocomplete: 'off', 'aria-label': t('pick.time') }));
  const set = (/** @type {string} */ v) => { now = v; input.value = v; change(v); };
  const commit = () => { const got = parseClock(input.value); if (got) set(got); else input.value = now; };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  let shut = /** @type {(() => void)|null} */ (null);
  const open = () => {
    if (shut && document.querySelector('.sch-float.sch-clock-pop')) return;
    const [hh, mm] = now.split(':').map(Number);
    const col = (/** @type {number[]} */ values, /** @type {number} */ on, /** @type {(v: number) => void} */ pick, /** @type {string} */ name) => {
      const list = h('div.sch-clock-col', { role: 'listbox', 'aria-label': name },
        values.map((v) => h(`button.set-menu-item.sch-clock-item${v === on ? '.is-on' : ''}`, { type: 'button', role: 'option', onclick: () => pick(v) }, String(v).padStart(2, '0'))));
      return list;
    };
    const two = (/** @type {number} */ x) => String(x).padStart(2, '0');
    const nearest = Math.round(mm / MINUTE_STEP) * MINUTE_STEP % 60;
    const hours = col([...Array(24).keys()], hh, (v) => { set(`${two(v)}:${now.split(':')[1]}`); for (const b of hours.children) b.classList.toggle('is-on', b.textContent === two(v)); }, t('pick.hour'));
    const minutes = col(Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP), nearest, (v) => { set(`${now.split(':')[0]}:${two(v)}`); shut?.(); }, t('pick.minute'));
    const el = h('div.sch-clock-pop', h('div.sch-clock-head', h('span', t('pick.hour')), h('span', t('pick.minute'))), h('div.sch-clock-cols', hours, minutes));
    shut = float(input, el);
    // 选着的滚到中间
    for (const c of [hours, minutes]) c.querySelector('.is-on')?.scrollIntoView({ block: 'center' });
  };
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  return { el: input, value: () => parseClock(input.value) ?? now };
}

/**
 * 日期：一个按钮（「今天」「明天」「10月28日 周二」），点了开月历：顶上「今天」「明天」、右边翻月；过去的灰着点不了；点一天收起。
 * @param {(key: string, fields?: any) => string} t @param {string} value `YYYY-MM-DD` @param {(v: string) => void} [change]
 * @returns {{el: HTMLElement, value: () => string}}
 */
export function dateField(t, value, change = () => {}) {
  let now = value;
  const label = h('span');
  const button = /** @type {HTMLButtonElement} */ (h('button.set-input.sch-date', { type: 'button', 'aria-label': t('pick.date_label') }, label, icon('chevron-down')));
  const paint = () => { label.textContent = dateLabel(now, new Date(), t); };
  const set = (/** @type {string} */ v) => { now = v; paint(); change(v); };
  paint();
  button.addEventListener('click', () => {
    if (document.querySelector('.sch-float.sch-cal')) return;
    const today = new Date();
    const [y0, m0] = now.split('-').map(Number);
    let view = { y: y0, m: m0 - 1 };
    const title = h('strong.sch-cal-title');
    const grid = h('div.sch-cal-grid');
    /** @type {() => void} */
    let shut = () => {};
    const draw = () => {
      title.textContent = t('pick.month', { year: view.y, month: view.m + 1 });
      grid.replaceChildren(
        ...[1, 2, 3, 4, 5, 6, 0].map((d) => h('span.sch-cal-wd', t(`pick.weekdays_short.${d}`))),
        ...monthCells(view.y, view.m, today).map((c) => h(`button.sch-cal-day${c.inMonth ? '' : '.is-other'}${c.today ? '.is-today' : ''}${c.date === now ? '.is-on' : ''}`, {
          type: 'button', disabled: c.past ? true : null, onclick: () => { set(c.date); shut(); },
        }, String(c.day))));
    };
    const turn = (/** @type {number} */ by) => { const d = new Date(view.y, view.m + by, 1); view = { y: d.getFullYear(), m: d.getMonth() }; draw(); };
    const quick = (/** @type {number} */ days) => { set(ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days))); shut(); };
    const el = h('div.sch-cal',
      h('div.sch-cal-head',
        h('button.set-btn.is-small', { type: 'button', onclick: () => quick(0) }, t('pick.today')),
        h('button.set-btn.is-small', { type: 'button', onclick: () => quick(1) }, t('pick.tomorrow')),
        h('span.sch-cal-gap'),
        h('button.icon-button.sch-cal-turn', { type: 'button', title: t('pick.prev'), 'aria-label': t('pick.prev'), onclick: () => turn(-1) }, icon('chevron-left')),
        title,
        h('button.icon-button.sch-cal-turn', { type: 'button', title: t('pick.next'), 'aria-label': t('pick.next'), onclick: () => turn(1) }, icon('chevron-right'))),
      grid);
    draw();
    shut = float(button, el);
  });
  return { el: button, value: () => now };
}
