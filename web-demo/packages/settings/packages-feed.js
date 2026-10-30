// @ts-check
//! 软件包列表的推送（蓝图 `web.md`「设置页」第 13 条；核心 F-8 三补，`subscribe {"stream": "packages"}`）：设置弹窗开着时订、关了退订；
//! 回应就是整份列表，之后 `package.changed` 整项换（MCP 服务起了、停了也推，核心 X-4），掉了队（`resync`）重订。配置里自己写的
//! MCP 服务（核心 F-9 补）订上以后读一次 `mcp.list`，之后跟 `mcp.changed`。换了在「软件包」「MCP」页的重画（正在改一项的不打断）。

import { applyPackageChange, applyServerChange } from './model.js';

/** 装卸包推来的 `package.changed` 一阵一阵的：停这么久再重读技能、脚本 */
const TOOLS_SETTLE_MS = 300;

export class PackageFeed {
  /** @param {any} dialog 设置页的弹窗（`dialog.js`） */
  constructor(dialog) {
    this.dialog = dialog;
    this.live = false;
    /** 装卸包以后重读技能、脚本的那一下（`rereadTools`） @type {any} */
    this.toolsTimer = 0;
  }

  /** 订阅：回应是整份列表，换上。 */
  async start() {
    // 订着的（改了配置整个重读）：服务的开关、加载方式变了不另推 `mcp.changed`（核心 X-27），重读一次
    if (this.live) {
      await this.readHome();
      return;
    }
    this.live = true;
    try {
      const got = await this.dialog.ctx.core.request('subscribe', { stream: 'packages' });
      if (Array.isArray(got?.packages)) this.dialog.packages = got.packages;
    } catch {
      // 旧核心没有这个流、核心 e1cc0d5e8 以前组里的管理员订不了（`not_permitted`）：照 `package.list` 读的那一份，不跟推送，不报错
      this.live = false;
    }
    // 订上以后再读，读完到订上之间的变化不会漏（推来的照名字换）
    await this.readHome();
  }

  /** 自己写的 MCP 服务：旧核心没有这个方法的是 `null`（不出「MCP」页）。 */
  async readHome() {
    this.dialog.homeMcp = await this.dialog.ctx.core.request('mcp.list', {}).then((r) => (Array.isArray(r?.servers) ? r.servers : null), () => null);
  }

  /** 弹窗关了：退订。 */
  stop() {
    clearTimeout(this.toolsTimer);
    if (!this.live) return;
    this.live = false;
    this.dialog.ctx.core.request('unsubscribe', { stream: 'packages' }).catch(() => {});
  }

  /** 推送：交回认不认得这条。 @param {string} method @param {any} params */
  push(method, params) {
    if (method === 'package.changed' && typeof params?.package === 'string') {
      this.dialog.packages = applyPackageChange(this.dialog.packages ?? [], params.package, params.entry ?? null);
      this.redraw();
      this.rereadTools();
      return true;
    }
    if (method === 'mcp.changed' && typeof params?.name === 'string') {
      this.dialog.homeMcp = applyServerChange(this.dialog.homeMcp ?? [], params.name, params.server ?? null);
      this.redraw();
      return true;
    }
    if (method === 'resync' && params?.stream === 'packages') {
      this.live = false;
      this.start().then(() => this.redraw());
      return true;
    }
    return false;
  }

  /**
   * 装、卸、升级了包：随包来的技能、脚本跟着变，重读那两份（一阵推来的并成一回），开着那两页的重画（2026-10-31 项目主人：装了带技能的包，
   * 要关了设置再开才出来）。旧核心没有这两个方法的照旧是 `null`。
   */
  rereadTools() {
    clearTimeout(this.toolsTimer);
    this.toolsTimer = setTimeout(async () => {
      const d = this.dialog;
      const core = d.ctx.core;
      const [skills, scripts] = await Promise.all([
        core.request('skill.list', {}).then((/** @type {any} */ r) => (Array.isArray(r?.skills) ? r : null), () => d.skills),
        core.request('script.list', {}).then((/** @type {any} */ r) => (Array.isArray(r?.scripts) ? r : null), () => d.scripts),
      ]);
      if (!this.live) return;
      d.skills = skills;
      d.scripts = scripts;
      if (d.isOpen && (d.current === 'skills' || d.current === 'scripts') && !d.editing()) d.drawBody();
    }, TOOLS_SETTLE_MS);
  }

  redraw() {
    const d = this.dialog;
    if (d.isOpen && (d.current === 'packages' || d.current === 'mcp') && !d.editing()) d.drawBody();
  }
}
