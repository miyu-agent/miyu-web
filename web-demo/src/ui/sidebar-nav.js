// @ts-check
//! 左栏头上交互区里软件包挂的入口（挂载位 `sidebar.nav`，W-1211；蓝图 `web.md`「左栏」第 1 条；2026-11-17 项目主人本机验收第 31 条：
//! 「推演人生」从「更多」拿出来，和别的主入口同一级）：画在「项目」下面、「更多」上面，一行同「全部会话」那几行（图标加名字）；正在看的会话
//! 归它的那一行照选中的亮着，有没看过的东西的名字后面一个小圆点（`model/nav.js` 定）。挂的变了、记号变了重画。

import { h, icon, replace, hasIcon } from './dom.js';
import { navEntries, navRows } from '../model/nav.js';

export class NavEntries {
  constructor() {
    this.el = h('div.sidebar-nav-slot');
    /** @type {import('../model/nav.js').NavEntry[]} */
    this.entries = [];
    /** 正在看的会话的会话表那一项 @type {any} */
    this.here = null;
    /** 记号变了叫我的登记，换挂的时候放掉 @type {(() => void)[]} */
    this.offs = [];
  }

  /** 换上挂进来的（`ctx.slots.list('sidebar.nav')`） @param {any[]} entries */
  set(entries) {
    for (const off of this.offs) off();
    this.entries = navEntries(entries);
    this.offs = this.entries.map((x) => (typeof x.onChange === 'function' ? x.onChange(() => this.draw()) : () => {}));
    this.draw();
  }

  /** 正在看的会话换了 @param {any} entry */
  setHere(entry) {
    this.here = entry;
    this.draw();
  }

  draw() {
    const rows = navRows(this.entries, this.here);
    replace(this.el, rows.map((r, i) => h(`button.sidebar-nav-row${r.here ? '.is-here' : ''}`, {
      type: 'button', dataset: { nav: `pkg:${r.id}` },
      onclick: () => {
        try {
          this.entries[i].run();
        } catch (err) {
          console.error(`左栏的入口 ${r.id} 出错了`, err);
        }
      },
    }, icon(r.icon && hasIcon(r.icon) ? r.icon : 'puzzle'), h('span', r.label), r.mark ? h('i.sidebar-nav-mark', { 'aria-hidden': 'true' }) : null)));
  }
}
