// @ts-check
//! 人格的「推演人生」（核心设计 70 第二节第 10 条、第三节第 9 条；蓝图 `web.md`「推演人生」第 1、2 条）：
//! - 开关：照 `life.status` 摆（在跑的开着）。拨开：没有的、结束了的先问一句（她会自己醒来、每次醒是一次模型请求会多花 token、她会自己记事），
//!   确认了 `life.start`；暂停着的 `life.resume`。拨关是 `life.pause`（关掉算暂停，不是结束，不问）。当场生效，不等「保存」；开没开不写进人格文件。
//!   下面一行暗字写状态：「进行中 · 下次醒 14:05」「已暂停」「上一段已结束」，她最近写的「在干嘛」接在后面；有人生会话的多一个「打开」。
//! - 引导里新建人格那一屏（`welcome.js`）：人格还没建，只记下想开；「下一步」建好人格以后再 `life.start`（拨开时已经问过）。
//! 「推演方法」那一格（收在「高级」里）在 `persona-editor.js`。

import { h } from '../../src/lib/dom.js';
import { lifeState, lifeToggle } from '../../src/lib/life.js';

/** 核心拒了给人看的那一句（同 `persona-editor.js` 的 `refusalText`；不 import 它，免得两个文件互相引）。 @param {any} err */
const refusalText = (err) => err?.data?.message ?? err?.message ?? String(err);

/**
 * @typedef {import('./form.js').Kit} Kit
 * @typedef {{id: () => string|null, open?: (session: string) => void, say: (text: string) => void, changed?: (on: boolean) => void}} Hooks
 *   `id` 人格编号（引导里还没建的是 `null`：只记下想开）；`open` 打开人生会话（设置页里有，引导里没有）；`say` 出错写在卡片里；
 *   `changed` 开关摆成开、关以后（人格详情照它露出、收起推演方法）
 */

export class LifeSwitch {
  /** @param {any} ctx `setup` 包的 ctx @param {Kit} kit @param {Hooks} hooks */
  constructor(ctx, kit, hooks) {
    this.ctx = ctx;
    this.kit = kit;
    this.hooks = hooks;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    /** @type {ReturnType<typeof lifeState>} */
    this.now = lifeState(null);
    /** 引导里还没建人格时拨开了：建好以后开 */
    this.wanted = false;
    this.toggle = kit.toggle(false, (on) => this.change(on));
    this.line = h('small.setup-life-line');
    this.link = /** @type {HTMLButtonElement} */ (h('button.setup-link', { type: 'button', hidden: true, onclick: () => { if (this.now.session) this.hooks.open?.(this.now.session); } }, this.t('life.open')));
    this.status = h('div.setup-life-status', this.line, this.link);
    this.paint();
  }

  /** 读这个人格现在的人生（引导里还没建人格的不读）。读不到的（旧核心没有 `life.*`）整行藏起来。 */
  async load() {
    const id = this.hooks.id();
    if (!id) return true;
    try {
      this.now = lifeState(await this.ctx.core.request('life.status', { persona: id }));
    } catch {
      return false;
    }
    this.paint();
    return true;
  }

  /** 开关现在是不是开着：在跑的；引导里还没建人格、拨开了的。 */
  on() {
    return this.now.state === 'running' || (!this.hooks.id() && this.wanted);
  }

  paint() {
    const t = this.t;
    const on = this.on();
    this.hooks.changed?.(on);
    this.toggle.classList.toggle('is-on', on);
    this.toggle.setAttribute('aria-checked', String(on));
    const s = this.now;
    const head = s.state === 'running' && s.next ? t('life.running_next', { time: wakeAt(s.next) })
      : s.state === 'none' ? t('life.hint') : t(`life.state.${s.state}`);
    this.line.textContent = s.doing && s.state !== 'ended' ? `${head} · ${s.doing}` : head;
    this.line.title = this.line.textContent;
    this.link.hidden = !s.session || !this.hooks.open;
  }

  /** 拨开关：交回 `false` 的开关拨回去。 @param {boolean} on */
  async change(on) {
    const id = this.hooks.id();
    const act = lifeToggle(this.now.state, on);
    if (act === 'start' && !(await this.kit.confirm(this.toggle, this.t('life.ask')))) return false;
    if (!id) {
      this.wanted = on;
      this.paint();
      return true;
    }
    if (!act) return true;
    try {
      const got = await this.ctx.core.request(`life.${act}`, { persona: id });
      // `start` 回 `{session}`，别的回状态：都再问一次，照核心的写
      this.now = act === 'start' ? lifeState(await this.ctx.core.request('life.status', { persona: id })) : lifeState(got);
    } catch (err) {
      this.hooks.say(refusalText(err));
      return false;
    }
    this.paint();
    return true;
  }

  /** 引导里人格建好了：拨开过的这时开。 @param {string} id */
  async started(id) {
    if (!this.wanted) return null;
    try {
      await this.ctx.core.request('life.start', { persona: id });
      return null;
    } catch (err) {
      return refusalText(err);
    }
  }
}

/** 下次醒：今天只写时刻，别的天带上月/日（浏览器本地时区）。 @param {Date} at */
function wakeAt(at) {
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return at.toDateString() === new Date().toDateString() ? hm : `${at.getMonth() + 1}/${at.getDate()} ${hm}`;
}
