// @ts-check
//! 「下载软件」页（软件市场；蓝图 `web.md`「设置页」第 12a 条，核心设计 37「软件源」）：顶上搜索、「N 个可升级」、刷新，两排筛选，
//! 下面卡片墙；点卡片进详情（`package.install {source, preview: true}` 只照索引说，不下载），安装、升级带进度（`package.progress`）。
//! 拿到的那一份记在 `dialog.market`，搜什么、筛哪个记在 `dialog.marketView`（重画、关了再开还是它）。

import { h, icon, hasIcon, replace } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { bytes } from '../../src/lib/format.js';
import { pkgFace } from './logos.js';
import { STATUS_FILTERS, shownOf, actionOf, faceOf, needsLook, hasProgram, providesLine, percentOf } from './market-model.js';
import { confirmIn } from './confirm.js';

/** 搜索框停多久再筛（边打边筛；输入法选字时不筛） */
const TYPE_MS = 120;

/**
 * @typedef {{list: any[], generated: string|null, stale: string|null, up: any|null, error: string|null, loading: boolean,
 *   busy: string|null, progress: {package: string, done: number, total: number}|null, problems: Record<string, string>,
 *   previews: Map<string, Promise<any>>, refreshing: boolean, refused?: boolean, seen: Set<string>, just?: string|null}} Market
 */

/** @param {any} dialog @returns {Market} */
const stateOf = (dialog) => (dialog.market ??= { list: [], generated: null, stale: null, up: null, error: null, loading: false, busy: null, progress: null, problems: {}, previews: new Map(), refreshing: false, seen: new Set() });

/** 能升级的编号 @param {Market} m */
const upgradableOf = (m) => new Set((m.up?.upgrades ?? []).map((/** @type {any} */ u) => u.package));

/**
 * 读一遍：`package.search {}`（不写词列出全部）和 `package.upgrades`；`force` 先 `package.sync {force: true}`（刷新）。读完重画（还在这一页、没点进一层的）。
 * @param {any} dialog @param {boolean} [force]
 */
export async function loadMarket(dialog, force = false, draw = true) {
  const m = stateOf(dialog);
  m.loading = true;
  try {
    // 刷新照发（2026-10-27 项目主人：锁着时点了什么都不做像坏了）：核心要先进管理员模式的，设置页照常提示一句、能一键进入
    // （`admin_mode_required` 走 `adminPrompt`），这里接着读本机记着的索引，不当出错、不写「已更新」
    m.refused = false;
    if (force) {
      await dialog.ctx.core.request('package.sync', { force: true }).catch((/** @type {any} */ err) => {
        if (err?.data?.reason !== 'admin_mode_required') throw err;
        m.refused = true;
      });
    }
    const got = await dialog.ctx.core.request('package.search', {});
    m.list = Array.isArray(got?.packages) ? got.packages : [];
    m.generated = got?.generated ?? null;
    m.stale = got?.stale ?? null;
    m.error = null;
    m.up = await dialog.ctx.core.request('package.upgrades', {}).catch(() => null);
    m.previews.clear();
  } catch (err) {
    m.error = /** @type {any} */ (err)?.data?.why ?? /** @type {any} */ (err)?.message ?? String(err);
    if (!m.list.length) m.list = [];
  } finally {
    m.loading = false;
    if (draw) redraw(dialog);
  }
}

/** 进度条至少留多久（毫秒） */
const BAR_MIN_MS = 600;

/** 还在这一页的重画：列表那一层（点进详情的重画详情） @param {any} dialog */
function redraw(dialog) {
  if (!dialog.isOpen || dialog.current !== 'market' || dialog.query || dialog.editing?.()) return;
  dialog.drawBody();
}

/**
 * 推来的（设置框的 `onPush` 先给这里看）：下载进度换按钮上那一条；装了、卸了（`package.change` 推的）重问一遍。
 * @param {any} dialog @param {string} method @param {any} params
 */
export function marketPush(dialog, method, params) {
  const m = dialog.market;
  if (!m) return;
  if (method === 'package.progress' && m.busy) {
    m.progress = { package: String(params?.package ?? ''), done: Number(params?.done ?? 0), total: Number(params?.total ?? 0) };
    drawProgress(dialog);
  } else if (method === 'package.changed' && !m.busy) {
    clearTimeout(m.changedTimer);
    m.changedTimer = setTimeout(() => loadMarket(dialog).catch(() => {}), 200);
  }
}

