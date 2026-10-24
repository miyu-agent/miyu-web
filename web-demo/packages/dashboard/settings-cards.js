// @ts-check
//! 设置页「软件包」→「右侧边栏」那一页里的一块「卡片」（挂载位 `settings.package`，蓝图 `web.md`「仪表盘」第 4 条「设置」，2026-10-24 项目主人：
//! 原来是一串编号的设置项，设置页画不出来、找不到调先后的地方）：一行一张卡（挂在 `side.cards` 里的全都列，关掉的也列），左边拖动把手
//! （按住上下拖着排先后，同左栏拖会话的手感：拖起来的那一行浮起来跟着指针、原处淡下去，放下的位置一道 `accent` 的线，松手别的行缓到新
//! 位置；把手能聚焦，`Alt+↑`、`Alt+↓` 挪一格），卡片名，「最多露几行」数字框，开关；底下「恢复默认」。改了写进这个包的设置
//! （`cards`、`cards_off`、`card_rows`，`live`：右栏当场跟着变）。

import { h, icon, replace } from '../../src/lib/dom.js';
import { reduced } from '../../src/lib/motion.js';
import { arrange } from './model.js';

/** 挪过几像素算拖起来 */
const START_PX = 5;

/**
 * @param {any} ctx 这个包的上下文（`slots`、`packages`、`text`）
 * @param {any} kit 设置页的控件
 * @param {() => any} config 现在的设置（`cards`、`cards_off`、`card_rows`、`card_rows_default`）
 * @param {(id: string) => string} nameOf 一张卡叫什么
 */
