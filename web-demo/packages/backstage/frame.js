// @ts-check
//! 框和网页之间（软件包 `backstage`，蓝图 `web.md`「软件的页面」；核心 `package-pages.md`「框和网页之间怎么说」）：框第一次载入完，网页造一个
//! `MessageChannel`，把一头交给框（只交这一次，后台页做成单页）；以后照 JSON-RPC 的写法说话，网页认的一律照它给框的那个包，框说自己是谁
//! 不算数。方法只有 `context`、`settings.get`、`settings.set`（键要是它自己的，密钥类型给一段字的先存成密钥再写引用）、`call`（转
//! `package.call`）；推送 `settings.changed`（核心推来 `config.changed`、有它的项）、`theme.changed`（网页换了主题、系统换了深浅）。
//! 2026-10-15 从设置页搬出来（原来借设置弹窗读着的配置，现在自己问核心）。

/** 带给框的几个颜色：网页的样式变量 → 交出去的名字 */
const COLORS = /** @type {const} */ ([['--accent', 'accent'], ['--surface', 'surface'], ['--surface-2', 'surface_2'], ['--text', 'text'], ['--text-soft', 'text_soft'], ['--line', 'line'], ['--danger', 'danger']]);

/** 新密钥的名字（同设置页的 `secretName`：照键起、带上时刻，最多 64 个字） @param {string} key */
const secretName = (key) => `${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`.slice(0, 64);

/** 框和网页之间的那条通道。 */
export class FrameHost {
  /**
   * @param {any} core 连核心的（`request`、`onPush`、`pushes`）
   * @param {(path: string) => string} text 这个包的字
   * @param {string} id 框是哪个包的
   * @param {HTMLIFrameElement} frame
   */
  constructor(core, text, id, frame) {
    this.core = core;
    this.text = text;
    this.id = id;
    this.frame = frame;
    /** @type {MessagePort|null} */
    this.port = null;
    this.handed = false;
    // 只在第一次载入完交通道：框后来再载入（跳到别的地址）不再交，网页分不出载入的是谁
    frame.addEventListener('load', () => {
      if (this.handed || !frame.src) return;
      this.handed = true;
      const channel = new MessageChannel();
      this.port = channel.port1;
      this.port.onmessage = (e) => { this.handle(e.data); };
      frame.contentWindow?.postMessage({ miyu: 'port' }, '*', [channel.port2]);
    });
    // 网页换了主题、系统换了深浅：推 `theme.changed`
    this.watch = new MutationObserver(() => this.themeMaybeChanged());
    this.watch.observe(document.documentElement, { attributes: true });
    this.watch.observe(document.body, { attributes: true });
    this.media = matchMedia('(prefers-color-scheme: dark)');
    this.onMedia = () => this.themeMaybeChanged();
    this.media.addEventListener('change', this.onMedia);
    this.lookSig = JSON.stringify(this.look());
    // 别处改了配置（设置页、命令行、别的终端）：有它的项的推 `settings.changed`
    this.onPush = (/** @type {string} */ method, /** @type {any} */ params) => {
      if (method !== 'config.changed') return;
      const mine = Object.keys(params?.keys ?? {}).filter((k) => k.startsWith(`${this.id}.`));
      if (mine.length) this.push('settings.changed', { keys: mine });
    };
    core.onPush?.(this.onPush);
  }

  /** 收掉：通道关了、不再看主题和配置。 */
  close() {
    this.port?.close();
    this.port = null;
    this.watch.disconnect();
    this.media.removeEventListener('change', this.onMedia);
    this.core.pushes?.delete(this.onPush);
  }

