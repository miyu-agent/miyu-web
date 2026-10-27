// @ts-check
//! 设置页的「定时任务」一页（蓝图 `web.md`「定时任务」第 1 条；挂进设置页的 `settings.section`）：顶上「＋ 新建」，下面一个任务一行——那句话、
//! 「AI 建的」、什么时候 · 在哪 · 下次、跳过了的原因；右边开关（停、续）、删除（先问）。一页是一个常驻的对象：设置页重画、关了再开交回的是同一块。
//! 开着时订着 `schedules` 流（`store.hold`），不在页面上了放开。

import { h, icon, replace } from '../../src/lib/dom.js';
import { metaText, skipText } from './model.js';
import { openForm } from './form.js';

export class SchedulesPage {
  /** @param {any} ctx `schedules` 包的 ctx @param {import('./store.js').ScheduleStore} store */
  constructor(ctx, store) {
    this.ctx = ctx;
    this.store = store;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.el = h('div.sch-page');
    /** @type {any} */
    this.kit = null;
    /** 从右侧栏卡片点进来的那个会话（新建时「跑在会话」默认选它）；用过一次清掉 @type {string|null} */
    this.from = null;
    /** 刚建好的那一行淡淡亮一下 @type {string|null} */
    this.fresh = null;
    /** @type {(() => void)|null} */
    this.release = null;
    store.on(() => { if (this.el.isConnected) this.draw(); else this.letGo(); });
  }

  /** 不在页面上了：放开流 */
  letGo() {
    this.release?.();
    this.release = null;
  }

  /** 设置页画这一页：开着时订着流（读一次），交回同一块。 @param {any} kit */
  render(kit) {
    this.kit = kit;
    if (!this.release) this.release = this.store.hold();
    this.draw();
    // 设置框关了（这一块不在页面上了）放开流：关的时候没有推送来叫，过一会儿看一眼
    clearInterval(this.watch);
    this.watch = setInterval(() => {
      if (this.el.isConnected) return;
      clearInterval(this.watch);
      this.letGo();
    }, 2000);
    return this.el;
  }

  /** 会话的标题（会话表里的；没有的 `null`） @param {string} id */
  title(id) {
    return this.ctx.chat?.title?.(id) ?? this.ctx.sessions?.index?.get?.(id)?.title ?? null;
  }

  draw() {
    const t = this.t;
    const kit = this.kit;
    if (!kit) return;
    const now = new Date();
    const list = this.store.list;
    const add = kit.button(`＋ ${t('new')}`, { primary: true }, () => {
      const from = this.from;
      this.from = null;
      openForm(this.ctx, kit, this.store, { session: from, done: (id) => { this.fresh = id; this.draw(); } });
    });
    const rows = list.map((s) => {
      const skip = skipText(s, t);
      const toggle = kit.toggle(!s.paused, async (/** @type {boolean} */ on) => {
        try {
          await this.store.act(on ? 'schedule.resume' : 'schedule.pause', { id: s.id });
          return true;
        } catch (err) {
          const e = /** @type {any} */ (err);
          kit.toast(e?.data?.problem === 'past' ? t('past') : e?.message ?? String(err));
          return false;
        }
      });
      toggle.title = t('running');
      const remove = h('button.icon-button.sch-remove', { type: 'button', title: t('delete'), 'aria-label': t('delete'), onclick: async () => {
        if (!await kit.confirm(remove, t('delete_ask'))) return;
        try {
          await this.store.act('schedule.cancel', { id: s.id });
        } catch (err) {
          kit.toast(/** @type {any} */ (err)?.message ?? String(err));
        }
      } }, icon('trash-2'));
      const fresh = this.fresh === s.id;
      return h(`div.set-row.sch-row${s.paused ? '.is-paused' : ''}${fresh ? '.is-fresh' : ''}`, { dataset: { id: s.id } },
        h('div.set-text',
          h('div.set-name', h('span.sch-prompt', { title: s.prompt }, s.prompt), s.by?.kind === 'model' ? h('span.sch-tag', t('ai_made')) : null),
          h('p.set-desc', metaText(s, now, (id) => this.title(id), t)),
          skip ? h('p.set-desc.sch-skip', skip) : null),
        h('div.set-control.sch-control', toggle, remove));
    });
    this.fresh = null;
    replace(this.el,
      h('div.sch-top', add),
      rows.length ? kit.group(null, ...rows) : h('p.set-empty', t('empty')));
  }
}