export function cardsBlock(ctx, kit, config, nameOf) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => ctx.text(k, f);
  const rows = h('div.set-rows.dash-set-cards');
  const block = h('section.set-group', h('h3.set-group-name', t('set.cards')), h('p.set-desc.dash-set-hint', t('set.cards_hint')), rows,
    h('div.dash-set-foot', kit.button(t('set.reset'), {}, () => save({ cards: null, cards_off: null, card_rows: null }))));
  /** 现在的先后（编号）、关掉的、每张几行 */
  const state = () => {
    const c = config();
    const all = ctx.slots.list('side.cards');
    const order = arrange(all, { order: c.cards ?? [] }).map((/** @type {any} */ e) => e.id);
    return { all, order, off: new Set(c.cards_off ?? []), rows: { ...(c.card_rows ?? {}) }, fallback: c.card_rows_default ?? 10 };
  };
  /** 写进这个包的设置（`null` 的一项回出厂）；写好了照新的画 @param {Record<string, any>} patch */
  async function save(patch) {
    try {
      await ctx.packages.set('dashboard', { config: patch });
    } catch (err) {
      kit.toast(/** @type {any} */ (err)?.message ?? String(err));
    }
    draw();
  }

  /** 拖着的那一行 @type {null|{id: string, row: HTMLElement, y: number, dy: number, on: boolean, ghost: HTMLElement|null, line: HTMLElement|null, at: number}} */
  let drag = null;

  function draw() {
    const s = state();
    replace(rows, s.order.map((id, i) => {
      const entry = s.all.find((/** @type {any} */ e) => e.id === id);
      const limited = entry?.rows !== false;
      const n = Number(s.rows[id]) > 0 ? Number(s.rows[id]) : s.fallback;
      const grip = h('button.dash-set-grip', {
        type: 'button', title: t('set.drag'), 'aria-label': t('set.drag_named', { name: nameOf(id) }),
        onpointerdown: (/** @type {PointerEvent} */ e) => down(e, id),
        onkeydown: (/** @type {KeyboardEvent} */ e) => {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          const to = i + (e.key === 'ArrowUp' ? -1 : 1);
          if (to < 0 || to >= s.order.length) return;
          move(s.order, i, to, id, true);
        },
      }, icon('grip-vertical'));
      const row = kit.row({
        lead: grip,
        name: nameOf(id),
        control: [
          limited ? h('label.dash-set-rows', h('span', t('set.rows')), kit.number(n, 1, 200, (/** @type {number} */ v) => save({ card_rows: { ...s.rows, [id]: v } }))) : null,
          kit.toggle(!s.off.has(id), () => {
            const off = new Set(s.off);
            if (off.has(id)) off.delete(id);
            else off.add(id);
            save({ cards_off: [...off] });
          }),
        ],
      });
      row.classList.add('dash-set-card');
      row.dataset.card = id;
      return row;
    }));
  }

  /**
   * 换先后：照新的先后写进设置；别的行从原来的位置缓到新位置（同左栏）。`focus` 的把焦点放回挪过的那一行的把手（键盘挪的）
   * @param {string[]} order @param {number} from @param {number} to @param {string} id @param {boolean} [focus]
   */
  function move(order, from, to, id, focus = false) {
    if (from === to) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    const before = new Map([...rows.children].map((el) => [/** @type {HTMLElement} */ (el).dataset.card, el.getBoundingClientRect().top]));
    save({ cards: next }).then(() => {
      for (const el of /** @type {HTMLElement[]} */ ([...rows.children])) {
        const was = before.get(el.dataset.card);
        const dy = was == null ? 0 : was - el.getBoundingClientRect().top;
        if (dy && typeof el.animate === 'function' && !reduced()) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        }
      }
      if (focus) /** @type {HTMLElement|null} */ (rows.querySelector(`[data-card="${id}"] .dash-set-grip`))?.focus();
    });
  }

  // ── 拖（照左栏拖会话：不用浏览器的拖放，Firefox 里不灵） ──

  /** @param {PointerEvent} e @param {string} id */
  function down(e, id) {
    if (e.button !== 0) return;
    const row = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.currentTarget).closest('.dash-set-card'));
    const r = row.getBoundingClientRect();
    drag = { id, row, y: e.clientY, dy: e.clientY - r.top, on: false, ghost: null, line: null, at: -1 };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp, { once: true });
    addEventListener('pointercancel', onCancel, { once: true });
    addEventListener('keydown', onKey, true);
  }

  /** @param {PointerEvent} e */
  function onMove(e) {
    const d = drag;
    if (!d) return;
    if (!d.on) {
      if (Math.abs(e.clientY - d.y) < START_PX) return;
      d.on = true;
      const r = d.row.getBoundingClientRect();
      d.ghost = h('div.dash-set-ghost', { style: `width: ${r.width}px` }, d.row.querySelector('.set-name')?.textContent ?? '');
      d.line = h('div.dash-set-line');
      document.body.append(d.ghost, d.line);
      d.row.classList.add('is-dragging');
      document.body.classList.add('is-dragging-card');
    }
    const box = d.row.getBoundingClientRect();
    if (d.ghost) d.ghost.style.transform = `translate(${box.left}px, ${e.clientY - d.dy}px)`;
    // 放在哪一行前面：照每一行的中线
    const list = /** @type {HTMLElement[]} */ ([...rows.children]);
    let at = list.length;
    for (let i = 0; i < list.length; i++) {
      const b = list[i].getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { at = i; break; }
    }
    d.at = at;
    const ref = list[Math.min(at, list.length - 1)].getBoundingClientRect();
    const y = at >= list.length ? ref.bottom : ref.top;
    if (d.line) d.line.style.transform = `translate(${box.left}px, ${y - 1}px)`;
    if (d.line) d.line.style.width = `${box.width}px`;
  }

  function onUp() {
    const d = drag;
    end();
    if (!d?.on) return;
    const order = state().order;
    const from = order.indexOf(d.id);
    let to = d.at > from ? d.at - 1 : d.at;
    to = Math.max(0, Math.min(order.length - 1, to));
    move(order, from, to, d.id);
  }

  function onCancel() {
    end();
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key !== 'Escape' || !drag?.on) return;
    e.preventDefault();
    e.stopPropagation();
    end();
  }

  function end() {
    const d = drag;
    drag = null;
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onCancel);
    removeEventListener('keydown', onKey, true);
    if (!d) return;
    d.ghost?.remove();
    d.line?.remove();
    d.row.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-card');
  }

  draw();
  return block;
}
