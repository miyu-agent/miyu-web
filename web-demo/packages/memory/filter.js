// @ts-check
//! 记忆页的筛选（蓝图 `web.md`「记忆页」第 4 条；2026-10-23 项目主人：类别那一排和「认识的人」标签重了，改成搜索框旁边一个按钮、点了弹浮窗）：
//! 搜索框右边一个图标按钮，点了在它下面开菜单（同「下载软件」页的种类菜单）：类别一类一行、能多选（2026-10-23 项目主人），一道细线下面「显示作废的」开关；
//! 「认识的人」那一页只有开关。筛着的图标变主色，工具那一排下面一行小块写筛的是什么，点 ✕ 去掉。
//! 菜单开着时页面重画（勾了一类、拨了开关重读）照样开着：每次重画照 `page.filterOpen` 换一个。菜单挂在页面外层，重画只换里面那一层
//! （`page.body`），收起时只放菜单自己的退场（2026-10-23 项目主人：原来收起时整页重画、菜单被拿掉又放回，进场动画重播一下，看着闪）。

import { h, icon } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { CLASSES, counts } from './model.js';

/** 筛着没有：勾了类别、开着显示作废的 @param {import('./page.js').MemoryPage} page */
function filtering(page) {
  return page.tab === 'people' ? page.cardsRetired : page.cls.length > 0 || page.retired;
}

/** 搜索框右边的按钮 @param {import('./page.js').MemoryPage} page */
export function filterButton(page) {
  const label = page.t('filter.title');
  return h(`button.icon-button.mem-filter${filtering(page) ? '.is-on' : ''}${page.filterOpen ? '.is-open' : ''}`, {
    type: 'button', title: label, 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': String(page.filterOpen),
    onclick: () => (page.filterOpen ? closeFilter(page) : openFilter(page)),
  }, icon('list-filter'));
}

/** 筛着的那几样，一样一个小块（点 ✕ 去掉）；没筛的不出 @param {import('./page.js').MemoryPage} page */
export function filterChips(page) {
  const t = page.t;
  const chip = (/** @type {string} */ text, /** @type {() => void} */ drop) => h('button.mem-chip.is-on.mem-filter-chip', { type: 'button', title: t('filter.remove'), onclick: drop }, h('span', text), icon('x'));
  const chips = page.tab === 'people'
    ? [page.cardsRetired ? chip(t('filter.retired'), () => { page.cardsRetired = false; page.draw(); }) : null]
    : [
      ...page.cls.map((k) => chip(t(`classes.${k}`), () => { page.cls = page.cls.filter((x) => x !== k); page.draw(); })),
      page.retired ? chip(t('filter.retired'), () => { page.retired = false; page.reload(); }) : null,
    ];
  return chips.some(Boolean) ? h('div.mem-filters', chips) : null;
}

/** @param {import('./page.js').MemoryPage} page */
function openFilter(page) {
  page.filterOpen = true;
  page.draw();
  // 点外面收起（点按钮自己的由按钮管）
  const away = (/** @type {PointerEvent} */ e) => {
    const target = /** @type {Element} */ (e.target);
    if (!page.filterOpen) return void document.removeEventListener('pointerdown', away, true);
    if (target.closest?.('.mem-filter-menu, .mem-filter')) return;
    document.removeEventListener('pointerdown', away, true);
    closeFilter(page);
  };
  document.addEventListener('pointerdown', away, true);
}

/** 收起菜单（放完退场再拿掉），页面照现在的筛选重画 @param {import('./page.js').MemoryPage} page */
export function closeFilter(page) {
  const menu = page.el.querySelector(':scope > .mem-filter-menu:not(.is-leaving)');
  page.filterOpen = false;
  page.draw();
  if (menu instanceof HTMLElement) {
    menu.classList.remove('is-steady');
    leave(menu, () => menu.remove());
  }
}

/**
 * 菜单：开在按钮下面、右边对齐。重画时还开着的不再放进场的动画。
 * @param {import('./page.js').MemoryPage} page @param {boolean} steady 本来就开着
 */
export function filterMenu(page, steady) {
  const btn = page.el.querySelector('.mem-filter');
  if (!page.filterOpen || !(btn instanceof HTMLElement)) return null;
  const t = page.t;
  const c = counts(page.list);
  // 一类一行能多选：点一类勾上、再点去掉；点「全部」清掉别的；菜单不收
  const row = (/** @type {string} */ k) => {
    const on = k === 'all' ? page.cls.length === 0 : page.cls.includes(k);
    return h(`button.set-menu-item${on ? '.is-on' : ''}`, { type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(on),
      onclick: () => {
        page.cls = k === 'all' ? [] : on ? page.cls.filter((x) => x !== k) : [...page.cls, k];
        page.draw();
      } },
    h('span', t(`classes.${k}`)), h('span.mem-filter-n', String(c[k] ?? 0)), on ? icon('check') : null);
  };
  const people = page.tab === 'people';
  const toggle = h('label.mem-filter-toggle', h('span', t('show_retired')), page.kit.toggle(people ? page.cardsRetired : page.retired, (/** @type {boolean} */ on) => {
    if (people) {
      page.cardsRetired = on;
      page.draw();
    } else {
      page.retired = on;
      page.reload();
    }
    return true;
  }));
  const menu = h(`div.set-menu.mem-filter-menu${steady ? '.is-steady' : ''}`, { role: 'menu', 'data-set-dismiss': '1' },
    people ? null : ['all', ...CLASSES].map(row),
    people ? null : h('div.mem-filter-sep'),
    toggle);
  menu.addEventListener('set-dismiss', () => closeFilter(page));
  const box = btn.getBoundingClientRect();
  const root = page.el.getBoundingClientRect();
  const zoom = root.width / (page.el.offsetWidth || root.width) || 1;
  menu.style.top = `${(box.bottom - root.top) / zoom + 6}px`;
  menu.style.right = `${(root.right - box.right) / zoom}px`;
  return menu;
}
