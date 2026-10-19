// @ts-check
//! 左栏「项目」那一栏里的一个个项目（蓝图 `web.md`「会话整理和项目」第 3、4 条；栏头在 `sidebar.js`，悬停露 +）。一个项目一行：
//! 记号那一格是项目颜色的文件夹，名字（收着、里面有在跑的前面写 `(N)`），悬停露 ⋯（打开项目、在项目里新建会话、项目设置…、删除项目…），最右
//! 一个展开箭头（没悬停、没展开时不画）。点这一行就地展开、收起（高度缓过去）；展开着的露最近活动的几个会话，照普通会话的样子、和项目名左边
//! 对齐，子代理照旧缩进挂树线。删除项目在菜单里点两下：第一下换成「再点一次删除」，里面的会话移出项目、不删。

import { h, icon } from './dom.js';
import { t } from '../util/res.js';
import { colorOf } from '../model/project.js';

/**
 * 左栏交给这一栏的。
 * @typedef {{project: import('../core/projects.js').Project, rows: any[], open: boolean, count: number}} Block
 * @typedef {{menuFor: string|null, armed: string|null, dark: boolean, toggleMenu: (key: string|null) => void, flip: (id: string, open: boolean) => void,
 *   draw: (row: any) => HTMLElement, arm: (id: string) => void,
 *   on: {viewProjects: () => void, editProject: (id: string|null) => void, openProject: (id: string) => void, newIn: (id: string) => void,
 *     deleteProject: (id: string) => void}}} Bar
 */

/** 菜单开在一个项目上时 `menuFor` 写的：和会话的编号分开 @param {string} id */
const menuKey = (id) => `project:${id}`;

/**
 * 一个项目：一行，下面一块收着、展开的会话。整块是一个放得下会话的地方（拖进去移进项目，`sidebar-drag.js` 照 `data-zone`）。
 * @param {Bar} bar @param {Block} block
 */
export function projectBlock(bar, block) {
  const p = block.project;
  const id = p.project;
  const key = menuKey(id);
  const menuOpen = bar.menuFor === key;
  const color = colorOf(p.color, bar.dark);
  const kids = h('div.project-kids-inner',
    block.rows.length ? block.rows.map((row) => bar.draw(row)) : h('span.project-empty', t('sidebar.project_empty')));
  const armed = bar.armed === id;
  return h(`div.project${block.open ? '.is-open' : ''}`, { dataset: { key, zone: key, project: id }, style: color ? `--project-color: ${color}` : null },
    h(`div.session-item.project-row${menuOpen ? '.is-menu-open' : ''}`, { dataset: { projectRow: id } },
      h('button.session-item-main', {
        type: 'button', title: p.name, 'aria-expanded': String(block.open),
        onclick: () => bar.flip(id, !block.open),
      },
        h('span.session-lead.project-folder', icon('folder')),
        // 收着的、里面有在跑的写 `(N)`（展开着的照样式藏起来：展开、收起不重画）
        h('span.session-copy', block.count ? h('span.session-count', t('sidebar.kids', { count: block.count })) : null, h('strong', p.name))),
      h('span.session-trailing',
        h('button.session-menu-button', {
          type: 'button', title: t('sidebar.project_menu'), 'aria-haspopup': 'menu', 'aria-expanded': String(menuOpen),
          onclick: () => bar.toggleMenu(menuOpen ? null : key),
        }, icon('ellipsis'))),
      h('span.project-chevron', { 'aria-hidden': 'true' }, icon('chevron-right')),
      menuOpen ? h('div.session-menu', { role: 'menu' },
        item(t('sidebar.project_open'), null, () => { bar.toggleMenu(null); bar.on.openProject(id); }),
        item(t('sidebar.project_new_session'), null, () => { bar.toggleMenu(null); bar.on.newIn(id); }),
        item(t('sidebar.project_settings'), null, () => { bar.toggleMenu(null); bar.on.editProject(id); }),
        // 点两下才删（第一下换字，菜单不收）
        item(t(armed ? 'sidebar.project_delete_confirm' : 'sidebar.project_delete'), 'trash-2', () => {
          if (!armed) return bar.arm(id);
          bar.toggleMenu(null);
          bar.on.deleteProject(id);
        }, true)) : null),
    h('div.project-kids', kids));
}

/** 菜单的一项。 @param {string} label @param {string|null} name 图标 @param {() => void} run @param {boolean} [danger] */
function item(label, name, run, danger = false) {
  return h(`button${danger ? '.is-danger' : ''}`, { type: 'button', role: 'menuitem', onclick: run }, name ? icon(name) : null, h('span', label));
}
