// @ts-check
//! 改长期目标的浮层（软件包 `goal`，蓝图 `web.md`「长期目标」第 3 条；2026-10-12 项目主人定）：点输入框右上方的目标打开，在输入框上面、
//! 和后台任务的浮层同一个位置、同一个样子。头一行「目标」和状态（进行中 · 第 2 轮）；一个框放目标原文，只改原文（不改轮数上限）；
//! 底下「清除」（点一下变「确认清除」，再点才清）、「暂停」/「继续」，右边「保存」（原文没变、空着的点不了）。`Enter` 保存、
//! `Shift+Enter` 换行，`Esc`、点外面、再点那一截关上。做法都交核心的 `/goal`（`edit <原文>`、`pause`、`resume`、`clear`），回执写进
//! 提示；拒了的写在浮层里。保存、清除以后关上，暂停、继续留着（状态照推来的会话状态换）。

import { h } from '../../src/lib/dom.js';
import { show, hide } from '../../src/lib/motion.js';

export class GoalPanel {
  /**
   * @param {(path: string, fields?: any) => string} t 这个包的字
   * @param {{run: (args: string) => Promise<string|null>, anchor: () => Element}} on `run` 交核心 `/goal <args>`，拒了交回为什么、成了交回 `null`；`anchor` 那一截（点它不算点外面）
   */
  constructor(t, on) {
    this.t = t;
    this.on = on;
    /** @type {{text: string, state: string, tail: string}|null} 现在的目标 */
    this.goal = null;
    this.state = h('span.goal-panel-state');
    this.field = /** @type {HTMLTextAreaElement} */ (h('textarea.goal-panel-field', { rows: 3, spellcheck: 'false' }));
    this.error = h('p.goal-panel-error', { hidden: true });
    this.clear = /** @type {HTMLButtonElement} */ (h('button.goal-panel-btn.is-danger', { type: 'button', onclick: () => this.clearClicked() }));
    this.pause = /** @type {HTMLButtonElement} */ (h('button.goal-panel-btn', { type: 'button', onclick: () => this.act(this.goal?.state === 'paused' ? 'resume' : 'pause', false) }));
    this.save = /** @type {HTMLButtonElement} */ (h('button.goal-panel-btn.is-primary', { type: 'button', onclick: () => this.saveClicked() }, t('panel.save')));
    this.el = h('div.goal-panel.dock-float', { hidden: true, role: 'dialog', 'aria-label': t('panel.title') },
      h('div.goal-panel-head', h('strong', t('panel.title')), this.state),
      this.field, this.error,
      h('div.goal-panel-bar', this.clear, this.pause, h('span.goal-panel-gap'), this.save));
    /** 「清除」点过一下、等确认 */
    this.confirming = false;
    this.field.addEventListener('input', () => this.sync());
    this.field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.saveClicked();
      }
    });
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.close();
    };
    this.onDown = (/** @type {PointerEvent} */ e) => {
      const at = /** @type {any} */ (e.target);
      if (!this.el.contains(at) && !this.on.anchor().contains(at)) this.close();
    };
  }

  isOpen() {
    return !this.el.hidden && !this.el.classList.contains('is-leaving');
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  open() {
    if (this.isOpen() || !this.goal) return;
    this.field.value = this.goal.text;
    this.confirming = false;
    this.error.hidden = true;
    this.sync();
    show(this.el);
    document.addEventListener('keydown', this.onKey, true);
    document.addEventListener('pointerdown', this.onDown, true);
    this.field.focus();
    this.field.setSelectionRange(this.field.value.length, this.field.value.length);
  }

  close() {
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('pointerdown', this.onDown, true);
    if (this.isOpen()) hide(this.el);
  }

  /** 会话状态推来的目标变了（没有了的关上）；框里的字人在改，不冲掉。 @param {{text: string, state: string, tail: string}|null} goal */
  update(goal) {
    this.goal = goal;
    if (!goal) {
      this.close();
      return;
    }
    if (this.isOpen()) this.sync();
  }

  /** 头上的状态、按钮的字和能不能点照现在的样子。 */
  sync() {
    const goal = this.goal;
    if (!goal) return;
    this.state.textContent = goal.tail;
    this.pause.textContent = this.t(goal.state === 'paused' ? 'panel.resume' : 'panel.pause');
    this.clear.textContent = this.t(this.confirming ? 'panel.confirm_clear' : 'panel.clear');
    const text = this.field.value.trim();
    this.save.disabled = !text || text === goal.text;
  }

  saveClicked() {
    if (this.save.disabled) return;
    this.act(`edit ${this.field.value.trim()}`, true);
  }

  clearClicked() {
    if (!this.confirming) {
      this.confirming = true;
      this.sync();
      return;
    }
    this.act('clear', true);
  }

  /** 交核心 `/goal <args>`：拒了写在浮层里，成了 `close` 的关上。 @param {string} args @param {boolean} close */
  async act(args, close) {
    for (const b of [this.save, this.pause, this.clear]) b.disabled = true;
    this.error.hidden = true;
    const why = await this.on.run(args);
    this.confirming = false;
    for (const b of [this.pause, this.clear]) b.disabled = false;
    this.sync();
    if (why) {
      this.error.textContent = why;
      this.error.hidden = false;
      return;
    }
    if (close) this.close();
  }

  /** 停用了：关上、拿掉节点。 */
  destroy() {
    this.close();
    this.el.remove();
  }
}
