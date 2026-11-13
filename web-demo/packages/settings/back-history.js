// @ts-check
//! 窄屏（手机）上的返回键（浏览器后退，2026-11-13 主人验 check 7：「手机端，webui 在设置界面无法返回之前的界面」）：设置页开着时在
//! 浏览器历史里垫一层，按返回照「点进去的一层 → 这一页 → 分页列表 → 关掉设置」一步退一层，退完一步还开着的再垫一层；从别处关掉
//! （✕、`Esc`）的把垫的那一层收回去，不把整个页面退出去。地址不变（`#` 后面照旧），不惊动宿主的路由。

export class BackHistory {
  /** @param {() => boolean} step 退一步；交回退完以后设置页还开着没有 */
  constructor(step) {
    this.step = step;
    /** 垫着的那一层还在历史里 */
    this.armed = false;
    this.onPop = () => {
      if (!this.armed) return;
      this.armed = false;
      if (this.step()) this.arm();
    };
  }

  /** 开设置时：听返回、垫一层。 */
  start() {
    window.addEventListener('popstate', this.onPop);
    this.arm();
  }

  arm() {
    history.pushState({ miyuSettings: true }, '');
    this.armed = true;
  }

  /** 关设置时：不再听；垫的那一层还在的收回去（别处关的）。 */
  stop() {
    window.removeEventListener('popstate', this.onPop);
    if (!this.armed) return;
    this.armed = false;
    history.back();
  }
}
