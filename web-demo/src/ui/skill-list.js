// @ts-check
//! `$` 点名技能的列表（蓝图 `web.md`「`$` 点名技能」第 2 条，W-1124）：浮在输入框上面，和 `@` 选文件同一个位置、同一个样子（借它的框、
//! 行、提示的样式）。头一行「$ 打的字 · N 个」，一个技能一行：名字，后面暗色接说明；最下面一行暗色写按键。焦点留在输入框里：`↑` `↓`
//! `Tab` `Enter` `Esc` 由输入框交过来（`key`）。

import { h, replace } from './dom.js';
import { show, hide } from '../lib/motion.js';
import { res, t } from '../util/res.js';

/** @typedef {import('../model/skills.js').Skill} Skill */

export class SkillList {
  /** @param {{pick: (skill: Skill) => void, dismiss: () => void}} on 选定了一个；`Esc` 关掉 */
  constructor(on) {
    this.on = on;
    this.title = h('strong.mention-title');
    this.list = h('div.mention-list', { role: 'listbox', style: `--rows: ${res.layout.command_rows}` });
    this.el = h('div.dock-mention.dock-float.is-skills', { hidden: true, role: 'dialog' },
      h('div.mention-head', this.title), this.list, h('div.mention-hint', t('skills.hint')));
    /** @type {Skill[]} */
    this.items = [];
    this.selected = 0;
    this.pointer = '';
  }

  get open() { return !this.el.hidden && !this.el.classList.contains('is-leaving'); }

  /** 画筛好的：打开时选中第一个，开着时留在原来那一个上。 @param {string} word @param {Skill[]} items */
  show(word, items) {
    const keep = this.open ? this.items[this.selected]?.name : null;
    this.items = items;
    this.selected = Math.max(0, keep ? items.findIndex((s) => s.name === keep) : 0);
    this.title.textContent = t('skills.title', { word, count: items.length });
    replace(this.list, items.length ? items.map((s, i) => this.row(s, i)) : [h('div.mention-empty', t('skills.no_match'))]);
    this.mark();
    show(this.el);
  }

  close() {
    if (this.open) hide(this.el);
  }

  /** 一个一行：名字，后面暗色接说明。 @param {Skill} skill @param {number} i */
  row(skill, i) {
    return h('div.mention-row', {
      role: 'option',
      onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(),
      onmousemove: (/** @type {MouseEvent} */ e) => this.hover(e, i),
      onclick: () => this.on.pick(skill),
    }, h('span.skill-name', `$${skill.name}`), skill.summary ? h('span.skill-summary', skill.summary) : null);
  }

  mark() {
    const rows = /** @type {HTMLElement[]} */ ([...this.list.querySelectorAll('.mention-row')]);
    rows.forEach((r, j) => {
      r.classList.toggle('is-selected', j === this.selected);
      r.setAttribute('aria-selected', String(j === this.selected));
    });
    const row = rows[this.selected];
    if (!row) return;
    const top = row.offsetTop - this.list.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < this.list.scrollTop) this.list.scrollTop = top;
    else if (bottom > this.list.scrollTop + this.list.clientHeight) this.list.scrollTop = bottom - this.list.clientHeight;
  }

  /** @param {MouseEvent} e @param {number} i */
  hover(e, i) {
    const at = `${e.clientX},${e.clientY}`;
    const moved = at !== this.pointer;
    this.pointer = at;
    if (moved && i !== this.selected) {
      this.selected = i;
      this.mark();
    }
  }

  /** 输入框交过来的按键：`↑` `↓` 选，`Tab`、`Enter` 选定，`Esc` 关。接了的交回 `true`。 @param {KeyboardEvent} e */
  key(e) {
    if (!this.open || e.ctrlKey || e.metaKey || e.altKey) return false;
    const n = this.items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (n) this.selected = (this.selected + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      this.mark();
    } else if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey)) {
      const skill = this.items[this.selected];
      if (!skill) return false;
      this.on.pick(skill);
    } else if (e.key === 'Escape') {
      this.on.dismiss();
    } else {
      return false;
    }
    e.preventDefault();
    return true;
  }
}