/** 正在装的那一个：页面上所有画着它的进度条换数（卡片、详情各一个） @param {any} dialog */
function drawProgress(dialog) {
  const m = stateOf(dialog);
  for (const el of dialog.panel.querySelectorAll(`[data-market-busy="${CSS.escape(m.busy ?? '')}"]`)) fillBar(dialog, /** @type {HTMLElement} */ (el));
}

/** 一条进度：底色铺满、主色从左长过去，写「下载中 42%」（先下依赖的写依赖的名字） @param {any} dialog @param {HTMLElement} el */
function fillBar(dialog, el) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = stateOf(dialog);
  const pct = percentOf(m.progress);
  const other = m.progress && m.progress.package && m.progress.package !== m.busy ? nameOf(m, m.progress.package) : null;
  el.style.setProperty('--mk-pct', `${pct ?? 0}%`);
  const label = /** @type {HTMLElement} */ (el.querySelector('.mk-bar-label'));
  // 下完了（100%）核心还在解包、装：写「正在安装…」
  if (label) label.textContent = pct == null ? t('market.preparing') : pct >= 100 && !other ? t('market.installing') : other ? t('market.downloading_dep', { name: other, pct }) : t('market.downloading', { pct });
}

/** @param {Market} m @param {string} id */
const nameOf = (m, id) => m.list.find((p) => p.package === id)?.name ?? id;

/**
 * 整页。第一次进来先读；读着的写「正在读软件源…」。
 * @param {any} dialog
 */
