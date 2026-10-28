// @ts-check
//! 连核心：宿主给的一条线上的 JSON-RPC 2.0，一帧一条消息（`04-核心协议.md` 第二节、P2）。线是什么由宿主定（蓝图
//! `web/architecture.md`「宿主」）：浏览器是经桥的 WebSocket，桌面端是外壳的进程间通道；样子都照 WebSocket，这一层两边同一份。
//! 连上过又断了的（核心重启，桥把线关了），照 `retry` 隔一会儿自己再连，连上了告诉 `onReopen` 的（重新握手、补上漏掉的由外面做，
//! 蓝图 `web.md`「连核心」第 1 条）；一开始就连不上的不在这里重连（页面起不来，写一句）。重连没连上时问一句口令还对不对
//! （`check`），用不了了（桥重启过换了口令）不再白试，告诉 `onLost` 的（第 9 条）。

/** 核心拒绝的一个请求：`reason` 是稳定的原因码（蓝图 `protocol.md`「出错」），`message` 是核心按头的语言写的话。 */
export class Refusal extends Error {
  /** @param {string} message @param {number} code @param {string|null} reason @param {any} [data] 拒绝里别的几格（`data`，比如分块上传的 `received`） */
  constructor(message, code, reason, data = null) {
    super(message);
    this.code = code;
    this.reason = reason;
    this.data = data;
  }
}

/** 线通着（照 WebSocket 的 `OPEN`）。 */
const OPEN = 1;
/** 核心一行最长 1 MiB（`protocol.md`「一行一条」，照 UTF-8 算，不算最后的换行）：超了核心断掉整条连接，所以发之前自己量。 */
export const LINE_MAX = 1_048_576;

/** 会开新一轮、核心可能回 `prefix_changing` 的几个方法（核心 OV-1 下） */
const PREFIX_METHODS = new Set(['session.send', 'session.redo', 'command.run']);

export class Connection {
  /**
   * @param {() => import('../host/browser.js').Channel} open 开一条线（宿主给的）
   * @param {number[]} [retry] 断了以后第几次重连前等多久（毫秒），试完了照最后一个一直试；空的是不重连
   * @param {() => Promise<string>} [check] 问口令还对不对（宿主给的，桥的 `/key`）：`bad` 是用不了了
   */
  constructor(open, retry = [], check = async () => 'ok') {
    this.open = open;
    this.retry = retry;
    this.check = check;
    /** 这一个请求带不带 `scope`（管理员模式，内核交进来）；`null` 是不带 @type {((method: string, params: any) => string|null)|null} */
    this.scopeFor = null;
    /** 核心回了 `admin_mode_required`（内核交进来） @type {(() => void)|null} */
    this.onAdminRequired = null;
    /**
     * 文件改了、前缀要变（核心 OV-1 下 `prefix_changing`）：问人怎么办，交回 `keep`、`compact`，取消的 `null`（内核交进来，蓝图「连核心」第 6a 条）
     * @type {((data: any) => Promise<'keep'|'compact'|null>)|null}
     */
    this.onPrefixAsk = null;
    /** 口令用不了了：不再重连 */
    this.gaveUp = false;
    /** @type {Set<() => void>} */
    this.losts = new Set();
    /** 断了以后试了几次；连上过没有（连上过又断的才重连）；排着的下一次 */
    this.tries = 0;
    this.everOpen = false;
    this.retryTimer = /** @type {any} */ (null);
    /** @type {Set<() => void>} */
    this.reopens = new Set();
    /** 重连以后重新握手、补完了（软件包的订阅照它重订） @type {Set<() => void>} */
    this.rejoins = new Set();
    this.n = 0;
    // 命令编号要自己保证不撞：每条连接取一段随机数当前缀（蓝图 `protocol.md`，照 `miyu ask`）
    this.prefix = Math.random().toString(16).slice(2, 10);
    /** @type {Map<string, {resolve: (v: any) => void, reject: (e: Error) => void}>} */
    this.waiting = new Map();
    /** @type {Set<(method: string, params: any) => void>} */
    this.pushes = new Set();
    /** @type {Set<(status: 'connecting'|'online'|'offline') => void>} */
    this.statuses = new Set();
    /** @type {import('../host/browser.js').Channel|null} */
    this.ws = null;
  }

  /**
   * 连上。
   *
   * # Errors
   * 线开不了（口令过期、桥没在跑）、那一头连不上核心（它推一条 `bridge.error`），照原因抛出来。
   */
  connect() {
    this.status('connecting');
    return new Promise((resolve, reject) => {
      const ws = this.open();
      this.ws = ws;
      let open = false;
      ws.onopen = () => {
        open = true;
        const again = this.everOpen;
        this.everOpen = true;
        this.tries = 0;
        this.status('online');
        resolve(undefined);
        if (again) for (const fn of this.reopens) fn();
      };
      ws.onerror = () => { if (!open) reject(new Error('bridge')); };
      ws.onclose = () => {
        if (!open) reject(new Error('bridge'));
        for (const w of this.waiting.values()) w.reject(new Refusal('核心断开了', -32000, 'disconnected'));
        this.waiting.clear();
        this.status('offline');
        this.later();
      };
      ws.onmessage = (ev) => this.receive(ev.data, reject);
    });
  }

