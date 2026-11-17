// @ts-check
//! 「核心已停止」的卡（蓝图 `web.md`「连核心」第 1 条，核心 CS-5，W-1210）：开着的页面断了以后自己重连，核心是人停的（`miyu core stop`、
//! 托盘的「退出」），那一头不拉起它。页面正中一张卡（同「连不上核心」那张的样子，`boot-card`；淡遮罩），标题照那一头给的那一句（核心
//! `core/start/stopped_by_user`，照那台机器的语言），下面一个「启动」：点了照常连、那一头拉起核心，按钮写「正在启动…」、灰着；接上了
//! （重新握手、补完）收卡；拉不起来的照那一句写在标题下面，按钮放开。断着时照常隔一会儿再试：别处把核心起来了就自己接上、收卡。

import { h } from './dom.js';
import { show, hide } from '../lib/motion.js';
import { t } from '../util/res.js';
import { Refusal } from '../core/connection.js';

export class StoppedCard {
  /** @param {() => Promise<unknown>} start 照常连（`Connection.start`） */
  constructor(start) {
    this.run = start;
    this.title = h('h1', { id: 'core-stopped-title' });
    this.why = h('p.boot-why', { hidden: true });
    this.button = /** @type {HTMLButtonElement} */ (h('button.core-start', { type: 'button', onclick: () => this.start() }, t('boot.start')));
    this.el = h('div.core-stopped', { hidden: true, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'core-stopped-title' },
      h('div.boot-card', this.title, this.why, h('div.core-stopped-foot', this.button)));
  }

  /** 人停的：出卡，标题照那一头给的那一句；正在启动的不打断。 @param {string} message */
  stopped(message) {
    this.title.textContent = message;
    if (this.el.hidden) {
      this.idle();
      this.why.hidden = true;
      show(this.el);
      this.button.focus();
    }
  }

  /** 点了「启动」以后那一头连不上、拉不起核心（`core_unreachable`）：那一句写在标题下面，按钮放开。没开着卡的不管。 @param {string} message */
  failed(message) {
    if (this.el.hidden) return;
    this.why.textContent = message;
    this.why.hidden = false;
    this.idle();
  }

  /** 接上了（重新握手、补完）：收卡。 */
  joined() {
    if (!this.el.hidden) hide(this.el);
    this.idle();
  }

  /** 点了「启动」。 */
  start() {
    if (this.button.disabled) return;
    this.button.disabled = true;
    this.button.textContent = t('boot.starting');
    this.why.hidden = true;
    // 线都开不了的（网页软件、桥没在跑）只写「启动失败」；那一头说了原因的照它（`failed`）
    this.run().catch((/** @type {any} */ err) => this.failed(err instanceof Refusal ? err.message : t('boot.start_failed')));
  }

  /** 按钮放开、写回「启动」。 */
  idle() {
    this.button.disabled = false;
    this.button.textContent = t('boot.start');
  }
}