export function drawMarket(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = stateOf(dialog);
  if (!m.generated && !m.error && !m.loading) loadMarket(dialog).catch(() => {});
  if (!m.generated && !m.error) return [h('p.set-empty', t('market.loading'))];
  if (m.error && !m.list.length) {
    // 连不上软件源、本机也没有
    return [h('div.mk-offline', h('strong', t('market.unreachable')), h('code.mk-why', m.error),
      h('button.set-btn', { type: 'button', onclick: () => { m.error = null; m.generated = null; loadMarket(dialog, true).catch(() => {}); redraw(dialog); } }, t('market.retry')))];
  }
  const view = (dialog.marketView ??= { query: '', filter: 'all', kind: null });
  const upgradable = upgradableOf(m);
  const grid = h('div.mk-grid');
  const empty = h('p.set-empty', { hidden: true }, t('market.no_match'));
  const statusChips = h('div.set-pkg-chips.mk-chips', { role: 'tablist' });
  const extra = h('div.mk-extra');
  const chip = (/** @type {string} */ f, /** @type {boolean} */ on, /** @type {number} */ n, /** @type {() => void} */ go) => h(`button.set-pkg-chip${on ? '.is-on' : ''}${n ? '' : '.is-off'}`, {
    type: 'button', role: 'tab', 'aria-selected': String(on), onclick: go,
  }, t(`market.filter.${f}`), h('span', String(n)));
  const update = () => {
    const got = shownOf(m.list, view, upgradable);
    if (view.kind && !got.kinds.includes(/** @type {any} */ (view.kind))) view.kind = null;
    replace(statusChips, [
      ...STATUS_FILTERS.map((f) => chip(f, view.filter === f, got.counts[f], () => { view.filter = f; update(); })),
      // 选着的种类接在后面，点了去掉
      view.kind ? h('button.set-pkg-chip.is-on.mk-kind-on', { type: 'button', title: t('market.kind_clear'), onclick: () => { view.kind = null; update(); } },
        kindName(dialog, view.kind), icon('x')) : null,
    ]);
    filterBtn.classList.toggle('is-on', !!view.kind);
    kindsNow = got;
    replace(grid, got.list.map((p) => card(dialog, p, upgradable)));
    empty.hidden = got.list.length > 0;
    replace(extra, view.filter === 'upgradable' ? upgradeExtras(dialog) : []);
    dialog.body.scrollTop = 0;
  };
  const input = /** @type {HTMLInputElement} */ (h('input.set-pkg-find-input', { type: 'search', value: view.query, placeholder: t('market.search'), 'aria-label': t('market.search'), spellcheck: 'false', autocomplete: 'off' }));
  let composing = false;
  /** @type {any} */
  let timer = 0;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; input.dispatchEvent(new Event('input')); });
  input.addEventListener('input', () => {
    if (composing) return;
    clearTimeout(timer);
    timer = setTimeout(() => { view.query = input.value; update(); }, TYPE_MS);
  });
  /** 现在的个数（筛选菜单照它写） @type {any} */
  let kindsNow = null;
  // 按种类筛（2026-10-21 项目主人：给一个筛选的图标，照包的种类筛；种类照核心给的动态出，以后加了种类不用改网页）
  const filterBtn = /** @type {HTMLButtonElement} */ (h('button.icon-button.mk-filter', {
    type: 'button', title: t('market.kinds'), 'aria-label': t('market.kinds'),
    onclick: () => openKinds(dialog, filterBtn, kindsNow, view, update),
  }, icon(hasIcon('list-filter') ? 'list-filter' : 'sliders-horizontal')));
  const ups = upgradable.size
    ? h('button.mk-ups', { type: 'button', onclick: () => { view.filter = 'upgradable'; update(); } }, t('market.upgrades', { n: upgradable.size }))
    : null;
  const refresh = /** @type {HTMLButtonElement} */ (h(`button.icon-button.mk-refresh${m.refreshing ? '.is-spin' : ''}`, {
    type: 'button', title: t('market.refresh'), 'aria-label': t('market.refresh'), disabled: m.refreshing,
    onclick: async () => {
      m.refreshing = true;
      refresh.disabled = true;
      refresh.classList.add('is-spin');
      await loadMarket(dialog, true);
      m.refreshing = false;
      if (!m.error && !m.refused) dialog.toast(t('market.refreshed', { n: m.list.length }));
      redraw(dialog);
    },
  }, icon('rotate-cw')));
  // 索引的时刻只在有能升级的时候写（2026-10-22 项目主人：平常不用看到）；连不上、用的旧索引的那一句照旧一直写
  const meta = m.stale ? h('p.mk-meta', t('market.stale', { at: whenOf(m.generated) }))
    : upgradable.size ? h('p.mk-meta', t('market.meta', { at: whenOf(m.generated), n: m.list.length })) : null;
  update();
  return [h('div.set-pkg-tools.mk-tools', h('label.set-pkg-find', icon('search'), input), filterBtn, ups, refresh), meta, statusChips, extra, empty, grid];
}

/** 索引的时刻：本地的「10月21日 09:30」 @param {string|null} at */
function whenOf(at) {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * 一张卡片：图标、名字、版本、一句说明，最下面「官方」「社区」（被拉黑的「被拉黑」）和按钮；点别处进详情。
 * @param {any} dialog @param {any} p @param {Set<string>} upgradable
 */
function card(dialog, p, upgradable) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = stateOf(dialog);
  const face = faceOf(p);
  const tag = p.blocked
    ? h('span.mk-tag.is-blocked', { title: String(p.blocked) }, t('market.blocked'))
    : h(`span.mk-tag${p.official ? '.is-official' : ''}`, t(p.official ? 'market.official' : 'market.community'));
  const fresh = !m.seen.has(p.package);
  m.seen.add(p.package);
  return h(`div.mk-card${fresh ? '.is-new' : ''}`, { role: 'button', tabindex: '0', 'data-mk-card': p.package, onclick: (/** @type {Event} */ e) => { if (!(/** @type {HTMLElement} */ (e.target)).closest('button')) openDetail(dialog, p.package); },
    onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openDetail(dialog, p.package); } },
    h('div.mk-card-head', pkgFace(dialog.ctx.core, p, hasIcon(face) ? face : 'package', '.mk-face', typeof p.source === 'string' ? p.source : null),
      h('div.mk-card-title', h('strong', p.name ?? p.package), h('span.mk-version', p.version ?? ''))),
    h('p.mk-summary', p.summary ?? ''),
    h('div.mk-card-foot', tag, actionButton(dialog, p, upgradable, false)),
    m.problems[p.package] ? h('p.mk-problem', m.problems[p.package]) : null);
}