  /** 收到一帧：回应交给等着它的请求；推送交给订了的；桥说连不上核心的，连接失败。 */
  receive(data, fail) {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m.method === 'bridge.error') {
      fail(new Error(m.params?.message ?? 'bridge'));
      return;
    }
    const waiter = m.id != null ? this.waiting.get(m.id) : undefined;
    if (waiter) {
      this.waiting.delete(m.id);
      if (m.error) {
        const reason = m.error.data?.reason ?? null;
        // 要先进管理员模式（蓝图「管理员模式」第 4 条）：告诉内核，设置页那边提示一句、能一键进入
        if (reason === 'admin_mode_required') this.onAdminRequired?.();
        waiter.reject(new Refusal(m.error.message, m.error.code, reason, m.error.data ?? null));
      }
      else waiter.resolve(m.result);
      return;
    }
    if (m.method) for (const fn of this.pushes) fn(m.method, m.params);
  }

  /**
   * 发一个请求，等它的回应。
   *
   * # Errors
   * 核心拒绝的抛 `Refusal`；连接断了抛原因码是 `disconnected` 的 `Refusal`。
   * `opts.scope` 指定这一个请求带的 `scope`（管理员的引导里装内置语义模型这种本来就是整台机器的事）；不写的照 `scopeFor`。
   * @param {string} method @param {any} [params] @param {{scope?: string}} [opts]
   */
  request(method, params = {}, opts = {}) {
    const first = this.raw(method, params, opts);
    if (!PREFIX_METHODS.has(method) || params?.prefix) return first;
    // 前缀要变（核心 OV-1 下）：问一声，带上选的重发同一个请求；取消的当没发（`prefix_cancelled`，发的那一处不另说、话留在框里）
    return first.catch(async (err) => {
      if (!(err instanceof Refusal) || err.reason !== 'prefix_changing' || !this.onPrefixAsk) throw err;
      const choice = await this.onPrefixAsk(err.data ?? {});
      if (choice !== 'keep' && choice !== 'compact') throw new Refusal('', err.code, 'prefix_cancelled', null);
      return this.raw(method, { ...params, prefix: choice }, opts);
    });
  }

  /** 发一条请求、等回应（不问前缀）。 @param {string} method @param {any} [params] @param {{scope?: string}} [opts] */
  raw(method, params = {}, opts = {}) {
    const id = `web-${this.prefix}-${++this.n}`;
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== OPEN) {
        reject(new Refusal('核心断开了', -32000, 'disconnected'));
        return;
      }
      // 管理员模式开着、改的是系统那一层的：外壳里带 `scope`（和 `method` 同级，蓝图「管理员模式」第 1 条）
      const scope = opts.scope ?? this.scopeFor?.(method, params) ?? null;
      const line = JSON.stringify(scope ? { jsonrpc: '2.0', id, method, params, scope } : { jsonrpc: '2.0', id, method, params });
      if (tooLong(line)) {
        reject(new Refusal('请求太大，超过 1 MiB', -32602, 'too_large'));
        return;
      }
      this.waiting.set(id, { resolve, reject });
      this.ws.send(line);
    });
  }

  /** 断了：连上过的，照 `retry` 隔一会儿再连（已经排着的不再排）。 */
  later() {
    if (!this.everOpen || !this.retry.length || this.retryTimer || this.gaveUp) return;
    const ms = this.retry[Math.min(this.tries, this.retry.length - 1)];
    this.tries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      // 没连上：问一句口令还对不对，用不了了（桥重启过）不再白试，告诉外面
      this.connect().catch(async () => {
        if ((await this.check().catch(() => 'down')) !== 'bad') return;
        this.gaveUp = true;
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
        for (const fn of this.losts) fn();
      });
    }, ms);
  }

  /** 关掉这条线、不再重连（握手被拒了，核心回完就断开：登录这一段换一条新的线再来）。 */
  close() {
    this.gaveUp = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    try { this.ws?.close(); } catch { /* 已经断了 */ }
  }

  /** 口令用不了了（桥重启过），不再重连。 */
  onLost(fn) { this.losts.add(fn); }

  /** 断了又连上了（重新握手、重新订阅、补上漏掉的由它做）。 */
  onReopen(fn) { this.reopens.add(fn); }

  /** 重连以后重新握手、读进来的会话重新订阅完了（内核叫 `rejoined`）：软件包自己的订阅（界面块这类）照它重订。交回不再听的函数。 */
  onRejoin(fn) {
    this.rejoins.add(fn);
    return () => this.rejoins.delete(fn);
  }

  /** 内核重新握手、补完了：叫 `onRejoin` 的。 */
  rejoined() {
    for (const fn of [...this.rejoins]) fn();
  }

  /** 收推送。 */
  onPush(fn) { this.pushes.add(fn); }

  /** 连接的状态变了：连接中、在线、离线（左栏的状态照它）。 */
  onStatus(fn) { this.statuses.add(fn); }

  status(s) { for (const fn of this.statuses) fn(s); }
}

/**
 * 这一行照 UTF-8 超没超 `LINE_MAX`：一个 UTF-16 码元至多三个字节，短的不用编码就知道没超。
 * @param {string} line
 */
export function tooLong(line) {
  if (line.length * 3 <= LINE_MAX) return false;
  return new TextEncoder().encode(line).length > LINE_MAX;
}