  /** 网页这时的深浅和几个颜色（照算出来的颜色，`rgb(…)`）。 */
  look() {
    const style = getComputedStyle(document.body);
    const probe = document.createElement('i');
    document.body.append(probe);
    const colors = Object.fromEntries(COLORS.map(([v, name]) => {
      probe.style.color = style.getPropertyValue(v).trim() || 'inherit';
      return [name, getComputedStyle(probe).color];
    }));
    probe.remove();
    const rgb = (colors.surface.match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map(Number);
    const light = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.5;
    return { theme: light ? 'light' : 'dark', colors };
  }

  themeMaybeChanged() {
    const look = this.look();
    const sig = JSON.stringify(look);
    if (sig === this.lookSig) return;
    this.lookSig = sig;
    this.push('theme.changed', look);
  }

  /** @param {string} method @param {any} params */
  push(method, params) {
    this.port?.postMessage({ jsonrpc: '2.0', method, params });
  }

  /** @param {any} id @param {any} result @param {any} [error] */
  reply(id, result, error) {
    if (id === undefined || id === null || !this.port) return;
    this.port.postMessage(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result });
  }

  /** 框发来的一条。 @param {any} msg */
  async handle(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      this.reply(msg?.id ?? null, null, { code: -32600, message: 'Invalid Request' });
      return;
    }
    const p = msg.params ?? {};
    try {
      if (msg.method === 'context') this.reply(msg.id, { package: this.id, language: document.documentElement.lang, ...this.look() });
      else if (msg.method === 'settings.get') this.reply(msg.id, await this.settings());
      else if (msg.method === 'settings.set') this.reply(msg.id, await this.write(p.changes));
      else if (msg.method === 'call') this.reply(msg.id, await this.core.request('package.call', { package: this.id, method: p.method, ...(p.params === undefined ? {} : { params: p.params }) }));
      else this.reply(msg.id, null, { code: -32601, message: 'Method not found' });
    } catch (err) {
      const e = /** @type {any} */ (err);
      this.reply(msg.id, null, { code: e?.code ?? -32000, message: e?.message ?? String(err), ...(e?.data ? { data: e.data } : e?.reason ? { data: { reason: e.reason } } : {}) });
    }
  }

  /** 配置清单里 `package` 是它的那几项。 */
  async items() {
    const schema = await this.core.request('config.schema', {});
    return (schema?.items ?? []).filter((/** @type {any} */ i) => i.package === this.id);
  }

  /** 它自己的设置项和最终值（密钥照 `config.get` 的写法，是引用不是值）。 */
  async settings() {
    const items = await this.items();
    const got = items.length ? await this.core.request('config.get', { keys: items.map((/** @type {any} */ i) => i.key) }) : { items: {} };
    const values = Object.fromEntries(items.map((/** @type {any} */ i) => [i.key, got?.items?.[i.key]?.value ?? i.default ?? null]));
    return { items, values };
  }

  /**
   * 写它自己的设置项（照 `config.set` 写进系统配置）：每一项的键都要是 `<它的编号>.` 开头，不是的整个不办（`forbidden`）；密钥类型给的是
   * 一段字的，先 `secret.set` 存成一个新名字的密钥，再写引用（同设置页的密钥框；核心 d77e4263）。
   * @param {any} changes
   */
  async write(changes) {
    if (!Array.isArray(changes) || !changes.length || changes.some((c) => typeof c?.key !== 'string')) throw Object.assign(new Error('Invalid params'), { code: -32602 });
    if (changes.some((c) => !c.key.startsWith(`${this.id}.`))) throw Object.assign(new Error(this.text('forbidden')), { code: -32010, data: { reason: 'forbidden' } });
    const types = new Map((await this.items()).map((/** @type {any} */ i) => [i.key, i.type]));
    const out = [];
    for (const c of changes) {
      if (types.get(c.key) === 'secret' && typeof c.value === 'string') {
        const name = secretName(c.key);
        await this.core.request('secret.set', { name, value: c.value });
        out.push({ key: c.key, value: { secret: name } });
      } else out.push(c);
    }
    return this.core.request('config.set', { layer: 'system', changes: out });
  }
}