/**
 * 按钮：没装的「安装」、装着的「已安装」（点了进软件包页它的信息页）、能升级的「升级」、在装的一条进度；被拉黑的不画。
 * 同一时刻只装一件：在装的时候别的灰着。`big` 是详情里那个大的。
 * @param {any} dialog @param {any} p @param {Set<string>} upgradable @param {boolean} big
 */
function actionButton(dialog, p, upgradable, big) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = stateOf(dialog);
  const kind = actionOf(p, upgradable, m.busy);
  const cls = big ? '.mk-action.is-big' : '.mk-action';
  if (kind === 'blocked') return null;
  // 平时只装得进自己那一层的成员：带程序的装不了，灰着写「需要管理员安装」（管理员的照旧「安装」，点了提示进管理员模式）
  if (kind === 'install' && dialog.ctx.host?.member && hasProgram(p)) {
    return h(`button.set-btn${cls}`, { type: 'button', disabled: true }, t('market.needs_admin'));
  }
  if (kind === 'busy') {
    const bar = h(`div${cls}.mk-bar`, { 'data-market-busy': p.package }, h('span.mk-bar-label'));
    fillBar(dialog, bar);
    return bar;
  }
  if (kind === 'installed') {
    // 悬停变「卸载」（2026-10-21 项目主人），点了先弹窗问
    // 刚装好的：鼠标还停在上面，移开过一次才悬停变「卸载」
    const just = m.just === p.package;
    return h(`button.set-btn${cls}.mk-installed${just ? '.is-just' : ''}`, {
      type: 'button', disabled: !!m.busy, title: just ? undefined : t('market.uninstall'), onclick: () => uninstall(dialog, p),
      onpointerleave: (/** @type {Event} */ e) => {
        if (m.just === p.package) m.just = null;
        const el = /** @type {HTMLElement} */ (e.currentTarget);
        el.classList.remove('is-just');
        el.title = t('market.uninstall');
      },
    },
      h('span.mk-when-idle', t('market.installed')), h('span.mk-when-hover', t('market.uninstall')));
  }
  const up = (m.up?.upgrades ?? []).find((/** @type {any} */ u) => u.package === p.package);
  return h(`button.set-btn.is-primary${cls}`, {
    type: 'button', disabled: !!m.busy, title: kind === 'upgrade' && up ? `${up.from} → ${up.to}` : undefined,
    onclick: () => (kind === 'upgrade' ? upgrade(dialog, [p.package]) : install(dialog, p, big)),
  }, t(kind === 'upgrade' ? 'market.upgrade' : 'market.install'));
}

/** 看一眼（只照索引说，不下载）：同一个编号只问一次，刷新了重问 @param {any} dialog @param {string} id */
function previewOf(dialog, id) {
  const m = stateOf(dialog);
  // 平时（成员、不在管理员模式的管理员）装进自己那一层（核心 U23下上），预览照问；带程序的自己那一层装不了，不问：成员写「需要管理员安装」，管理员写「仅管理员可以修改」
  if ((dialog.adminLocked || dialog.ctx.host?.member) && hasProgram(m.list.find((/** @type {any} */ x) => x.package === id))) {
    const say = dialog.ctx.host?.member ? 'market.needs_admin' : 'admin_mode.locked';
    return Promise.reject(Object.assign(new Error(dialog.ctx.text(say)), { reason: 'admin_locked' }));
  }
  if (!m.previews.has(id)) m.previews.set(id, dialog.ctx.core.request('package.install', { source: id, preview: true }));
  return /** @type {Promise<any>} */ (m.previews.get(id));
}

/**
 * 装：卡片上点的先看一眼，要权限、要一起装依赖的先开详情给人看（再点一次才装）；详情里点的直接装。
 * @param {any} dialog @param {any} p @param {boolean} fromDetail
 */
