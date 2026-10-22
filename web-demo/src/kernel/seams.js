// @ts-check
//! 职能（蓝图 `web/architecture.md`「职能」，照 `12-进程形态与分发.md` R8、deepseek-harness 的 capability seam）：一件事有好几个
//! 做法、同时只用一个。提供者登记进来，照配置选一个：配置写了的赢；没写的（写了的那个没了也算没写：停用、卸了）只有一个能用的
//! 用它；不止一个又没写的报错，不偷偷用第一个。选出来的变了通知：内核照它把选中的当服务发出去（`boot.js`），用它的包跟着重来。

/**
 * @typedef {{id: string, available?: () => boolean}} Provider 一个做法：`available` 交回现在能不能用（不写的当能用）
 * @typedef {{provider: Provider}|{error: 'none'}|{error: 'ambiguous', choices: string[]}|{error: 'missing', wanted: string}} Choice
 */

export class Seams {
  constructor() {
    /** @type {Map<string, Array<{provider: Provider, owner: string}>>} */
    this.table = new Map();
    /** @type {Record<string, string>} 配置里写的：职能 → 用哪个 */
    this.preferred = {};
    /** @type {Set<(name: string, choice: Choice) => void>} */
    this.watchers = new Set();
    /** 上一次选出来的：变了才通知 */
    this.last = new Map();
  }

  /** 登记一个提供者；交回怎么拿掉。 */
  provide(name, provider, owner) {
    const list = this.table.get(name) ?? [];
    this.table.set(name, list);
    const row = { provider, owner };
    list.push(row);
    this.recheck(name);
    return () => {
      const i = list.indexOf(row);
      if (i < 0) return;
      list.splice(i, 1);
      this.recheck(name);
    };
  }

  /** 换配置：职能 → 用哪个。 */
  prefer(preferred) {
    this.preferred = { ...preferred };
    for (const name of new Set([...this.table.keys(), ...Object.keys(preferred)])) this.recheck(name);
  }

  /** 选一个。 */
  choose(name) {
    const usable = (this.table.get(name) ?? []).map((r) => r.provider).filter((p) => !p.available || p.available());
    const wanted = this.preferred[name];
    const hit = wanted ? usable.find((p) => p.id === wanted) : null;
    if (hit) return { provider: hit };
    // 写了的那个没了（停了出厂的、开了样板的）：照没写的选，剩一个能用的就用它（蓝图「职能」的选法，2026-10-22）
    if (usable.length === 1) return { provider: usable[0] };
    if (usable.length === 0) return wanted ? { error: 'missing', wanted } : { error: 'none' };
    return { error: 'ambiguous', choices: usable.map((p) => p.id) };
  }

  /** 能用的提供者，带是哪个包登记的（设置页列下拉用）。 */
  providers(name) {
    return (this.table.get(name) ?? []).filter((r) => !r.provider.available || r.provider.available()).map((r) => ({ provider: r.provider, owner: r.owner }));
  }

  /** 看选出来的变化；交回怎么不看。 */
  watch(fn) {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }

  /** 按包绑一份：登记的提供者、看着的跟着那个包撤回。 */
  bind(ctx) {
    return {
      provide: (name, provider) => ctx.effect(() => this.provide(name, provider, ctx.id)),
      choose: (name) => this.choose(name),
      providers: (name) => this.providers(name),
      watch: (fn) => ctx.effect(() => this.watch(fn)),
    };
  }

  recheck(name) {
    const choice = this.choose(name);
    const sig = 'provider' in choice ? `=${choice.provider.id}` : JSON.stringify(choice);
    const was = this.last.get(name);
    const same = was?.sig === sig && (!('provider' in choice) || was.provider === choice.provider);
    if (same) return;
    this.last.set(name, { sig, provider: 'provider' in choice ? choice.provider : null });
    // 一开始什么都没有、现在还是什么都没有：不算变
    if (!was && !('provider' in choice) && choice.error === 'none') return;
    for (const fn of [...this.watchers]) fn(name, choice);
  }
}
