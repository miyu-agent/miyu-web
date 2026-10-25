// @ts-check
//! 左边一列列表、右边一块，列表能收起（蓝图 `web.md`「右侧边栏」第 4 条「放大看」，2026-10-26 项目主人：宽度不够时左边列表把差异挤得只剩
//! 一小条）。文件修改、展示文件的放大看共用（都画在预览工作区里，样子在 `styles/artifacts.css` 的 `.artifact-split`）。
//! - 够宽（`WIDE` 以上：列表 260 加右边至少 500）默认展开，在流里推开右边；收起时那一列缩到 0、列表往左滑出去淡掉（同左栏收起）。
//! - 不够宽默认收起；点开从左边滑出来浮在右边上面、不挤它（同左栏临时浮出）；点了一项（`picked`）、点外面、按 `Esc` 滑回去。
//! - 宽窄换了一档（拖宽度、最大化、开合右栏）照新的那一档回到默认，同一档里照人点的。收着的列表不能点、读屏不读、Tab 不进去。

import { h, icon } from './dom.js';

/** 这么宽（CSS 像素）以上默认展开、在流里 */
export const WIDE = 760;

export class Split {
  /**
   * @param {HTMLElement} list 左边那一列
   * @param {HTMLElement} body 右边那一块
   * @param {{show: string, hide: string}} labels 按钮悬停写的「展开列表」「收起列表」
   */
  constructor(list, body, labels) {
    this.labels = labels;
    this.side = h('div.artifact-split-side', list);
    this.el = h('div.artifact-split', this.side, body);
    /** 头一行返回箭头旁边的那个按钮（交来的那一边放进头一行） */
    this.button = h('button.icon-button.artifact-action.artifact-split-toggle', { type: 'button', onclick: () => this.set(!this.open) }, icon('panel-left'));
    /** 够不够宽：`null` 是还没量过（还没放进页面、量出来是 0） @type {boolean|null} */
    this.wide = null;
    this.open = false;
    this.set(false);
    // 浮着的时候点外面、按 `Esc` 收回去（点按钮的由按钮自己管；焦点多半在头一行的按钮上，不在这一块里，`Esc` 照整页听）
    this.onDown = (/** @type {PointerEvent} */ e) => {
      const at = /** @type {Node} */ (e.target);
      if (!this.wide && this.open && !this.side.contains(at) && !this.button.contains(at)) this.set(false);
    };
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape' || e.isComposing || this.wide || !this.open || !this.el.isConnected) return;
      e.preventDefault();
      e.stopPropagation();
      const inside = this.side.contains(document.activeElement);
      this.set(false);
      if (inside) this.button.focus();
    };
    document.addEventListener('pointerdown', this.onDown, true);
    document.addEventListener('keydown', this.onKey, true);
    this.watch = new ResizeObserver(() => this.fit());
    this.watch.observe(this.el);
  }

  /** 量这一块多宽：换了一档回到那一档的默认，不放动画（不是人点的） */
  fit() {
    const width = this.el.clientWidth;
    if (!width) return;
    const wide = width >= WIDE;
    if (wide === this.wide) return;
    this.wide = wide;
    this.el.classList.add('is-instant');
    this.el.classList.toggle('is-wide', wide);
    this.set(wide);
    // 换完的那一帧画出来以后再放开动画
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.remove('is-instant')));
  }

  /** 展开、收起 @param {boolean} open */
  set(open) {
    this.open = open;
    this.el.classList.toggle('is-open', open);
    this.side.inert = !open;
    const label = open ? this.labels.hide : this.labels.show;
    this.button.title = label;
    this.button.setAttribute('aria-label', label);
    this.button.setAttribute('aria-expanded', String(open));
  }

  /** 回到这一档的默认（重新进放大看） */
  reset() {
    if (this.wide !== null) this.set(this.wide);
  }

  /** 列表里点了一项：浮着的收回去，在流里的不动 */
  picked() {
    if (!this.wide && this.open) this.set(false);
  }

  /** 不用了：停掉量尺寸的、点外面的 */
  dispose() {
    this.watch.disconnect();
    document.removeEventListener('pointerdown', this.onDown, true);
    document.removeEventListener('keydown', this.onKey, true);
  }
}