async function install(dialog, p, fromDetail) {
  const m = stateOf(dialog);
  if (m.busy) return;
  // 带程序的只能装给所有人：平时的管理员提示进管理员模式，不发请求
  if (hasProgram(p) && dialog.adminGuard()) return;
  delete m.problems[p.package];
  if (!fromDetail) {
    try {
      if (needsLook(await previewOf(dialog, p.package))) { openDetail(dialog, p.package); return; }
    } catch (err) {
      m.problems[p.package] = problemText(dialog, err);
      redraw(dialog);
      return;
    }
  }
  await run(dialog, p.package, () => dialog.ctx.core.request('package.install', { source: p.package }), (got) => {
    const name = p.name ?? p.package;
    // 带程序的装好了照旧默认不开（核心照设计 37 第四节第 4 条）：提示到软件包页打开它
    dialog.toast(dialog.ctx.text(got?.enabled === false ? 'market.done_off' : 'market.done', { name }));
  });
}

/** 升级：几个编号（全部的是 `null`） @param {any} dialog @param {string[]|null} ids */
async function upgrade(dialog, ids) {
  const busy = ids?.[0] ?? '*';
  await run(dialog, busy, () => dialog.ctx.core.request('package.upgrade', ids ? { packages: ids } : {}), (got) => {
    const n = (got?.upgraded ?? []).length;
    dialog.toast(dialog.ctx.text('market.upgraded', { n }));
  });
}

/**
 * 装、升的共用：记着在装哪一个（进度条照它）、拒了的话写在那张卡片下面、成了重问一遍。
 * @param {any} dialog @param {string} id @param {() => Promise<any>} call @param {(got: any) => void} done
 */
async function run(dialog, id, call, done) {
  // 平时也照发：装、卸、升级的是自己那一层（核心 U23下上）；系统那一层的核心拒了照原因写在卡片下面（`admin_mode_required` 另在设置页提示、能一键进入）
  const m = stateOf(dialog);
  m.busy = id;
  m.progress = null;
  const started = performance.now();
  redraw(dialog);
  try {
    const got = await call();
    // 进度条至少留一会儿、列表重读完了再换成「已安装」：太快的一闪而过、中间闪回「安装」都像在闪（2026-10-21 项目主人）
    await Promise.all([loadMarket(dialog, false, false), relist(dialog), new Promise((r) => setTimeout(r, Math.max(0, BAR_MIN_MS - (performance.now() - started))))]);
    m.busy = null;
    m.just = id;
    done(got);
    redraw(dialog);
  } catch (err) {
    m.busy = null;
    m.problems[id] = problemText(dialog, err);
    redraw(dialog);
  }
}

/** 没订着软件包推送的（成员订不了 `packages` 流，核心 U23下上）：装、卸完重读一次列表，软件包页照它 @param {any} dialog */
async function relist(dialog) {
  if (dialog.feed?.live) return;
  const got = await dialog.ctx.core.request('package.list', {}).catch(() => null);
  if (Array.isArray(got?.packages)) dialog.packages = got.packages;
}

/** 核心拒的话（蓝图第 12a 条第 8 条） @param {any} dialog @param {any} err */
function problemText(dialog, err) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  switch (err?.reason) {
    case 'unknown_package': return t('market.bad.unknown');
    case 'depends_missing': return t('market.bad.depends', { names: (err.data?.missing ?? []).join('、') });
    case 'wrong_target': return t('market.bad.target');
    case 'download_failed': return `${t('market.bad.download')}：${err.data?.why ?? ''}`;
    case 'admin_mode_required': return t('admin_mode.locked');
    case 'not_permitted': return t('market.needs_admin');
    default: return err?.message ?? String(err);
  }
}

/**
 * 「可升级」那一页顶上多「全部升级」，下面一组暗字写不升的为什么（来源仓库变了、软件源里没了、被拉黑、不升的）。
 * @param {any} dialog
 */
function upgradeExtras(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = stateOf(dialog);
  const up = m.up ?? {};
  const all = (up.upgrades ?? []).length
    ? h('div.mk-upall', h('button.set-btn.is-primary', { type: 'button', disabled: !!m.busy, onclick: () => confirmAll(dialog) }, t('market.upgrade_all')))
    : null;
  const why = [
    ...(up.moved ?? []).map((/** @type {any} */ x) => t('market.skip.moved', { name: nameOf(m, x.package) })),
    ...(up.gone ?? []).map((/** @type {any} */ x) => t('market.skip.gone', { name: nameOf(m, typeof x === 'string' ? x : x.package) })),
    ...(up.blocked ?? []).map((/** @type {any} */ x) => t('market.skip.blocked', { name: nameOf(m, x.package), reason: x.reason ?? '' })),
    ...(up.held ?? []).map((/** @type {any} */ x) => t('market.skip.held', { name: nameOf(m, typeof x === 'string' ? x : x.package) })),
  ];
  return [all, why.length ? h('div.mk-skips', why.map((w) => h('p', w))) : null].filter(Boolean);
}

