// @ts-check
//! 界面块（软件包 `widgets`，蓝图 `web.md`「界面块」；设计 33、核心 `widgets.md`）：扩展包往网页上放的东西，包只说放什么，这里画。
//! 一条订阅（`subscribe {stream: "widgets"}`）照屏上这一刻有的位置、正在看的会话、开着的整页；换会话、开关面板、开关整页重新订阅（一个
//! 微任务里攒齐了发一次），推来 `widget.changed` 换那一块、`resync` 重新订阅，断了又连上重新握手以后重新订阅。画进三个挂载位：
//! `stage.home`（新会话的首页）、`stage.panel`（右边一栏的「面板」）、`composer.status`（输入框下面那一行的右边）；整页由软件包 `backstage`
//! 经服务 `widgets` 的 `page` 画。比 X-15 旧的核心不认这条订阅：什么都不画。

import { Blocks, showingOf, keyOf, LIMITS } from './model.js';
import { drawBlock, fill, drawStatus } from './render.js';
import { h, hasIcon } from '../../src/lib/dom.js';

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ path, /** @type {any} */ fields) => ctx.text(path, fields);
  const blocks = new Blocks();
  /** 正在看的会话（新会话的首页是 `null`） */
  let session = ctx.chat.current?.() ?? null;
  /** 右边一栏露着、在看「面板」那一页 */
  let panel = false;
  /** 开着的界面块整页 @type {{package: string, widget: string, el: HTMLElement}|null} */
  let page = null;
  let queued = false;
  let alive = true;

  /** 动作：调方法、开整页、复制。 @param {any} action @param {import('./model.js').Block} block */
  const act = (action, block) => {
    const say = (/** @type {string} */ text, good = false) => ctx.composer?.say(text, good);
    if (typeof action?.call === 'string') {
      ctx.core.request('package.call', { package: block.package, method: action.call, ...(action.params === undefined ? {} : { params: action.params }) })
        .catch((/** @type {any} */ err) => say(err?.message ?? String(err)));
    } else if (typeof action?.open === 'string') ctx.backstage?.open(block.package, action.open);
    else if (typeof action?.copy === 'string') {
      Promise.resolve(ctx.host.clipboard?.write(action.copy)).then(() => say(t('copied'), true), (/** @type {any} */ err) => say(err?.message ?? String(err)));
    }
  };

  /**
   * 一个位置：挂载位里挂一个盒子，有块才挂；盒子里一块一个节点，照键留着（展开了的还展开着）。
   * @param {string} slot @param {'home'|'sidebar'} place @param {string} cls
   */
  const place = (slot, place, cls) => {
    const box = h(`div.${cls}`);
    const nodes = /** @type {Map<string, HTMLElement>} */ (new Map());
    let undo = /** @type {(() => void)|null} */ (null);
    let all = false;
    const limit = LIMITS[place];
    const draw = (/** @type {import('./model.js').Block[]} */ list) => {
      if (!list.length) {
        undo?.();
        undo = null;
        return;
      }
      if (!undo) undo = ctx.slots.mount(slot, { id: 'widgets', order: 50, render: () => box });
      const shown = all ? list : list.slice(0, limit.blocks);
      const keep = new Set(shown.map(keyOf));
      for (const [k, el] of [...nodes]) if (!keep.has(k)) { el.remove(); nodes.delete(k); }
      const opts = { rows: limit.rows, text: t, act };
      const kids = shown.map((b) => {
        let el = nodes.get(keyOf(b));
        if (el) fill(el, b, opts);
        else nodes.set(keyOf(b), (el = drawBlock(b, opts)));
        return el;
      });
      const rest = list.length - shown.length;
      box.replaceChildren(...kids, ...(rest > 0 ? [h('button.wg-more', { type: 'button', onclick: () => { all = true; draw(list); } }, t('more_blocks', { count: rest }))] : []));
    };
    return { draw, drop: () => { undo?.(); undo = null; } };
  };
  const home = place('stage.home', 'home', 'wg-home');
  const side = place('stage.panel', 'sidebar', 'wg-panel');
  // 底栏：一格一小段字，没内容的不画
  const statusBox = h('span.wg-statuses');
  let statusUndo = /** @type {(() => void)|null} */ (null);
  const drawStatuses = () => {
    const spans = blocks.at('status').slice(0, LIMITS.status.blocks).map(drawStatus).filter(Boolean);
    if (spans.length && !statusUndo) statusUndo = ctx.slots.mount('composer.status', { id: 'widgets', render: () => statusBox });
    if (!spans.length && statusUndo) { statusUndo(); statusUndo = null; }
    statusBox.replaceChildren(.../** @type {HTMLElement[]} */ (spans));
  };
  const drawPage = () => {
    if (!page) return;
    const b = blocks.get(page.package, page.widget);
    if (!b) page.el.replaceChildren(h('p.bs-empty', t('page_gone')));
    else if (page.el.firstElementChild?.classList.contains('wg-block')) fill(/** @type {HTMLElement} */ (page.el.firstElementChild), b, { rows: Infinity, text: t, act, head: false });
    else page.el.replaceChildren(drawBlock(b, { rows: Infinity, text: t, act, head: false }));
  };
  /** 软件包自己写的图标不在常用那一套里的：读整套（用到时才读一次），读完重画 */
  let iconsAsked = false;
  const draw = () => {
    if (!iconsAsked && [...blocks.map.values()].some((b) => b.icon && !hasIcon(b.icon))) {
      iconsAsked = true;
      Promise.resolve(ctx.icons?.more()).then(draw, () => {});
    }
    home.draw(session ? [] : blocks.at('home'));
    side.draw(blocks.at('sidebar'));
    drawStatuses();
    drawPage();
  };

  /** 重新订阅（攒齐这一轮的变化发一次）。 */
  const subscribe = () => {
    if (queued || !alive) return;
    queued = true;
    queueMicrotask(async () => {
      queued = false;
      const params = {
        stream: 'widgets',
        // 开着整页时整个窗口都盖住了：别的位置都不算在看，只带这一页
        showing: page ? [] : showingOf({ home: !session, panel }),
        ...(session ? { session } : {}),
        ...(page ? { page: { package: page.package, widget: page.widget } } : {}),
      };
      try {
        const got = await ctx.core.request('subscribe', params);
        if (!alive) return;
        blocks.reset(Array.isArray(got?.widgets) ? got.widgets : []);
      } catch {
        // 比 X-15 旧的核心、断着：什么都不画，连上以后重新订阅
        blocks.reset([]);
      }
      draw();
    });
  };

  const onPush = (/** @type {string} */ method, /** @type {any} */ params) => {
    if (method === 'widget.changed') {
      blocks.apply(params);
      draw();
    } else if (method === 'resync' && params?.stream === 'widgets') subscribe();
  };
  ctx.core.onPush(onPush);
  ctx.effect(() => () => ctx.core.pushes?.delete(onPush));
  ctx.effect(() => ctx.core.onRejoin?.(subscribe) ?? (() => {}));
  ctx.on('session.opened', (/** @type {string|null} */ id) => { session = id ?? null; subscribe(); });
  ctx.on('session.created', (/** @type {{to: string}} */ e) => { session = e?.to ?? session; subscribe(); });
  ctx.on('panel.changed', (/** @type {boolean} */ shown) => { panel = !!shown; subscribe(); });
  ctx.effect(() => () => {
    alive = false;
    home.drop();
    side.drop();
    statusUndo?.();
    ctx.core.request('unsubscribe', { stream: 'widgets' }).catch(() => {});
  });

  ctx.provide('widgets', {
    /**
     * 整页（软件包 `backstage` 开 `#package=…&widget=…` 时）：交回放内容的节点和收掉的函数；标题照 `package.list` 的、程序推的照这一块的。
     * @param {string} pkg @param {string} widget
     */
    page: (pkg, widget) => {
      const el = h('div.wg-page');
      page = { package: pkg, widget, el };
      subscribe();
      return {
        el,
        close: () => {
          if (page?.el !== el) return;
          page = null;
          subscribe();
        },
      };
    },
  });
  subscribe();
}