/** 全部升级：先看一眼（`preview`），弹窗列「名字 旧版本 → 新版本」和下载多大，确认了才升 @param {any} dialog */
async function confirmAll(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = stateOf(dialog);
  let got;
  if (dialog.adminGuard()) return;
  try {
    got = await dialog.ctx.core.request('package.upgrade', { preview: true });
  } catch (err) {
    dialog.toast(problemText(dialog, err));
    return;
  }
  const rows = (got?.upgrades ?? []).map((/** @type {any} */ u) => h('li', h('span', nameOf(m, u.package)), h('code', `${u.from} → ${u.to}`)));
  const close = () => leave(layer, () => layer.remove());
  const layer = h('div.mk-ask', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } },
    h('div.mk-ask-card', { role: 'dialog', 'aria-modal': 'true' },
      h('strong', t('market.upgrade_all_title', { n: rows.length })),
      h('ul.mk-ask-list', rows),
      h('p.mk-ask-size', t('market.download', { size: bytes(got?.download ?? 0) })),
      h('div.mk-ask-foot',
        h('button.set-btn', { type: 'button', onclick: close }, t('market.cancel')),
        h('button.set-btn.is-primary', { type: 'button', onclick: () => { close(); upgrade(dialog, null); } }, t('market.upgrade_all')))));
  layer.addEventListener('set-dismiss', close);
  dialog.panel.append(layer);
}

/** 点进详情（同软件包的信息页，滑进来） @param {any} dialog @param {string} id */
function openDetail(dialog, id) {
  const m = stateOf(dialog);
  dialog.openSub(nameOf(m, id), () => detailPage(dialog, id), { bare: true });
}

/**
 * 详情：图标、名字、说明、版本、官方还是社区（社区的接一句没人审过），下面照看一眼的回应一行一项，底下右边一个大按钮。
 * @param {any} dialog @param {string} id
 */
function detailPage(dialog, id) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = stateOf(dialog);
  const p = m.list.find((x) => x.package === id);
  if (!p) return [h('p.set-empty', t('market.bad.unknown'))];
  const face = faceOf(p);
  const head = h('div.mk-detail-head', pkgFace(dialog.ctx.core, p, hasIcon(face) ? face : 'package', '.mk-face.is-big', typeof p.source === 'string' ? p.source : null),
    h('div.mk-detail-text', h('strong', p.name ?? p.package), h('p', p.summary ?? ''),
      h('p.mk-version', [t('market.version', { version: p.version ?? '' }), t(p.official ? 'market.official' : 'market.community')].join(' · ')),
      p.official ? null : h('p.mk-warn', t('market.community_warn')),
      p.blocked ? h('p.mk-warn.is-blocked', t('market.blocked_why', { reason: String(p.blocked) })) : null));
  const rows = h('div.set-rows', h('p.set-empty', t('market.loading')));
  const line = (/** @type {string} */ label, /** @type {any} */ value) => h('div.set-row', h('div.set-text', h('div.set-name', h('span', label))), h('div.set-control.mk-value', value));
  previewOf(dialog, id).then((got) => {
    const names = Object.fromEntries(Object.keys(got?.provides ?? p.provides ?? {}).map((k) => [k, kindName(dialog, k)]));
    const items = [
      got?.origin ? line(t('market.origin'), h('a.mk-link', { href: /^https?:\/\//.test(got.origin) ? got.origin : `https://${got.origin}`, target: '_blank', rel: 'noopener noreferrer' }, h('code', got.origin), icon('external-link'))) : null,
      line(t('market.includes'), providesLine(got?.provides ?? p.provides, names) || t('market.nothing')),
      line(t('market.capabilities'), (got?.capabilities ?? []).length ? (got.capabilities).join('、') : t('market.none')),
      (got?.with ?? []).length ? line(t('market.with'), h('div.mk-with', got.with.map((/** @type {any} */ w) => h('code', `${w.package} ${w.version ?? ''}`)))) : null,
      typeof got?.download === 'number' ? line(t('market.size'), bytes(got.download)) : null,
      // 装着别的版本的才写「替换」（同一个版本重装不写）
      got?.replaces && got.replaces.version !== p.version ? line(t('market.replaces'), t('market.replaces_version', { version: got.replaces.version ?? '' })) : null,
    ].filter(Boolean);
    replace(rows, items);
  }, (err) => replace(rows, h('p.set-empty.is-bad', problemText(dialog, err))));
  const action = actionButton(dialog, p, upgradableOf(m), true);
  return [head, h('section.set-group', h('h3.set-group-name', t('market.about')), rows),
    h('div.mk-detail-foot', m.problems[id] ? h('p.mk-problem', m.problems[id]) : null, action)];
}

/**
 * 卸载：先弹窗问，`package.remove`，卸了重问一遍（拒了的写在那张卡片下面：必需的、别的包依赖它的）。
 * @param {any} dialog @param {any} p
 */
async function uninstall(dialog, p) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = stateOf(dialog);
  if (m.busy) return;
  const name = p.name ?? p.package;
  if (!(await confirmIn(dialog.panel.querySelector('.set-body') ?? dialog.panel, { text: t('market.uninstall_ask', { name }), yes: t('market.uninstall'), no: t('market.cancel') }))) return;
  await run(dialog, p.package, () => dialog.ctx.core.request('package.remove', { package: p.package }), () => dialog.toast(t('market.uninstalled', { name })));
}

/** 种类的名字：认得的照字表（`market.filter.*`），核心以后加的种类照编号写 @param {any} dialog @param {string} k */
function kindName(dialog, k) {
  const key = `market.filter.${k}`;
  const got = dialog.ctx.text(key);
  return got && got !== key ? got : k;
}

/**
 * 筛选菜单：开在图标下面，一种一行（名字、个数），「全部种类」在最上面；点了换、收起；`Esc`、点外面收起。
 * @param {any} dialog @param {HTMLElement} at @param {any} got @param {{kind: string|null}} view @param {() => void} update
 */
function openKinds(dialog, at, got, view, update) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  dialog.panel.querySelector('.mk-kinds-menu')?.remove();
  if (!got) return;
  const close = () => leave(menu, () => menu.remove());
  const pick = (/** @type {string|null} */ k) => () => { view.kind = k; close(); update(); };
  const row = (/** @type {string|null} */ k, /** @type {string} */ name, /** @type {number} */ n) => h(`button.set-menu-item${view.kind === k ? '.is-on' : ''}`, { type: 'button', onclick: pick(k) },
    h('span', name), h('span.mk-kinds-n', String(n)), view.kind === k ? icon('check') : null);
  const menu = h('div.set-menu.mk-kinds-menu', { role: 'menu', 'data-set-dismiss': '1' },
    row(null, t('market.kinds_all'), got.counts.all ?? 0),
    ...got.kinds.map((/** @type {string} */ k) => row(k, kindName(dialog, k), got.counts[k] ?? 0)),
    // 一个都分不出种类的（软件源里的包还没写种类、什么都没带）：照样开，写一句
    got.kinds.length ? null : h('p.mk-kinds-none', t('market.kinds_none')));
  menu.addEventListener('set-dismiss', close);
  const box = at.getBoundingClientRect();
  const panel = dialog.panel.getBoundingClientRect();
  const zoom = panel.width / dialog.panel.offsetWidth || 1;
  menu.style.top = `${(box.bottom - panel.top) / zoom + 6}px`;
  menu.style.right = `${(panel.right - box.right) / zoom}px`;
  dialog.panel.append(menu);
  const away = (/** @type {MouseEvent} */ e) => {
    if (!menu.isConnected) { document.removeEventListener('pointerdown', away, true); return; }
    if (!menu.contains(/** @type {Node} */ (e.target)) && e.target !== at && !at.contains(/** @type {Node} */ (e.target))) { document.removeEventListener('pointerdown', away, true); close(); }
  };
  document.addEventListener('pointerdown', away, true);
}
