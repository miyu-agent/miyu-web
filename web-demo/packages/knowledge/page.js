// @ts-check
//! 设置页的「知识库」一页（蓝图 `web.md`「知识库页」；挂进设置页的 `settings.section`）：顶上搜索、新建；空着时一个库一张卡片，
//! 有字时搜到的段一段一块；点卡片进这个库（文档清单、加删文档、重建索引、删库），点一篇、一段看原文。一页是一个常驻的对象：
//! 设置页重画、关了再开交回的是同一块。核心没有知识库的流：打开时、自己改了以后重读。

import { h, icon, replace } from '../../src/lib/dom.js';
import { upload, serial } from '../../src/lib/upload.js';
import { sourceOf, writable, deletable, reasonKey, idFor, nextId, sizeText, docIcon, hitHead, probeOf, treeOf, countOf, pathsOf, removalOf } from './model.js';

/** 搜索框停多久再问、删除要几秒内再点一下、搜几段 */
const TYPE_MS = 250;
const ARM_MS = 3000;
const HITS = 20;
/** 分块传：一块多少字节（核心收的上限 512 KiB）、连着几次没往前走就不传了（同附件） */
const CHUNK = 524288;
const TRIES = 3;

/**
 * 这一层在看什么：卡片（搜着的是搜到的段）、一个库、一篇原文（`from` 是回哪）。
 * @typedef {{kind: 'list'} | {kind: 'base', id: string} | {kind: 'read', kb: string, path: string, page: number, probe: string|null, from: View}} View
 */

export class KnowledgePage {
  /** @param {any} ctx `knowledge` 包的 ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.el = h('div.kb-page');
    /** @type {any} */
    this.kit = null;
    /** @type {import('./model.js').Base[]} */
    this.bases = [];
    /** 软件包的名字（随包来的库写「随 X 来的」） @type {Map<string, string>} */
    this.packages = new Map();
    /** @type {View} */
    this.view = { kind: 'list' };
    this.query = '';
    /** @type {import('./model.js').Hit[]} */
    this.hits = [];
    this.creating = false;
    /** @type {'empty'|'mount'} */
    this.mode = 'empty';
    /** 刚建好的那张卡片淡淡亮一下 @type {string|null} */
    this.fresh = null;
    /** 开着的那个库的文档清单（`kb.documents`）；挂的目录不在了的是 `{gone: true}` @type {{documents: import('./model.js').Doc[], folders: import('./model.js').Doc[], gone?: boolean}|null} */
    this.docs = null;
    /** 传着的文件名 @type {string[]} */
    this.uploading = [];
    /** 点了一下、等着再点的（删一篇写路径，删库写 `base`） @type {string|null} */
    this.armed = null;
    /** @type {any} */
    this.armTimer = 0;
    this.reindexing = false;
    /** 建索引的进度（核心推来的 `kb.indexing {kb, done, total}`；自己点了、还没推来的是 `{kb}`） @type {{kb: string, done?: number, total?: number}|null} */
    this.progress = null;
    /** 语义模型（配置项 `models.embedding`；索引信息里写） @type {string|null} */
    this.embedding = null;
    /** 多选：开着没有、勾了哪几篇（照路径）、上一次点的（`Shift` 连选） */
    this.selecting = false;
    /** @type {Set<string>} */
    this.selected = new Set();
    /** @type {string|null} */
    this.lastPick = null;
    /** 文件树里收起来的文件夹（照路径） @type {Set<string>} */
    this.closed = new Set();
    /** 旧核心没有 `kb.*`：整页一张卡 */
    this.old = false;
    this.loaded = false;
    /** @type {any} */
    this.typeTimer = 0;
    this.queue = serial();
    // `Esc` 在一个库里、看原文时回上一层：设置框在捕获阶段拿到 `Esc`，找带 `data-set-dismiss` 的发 `set-dismiss`（`dialog.js` 的 `onKey`）
    this.el.addEventListener('set-dismiss', () => this.back());
    // 建索引的进度（核心 2026-10-20 排着的 `kb.indexing`、`kb.indexed`；没推的照点了以后来回走）
    ctx.core.onPush?.((/** @type {string} */ method, /** @type {any} */ p) => {
      if (method === 'kb.indexing' && typeof p?.kb === 'string') {
        this.progress = { kb: p.kb, done: p.done, total: p.total };
        if (this.view.kind === 'base' && this.view.id === p.kb) this.draw();
      } else if (method === 'kb.indexed' && typeof p?.kb === 'string' && this.progress?.kb === p.kb && !this.reindexing) {
        this.progress = null;
        if (this.loaded) this.reload();
      }
    });
  }

  /** 设置页画这一页：每次打开重读库的列表，交回同一块。 @param {any} kit */
  render(kit) {
    this.kit = kit;
    this.loaded = true;
    this.reload();
    return this.el;
  }

  // —— 读 ——

  /** 重读库的列表（和软件包的名字），在库里的连文档清单，搜着的连搜到的。 */
  async reload() {
    try {
      const [got, pkgs, cfg] = await Promise.all([
        this.ctx.core.request('kb.list', {}),
        this.packages.size ? null : this.ctx.core.request('package.list', {}).catch(() => null),
        this.ctx.core.request('config.get', { keys: ['models.embedding'] }).catch(() => null),
      ]);
      const emb = cfg?.items?.['models.embedding']?.value;
      this.embedding = typeof emb === 'string' && emb && emb !== 'off' ? emb : null;
      this.bases = Array.isArray(got?.bases) ? got.bases : [];
      for (const p of pkgs?.packages ?? []) this.packages.set(p.package, p.name ?? p.package);
      this.old = false;
    } catch (err) {
      if (/** @type {any} */ (err)?.code === -32601 || /** @type {any} */ (err)?.reason === 'unknown_method') this.old = true;
      else this.say(this.refusal(err));
      this.bases = [];
    }
    if (this.view.kind === 'base') await this.loadDocs(this.view.id);
    else if (this.view.kind === 'list' && this.query.trim()) await this.search();
    this.draw();
  }

  /** @param {string} id */
  async loadDocs(id) {
    try {
      const got = await this.ctx.core.request('kb.documents', { kb: id });
      if (this.view.kind !== 'base' || this.view.id !== id) return;
      this.docs = { documents: got?.documents ?? [], folders: got?.folders ?? [] };
    } catch (err) {
      const why = /** @type {any} */ (err)?.data?.reason;
      if (why === 'folder_unavailable') this.docs = { documents: [], folders: [], gone: true };
      else if (why === 'unknown_kb') {
        this.say(this.t('errors.unknown_kb'));
        this.view = { kind: 'list' };
      } else {
        this.docs = { documents: [], folders: [] };
        this.say(this.refusal(err));
      }
    }
  }

  async search() {
    const q = this.query.trim();
    if (!q) {
      this.hits = [];
      return;
    }
    try {
      const got = await this.ctx.core.request('kb.search', { query: q, limit: HITS });
      if (q !== this.query.trim()) return;
      this.hits = Array.isArray(got?.hits) ? got.hits : [];
    } catch (err) {
      this.hits = [];
      this.say(this.refusal(err));
    }
  }

  // —— 画 ——

  draw() {
    if (!this.kit) return;
    if (this.old) {
      replace(this.el, h('div.kb-problem', h('p', this.t('errors.old_core'))));
      return;
    }
    // 新建的框里写着字的不冲掉
    if (this.view.kind === 'list' && this.creating && this.el.querySelector('.kb-create [data-dirty]')) {
      const list = this.el.querySelector('.kb-body');
      if (list) replace(/** @type {HTMLElement} */ (list), this.listBody());
      return;
    }
    const v = this.view;
    replace(this.el, v.kind === 'base' ? this.basePage(v.id) : v.kind === 'read' ? this.readPage(v) : this.listPage());
    if (this.view.kind === 'list' && !this.creating) delete this.el.dataset.setDismiss;
    else this.el.dataset.setDismiss = '1';
  }

  listPage() {
    const t = this.t;
    const find = /** @type {HTMLInputElement} */ (h('input.kb-find-input', { type: 'search', value: this.query, placeholder: t('search'), spellcheck: 'false', autocomplete: 'off' }));
    find.addEventListener('input', (e) => {
      if (/** @type {InputEvent} */ (e).isComposing) return;
      this.query = find.value;
      clearTimeout(this.typeTimer);
      this.typeTimer = setTimeout(async () => {
        await this.search();
        const body = this.el.querySelector('.kb-body');
        if (body) replace(/** @type {HTMLElement} */ (body), this.listBody());
      }, TYPE_MS);
    });
    find.addEventListener('compositionend', () => find.dispatchEvent(new Event('input')));
    const add = h('button.set-btn.is-primary', { type: 'button', onclick: () => { this.creating = true; this.draw(); this.el.querySelector('.kb-create input')?.focus(); } }, icon('plus'), t('create'));
    // 新建在设置框正中弹一个小窗（2026-10-20 项目主人：新建以浮动窗口出现更好）：点外面（框里没写字的）、`Esc`、「取消」收起
    const modal = this.creating ? h('div.kb-modal', {
      onclick: (/** @type {Event} */ e) => {
        if (e.target !== e.currentTarget || this.el.querySelector('.kb-create [data-dirty]')) return;
        this.creating = false;
        this.draw();
      },
    }, this.createForm()) : null;
    return h('div.kb-list-page',
      h('div.kb-tools', h('label.kb-find', icon('search'), find), add),
      h('div.kb-body', this.listBody()),
      modal);
  }

  /** 卡片（搜索框空着）或搜到的段 */
  listBody() {
    const t = this.t;
    if (this.query.trim()) {
      if (!this.hits.length) return h('p.kb-empty', t('no_hits'));
      return h('div.kb-hits', this.hits.map((x) => this.hitBlock(x)));
    }
    if (!this.bases.length) return h('p.kb-empty', t('empty'));
    return h('div.kb-cards', this.bases.map((b) => this.card(b, true)));
  }

  /**
   * 一个库的卡片：名字、说明、「N 篇 · 来源」（读不了的换成红字），右边「自动想起」。`open` 的点了进这个库。
   * @param {import('./model.js').Base} b @param {boolean} open
   */
  card(b, open, index = null) {
    const t = this.t;
    const src = sourceOf(b);
    // 自己建的不写「自己建的」（2026-10-20 项目主人）
    const from = src === 'package' ? t('source.package', { name: this.packages.get(/** @type {string} */ (b.package)) ?? b.package })
      : src === 'mount' ? t('source.mount', { path: b.mount }) : null;
    const meta = b.error ? h('p.kb-card-meta.is-bad', b.error) : h('p.kb-card-meta', [t('docs_n', { n: b.documents ?? 0 }), from].filter(Boolean).join(' · '));
    const auto = h('label.kb-auto', { title: t('auto_hint'), onclick: (/** @type {Event} */ e) => e.stopPropagation() },
      h('span', t('auto')), this.kit.toggle(!!b.auto, (/** @type {boolean} */ on) => this.setAuto(b, on)));
    const attrs = open
      ? { role: 'button', tabindex: '0', onclick: () => this.openBase(b.id), onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && e.target === e.currentTarget) this.openBase(b.id); } }
      : {};
    return h(`div.kb-card${open ? '.is-link' : ''}${this.fresh === b.id ? '.is-fresh' : ''}`, attrs,
      h('span.kb-card-icon', icon(src === 'mount' ? 'folder' : src === 'package' ? 'package' : 'library')),
      h('div.kb-card-text', h('div.kb-card-name', b.name || b.id), b.description ? h('p.kb-card-desc', b.description) : null, index ? null : meta),
      auto, index);
  }

  /**
   * 库里那张卡片下半截的索引信息（2026-10-20 项目主人：重建索引要有进度，索引信息也要有卡片）：「N 篇 · N 段 · 语义模型 X · 上次建好 时刻」，右边「重建索引」；
   * 建着的时候下面一道进度条（核心推来 `done`、`total` 的写「正在重建 done / total」，没有的来回走）。
   * @param {import('./model.js').Base} b @param {number} docs @param {number} chunks
   */
  indexBlock(b, docs, chunks) {
    const t = this.t;
    const at = b.indexed_at ? Date.parse(b.indexed_at) : NaN;
    const busy = this.reindexing || b.indexing === true || this.progress?.kb === b.id;
    const p = this.progress?.kb === b.id ? this.progress : null;
    const known = !!p && typeof p.total === 'number' && p.total > 0 && typeof p.done === 'number';
    const stats = [
      t('foot', { docs, chunks }),
      t('index_model', { name: this.embedding ?? t('index_model_none') }),
      Number.isFinite(at) ? t('index_at', { when: new Date(at).toLocaleString() }) : null,
    ].filter(Boolean).join(' · ');
    const reindex = h('button.set-btn.kb-reindex', { type: 'button', disabled: busy, onclick: (/** @type {Event} */ e) => { e.stopPropagation(); this.reindex(b); } },
      icon(busy ? 'loader-circle' : 'rotate-cw'), busy ? (known ? t('reindexing_n', { done: p?.done, total: p?.total }) : t('reindexing')) : t('reindex'));
    const bar = busy ? h(`div.kb-index-bar${known ? '' : '.is-unknown'}`, h('i', known ? { style: { width: `${Math.min(100, ((p?.done ?? 0) / (p?.total ?? 1)) * 100)}%` } } : {})) : null;
    return h('div.kb-index', h('div.kb-index-line', h('span.kb-index-stats', stats), reindex), bar);
  }

  /** 搜到的一段：头一行「库名 / 路径 · 标题」，下面片段（Markdown，图不画，搜的字标出来）。 @param {import('./model.js').Hit} x */
  hitBlock(x) {
    const head = hitHead(x, (id) => this.nameOf(id), (page) => this.t('page', { page }));
    const body = this.markdown(x.text ?? '', 'div.markdown-body.kb-snippet');
    mark(body, this.query.trim());
    return h('div.kb-hit', { role: 'button', tabindex: '0',
      onclick: () => this.openRead(x.kb, x.path, x.page ?? 1, probeOf(x.text)),
      onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') this.openRead(x.kb, x.path, x.page ?? 1, probeOf(x.text)); } },
    h('div.kb-hit-head', head), body);
  }

  createForm() {
    const t = this.t;
    const mount = this.mode === 'mount';
    const name = /** @type {HTMLInputElement} */ (h('input.set-input', { type: 'text', placeholder: t('name_hint'), spellcheck: 'false', autocomplete: 'off' }));
    const desc = /** @type {HTMLInputElement} */ (h('input.set-input', { type: 'text', placeholder: t('desc_hint'), autocomplete: 'off' }));
    const folder = mount ? /** @type {HTMLInputElement} */ (h('input.set-input.kb-folder-input', { type: 'text', placeholder: t('folder_hint'), spellcheck: 'false', autocomplete: 'off' })) : null;
    let auto = true;
    const ok = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'submit', disabled: true }, t(mount ? 'do_mount' : 'do_create')));
    const sync = () => { ok.disabled = !name.value.trim() || (!!folder && !folder.value.trim()); };
    for (const el of [name, desc, folder]) el?.addEventListener('input', () => { el.dataset.dirty = '1'; sync(); });
    const pick = folder ? h('button.set-btn.kb-pick', { type: 'button', title: t('pick_folder'), 'aria-label': t('pick_folder'), onclick: async () => {
      const got = await this.ctx.host?.files?.pickDir?.({ title: t('pick_folder') }).catch(() => null);
      if (typeof got === 'string' && got) {
        folder.value = got;
        folder.dataset.dirty = '1';
        sync();
      }
    } }, icon('folder-open')) : null;
    const tab = (/** @type {'empty'|'mount'} */ m) => h(`button.kb-tab${this.mode === m ? '.is-on' : ''}`, { type: 'button', onclick: () => { if (this.mode !== m) { this.mode = m; this.draw(); } } }, t(`mode_${m}`));
    const form = h('form.kb-create',
      h('div.kb-tabs', tab('empty'), tab('mount')),
      name, desc,
      folder ? h('div.kb-folder', folder, pick) : null,
      h('div.kb-create-foot',
        h('label.kb-auto', { title: t('auto_hint') }, h('span', t('auto')), this.kit.toggle(auto, (/** @type {boolean} */ on) => { auto = on; return true; })),
        h('button.set-btn', { type: 'button', onclick: () => { this.creating = false; this.draw(); } }, t('cancel')), ok));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (ok.disabled) return;
      ok.disabled = true;
      // 挂的文件夹要先建好索引才回（头一次还要装载语义模型），按钮上写着在办
      ok.textContent = t(folder ? 'mounting' : 'creating');
      const fields = { name: name.value.trim(), ...(desc.value.trim() ? { description: desc.value.trim() } : {}), auto };
      const made = await this.make(fields, folder ? folder.value.trim() : null);
      if (!made) {
        ok.disabled = false;
        ok.textContent = t(folder ? 'do_mount' : 'do_create');
        return;
      }
      this.creating = false;
      this.fresh = made;
      this.kit.toast(t(folder ? 'mounted' : 'created'));
      await this.reload();
      setTimeout(() => { this.fresh = null; }, 1600);
    });
    return form;
  }

  /**
   * 建一个库（挂一个文件夹）：编号网页自己定，撞了的换下一个再试。交回建好的编号，没建成的 `null`（已经提示过）。
   * @param {{name: string, description?: string, auto: boolean}} fields @param {string|null} folder
   */
  async make(fields, folder) {
    const taken = new Set(this.bases.map((b) => b.id));
    let id = idFor(fields.name, taken, Date.now());
    for (let tries = 0; tries < 5; tries += 1) {
      try {
        await this.ctx.core.request(folder ? 'kb.mount' : 'kb.create', { kb: id, ...fields, ...(folder ? { folder } : {}) });
        return id;
      } catch (err) {
        if (/** @type {any} */ (err)?.data?.reason !== 'kb_exists') {
          this.say(this.refusal(err));
          return null;
        }
        taken.add(id);
        id = nextId(fields.name, taken, id, Date.now());
      }
    }
    return null;
  }

  /** @param {string} id */
  basePage(id) {
    const t = this.t;
    const b = this.bases.find((x) => x.id === id);
    if (!b) {
      this.view = { kind: 'list' };
      return this.listPage();
    }
    const own = writable(b);
    const docs = this.docs;
    // 文档排成文件树（2026-10-20 项目主人）：文件夹一行（箭头、图标、名字、几篇），点了展开收起；里面的往右缩一层
    const tree = docs ? treeOf([...docs.documents, ...docs.folders.map((d) => ({ ...d, dir: true }))]) : null;
    /** @param {import('./model.js').TreeNode} node @param {number} depth @returns {HTMLElement[]} */
    const rowsOf = (node, depth) => [
      ...node.folders.flatMap((f) => {
        const open = !this.closed.has(f.path);
        const toggle = () => {
          if (open) this.closed.add(f.path);
          else this.closed.delete(f.path);
          this.draw();
        };
        const inside = pathsOf(f);
        const picked = this.selecting && inside.length > 0 && inside.every((p) => this.selected.has(p));
        const some = this.selecting && !picked && inside.some((p) => this.selected.has(p));
        const armed = this.armed === `dir:${f.path}`;
        // 文件夹悬停右边一个删除（点两下），删里面的全部（2026-10-20 项目主人：要能按文件夹删）
        const remove = own && !this.selecting && inside.length
          ? h(`button.set-btn.is-danger.kb-remove${armed ? '.is-armed' : ''}`, { type: 'button', title: t('remove_dir'), onclick: (/** @type {Event} */ e) => { e.stopPropagation(); this.removeMany(b, inside, `dir:${f.path}`, [f.path]); } },
            icon('trash-2'), armed ? t('remove_confirm') : null)
          : null;
        const row = h(`div.kb-doc.is-dir.is-link${open ? '.is-open' : ''}${picked ? '.is-picked' : ''}`, {
          role: 'button', tabindex: '0', 'aria-expanded': String(open), style: `--depth: ${depth}`,
          onclick: (/** @type {MouseEvent} */ e) => (this.selecting && !(/** @type {Element} */ (e.target)).closest('.kb-dir-arrow') ? this.pick(inside, order, false) : toggle()),
          onkeydown: (/** @type {KeyboardEvent} */ e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); toggle(); } },
        }, this.selecting ? h('span.kb-check', icon(picked ? 'square-check' : some ? 'square-minus' : 'square')) : null,
        h('span.kb-doc-icon', h('span.kb-dir-arrow', icon('chevron-right')), icon(open ? 'folder-open' : 'folder')),
        h('div.kb-doc-text', h('span.kb-doc-path', f.name)), h('span.kb-doc-meta', t('dir_count', { n: countOf(f) })), remove);
        return [row, ...(open ? rowsOf(f, depth + 1) : [])];
      }),
      ...node.docs.map((d) => this.docRow(b, d, !!d.dir, depth, order)),
    ];
    /** 清单里文档的先后（`Shift` 连选照它） @type {string[]} */
    const order = tree ? pathsOf(tree) : [];
    const rows = !docs ? [] : [
      ...this.uploading.map((name) => h('div.kb-doc.is-uploading', h('span.kb-doc-icon', icon('loader-circle')), h('div.kb-doc-text', h('span.kb-doc-path', name), h('span.kb-doc-note', t('uploading'))))),
      ...(tree ? rowsOf(tree, 0) : []),
    ];
    const list = !docs ? null
      : docs.gone ? h('p.kb-empty.is-bad', t('folder_gone', { path: b.mount ?? '' }))
      : rows.length ? h(`div.kb-docs${tree?.folders.length ? '.has-dirs' : ''}`, rows) : h('p.kb-empty', t('docs_empty'));
    // 底下的数同卡片上的（核心数的是读得了的）：读不了的不算篇数，以前进过索引留着的旧块照算
    const readable = (docs?.documents ?? []).filter((d) => !d.reason).length;
    const chunks = (docs?.documents ?? []).reduce((n, d) => n + (d.chunks ?? 0), 0);
    const del = deletable(b)
      ? h(`button.set-btn.is-danger${this.armed === 'base' ? '.is-armed' : ''}`, { type: 'button', onclick: () => this.deleteBase(b) },
        icon('trash-2'), this.armed === 'base' ? t('delete_confirm', { name: b.name || b.id }) : t('delete'))
      : null;
    return h('div.kb-base-page',
      h('div.kb-head', h('button.kb-back', { type: 'button', onclick: () => this.back() }, icon('chevron-left'), t('back_list')), h('span.kb-head-id', b.id)),
      this.card(b, false, this.indexBlock(b, docs ? readable : b.documents ?? 0, docs ? chunks : b.chunks ?? 0)),
      own ? this.dropZone(b) : null,
      own && tree && rows.length ? this.selectBar(tree) : null,
      list,
      del ? h('div.kb-foot', h('span'), h('span.kb-foot-actions', del)) : null);
  }

  /**
   * 清单上面那一排（自己建的库；2026-10-20 项目主人：要能批量选择和删除）：平常右边一个「多选」；多选时「已选 N 篇」、全选、删除（点两下）、退出。
   * @param {import('./model.js').TreeNode} tree
   */
  selectBar(tree) {
    const t = this.t;
    const b = this.bases.find((x) => this.view.kind === 'base' && x.id === this.view.id);
    const btn = (/** @type {string} */ name, /** @type {string} */ title, /** @type {() => void} */ run, cls = '') => h(`button.icon-button.kb-sel-btn${cls}`, { type: 'button', title, 'aria-label': title, onclick: run }, icon(name));
    if (!this.selecting) {
      return h('div.kb-sel', btn('list-checks', t('select'), () => { this.selecting = true; this.selected = new Set(); this.lastPick = null; this.draw(); }));
    }
    const n = this.selected.size;
    const armed = this.armed === 'many';
    const del = btn('trash-2', armed ? t('remove_confirm') : t('remove'), () => { if (b) this.removeMany(b, [...this.selected], 'many', removalOf(tree, this.selected)); }, `.is-danger${armed ? '.is-armed' : ''}`);
    if (!n) del.setAttribute('disabled', '');
    return h('div.kb-sel',
      h('span.kb-sel-count', t('selected_n', { n })),
      btn('check-check', t('select_all'), () => { this.selected = new Set(pathsOf(tree)); this.draw(); }),
      del,
      btn('x', t('select_exit'), () => { this.selecting = false; this.selected = new Set(); this.draw(); }));
  }

  /**
   * 多选时点一行：文档勾上、去掉；文件夹照它里面的全部（全勾了的去掉，不然都勾上）；`Shift` 照清单的先后连选（文档）。
   * @param {string[]} paths 这一行管的几篇 @param {string[]} order 清单里文档的先后 @param {boolean} shift
   */
  pick(paths, order, shift) {
    const next = new Set(this.selected);
    if (shift && this.lastPick && paths.length === 1) {
      const a = order.indexOf(this.lastPick);
      const z = order.indexOf(paths[0]);
      if (a >= 0 && z >= 0) for (const p of order.slice(Math.min(a, z), Math.max(a, z) + 1)) next.add(p);
    } else if (paths.every((p) => next.has(p))) paths.forEach((p) => next.delete(p));
    else paths.forEach((p) => next.add(p));
    this.selected = next;
    if (paths.length === 1) this.lastPick = paths[0];
    this.draw();
  }

  /**
   * 文档清单的一行：图标、名字（在文件树里只写这一层的名字，悬停写全路径），右边「大小 · 日期」；读不了的下面一行红字。自己建的库悬停右边一个删除。
   * `folder` 的是读不了的子目录。`depth` 是在文件树的第几层（往右缩）。
   * @param {import('./model.js').Base} b @param {import('./model.js').Doc} d @param {boolean} [folder] @param {number} [depth]
   */
  docRow(b, d, folder = false, depth = 0, order = []) {
    const t = this.t;
    const why = reasonKey(d);
    const at = d.at ? Date.parse(d.at) : NaN;
    const meta = folder ? '' : [sizeText(d.size), Number.isFinite(at) ? new Date(at).toLocaleDateString() : ''].filter(Boolean).join(' · ');
    const armed = this.armed === `doc:${d.path}`;
    const picking = this.selecting && writable(b) && !folder;
    const picked = picking && this.selected.has(d.path);
    const remove = writable(b) && !folder && !this.selecting
      ? h(`button.set-btn.is-danger.kb-remove${armed ? '.is-armed' : ''}`, { type: 'button', title: t('remove'), onclick: (/** @type {Event} */ e) => { e.stopPropagation(); this.removeDoc(b, d.path); } },
        icon('trash-2'), armed ? t('remove_confirm') : null)
      : null;
    const open = (/** @type {any} */ e) => {
      if (picking) return this.pick([d.path], order, !!e?.shiftKey);
      if (!folder) this.openRead(b.id, d.path, 1, null);
    };
    return h(`div.kb-doc${folder ? '.is-folder' : '.is-link'}${why ? '.is-bad' : ''}${picked ? '.is-picked' : ''}`,
      { style: `--depth: ${depth}`, title: d.path, ...(folder ? {} : { role: 'button', tabindex: '0', onclick: open, onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(e); } }) },
      picking ? h('span.kb-check', icon(picked ? 'square-check' : 'square')) : null,
      h('span.kb-doc-icon', icon(folder ? 'folder' : docIcon(d.kind))),
      h('div.kb-doc-text', h('span.kb-doc-path', d.name ?? d.path), why ? h('span.kb-doc-note.is-bad', t(why)) : null),
      meta ? h('span.kb-doc-meta', meta) : null,
      remove);
  }

  /** 自己建的库的「拖文件到这里，或者选择文件」 @param {import('./model.js').Base} b */
  dropZone(b) {
    const t = this.t;
    const files = this.ctx.host?.files;
    // 文件、文件夹都收（2026-10-20 项目主人：要支持文件夹）：文件夹里的照它的相对路径一篇一篇加
    const zone = h('div.kb-drop', icon('file-plus'), h('span', t('drop_text')),
      h('button.kb-drop-pick', { type: 'button', onclick: async () => this.addFiles(b, (await files?.pick?.()) ?? []) }, t('drop_pick')),
      files?.pickFolder ? h('span', t('drop_or')) : null,
      files?.pickFolder ? h('button.kb-drop-pick', { type: 'button', onclick: async () => this.addFiles(b, (await files.pickFolder()) ?? []) }, t('drop_pick_folder')) : null);
    // 只听这一块（`local`）：事件先到它，它收了的整页的附件那边不再收一份（`src/host/files.js` 的 `watchDrop`）；节点换掉了监听跟着没了
    files?.watchDrop?.(zone, {
      enter: () => zone.classList.add('is-over'),
      over: () => {},
      leave: () => zone.classList.remove('is-over'),
      drop: (/** @type {any[]} */ list) => this.addFiles(b, list),
    }, { local: true, folders: true });
    return zone;
  }

  /** @param {Extract<View, {kind: 'read'}>} v */
  readPage(v) {
    const t = this.t;
    const body = h('div.kb-read');
    const pager = h('div.kb-pager');
    this.ctx.core.request('kb.read', { kb: v.kb, path: v.path, page: v.page }).then((/** @type {any} */ got) => {
      if (this.view !== v) return;
      const doc = this.markdown(String(got?.text ?? ''), 'div.markdown-body.kb-doc-body');
      replace(body, doc);
      const pages = Number(got?.pages) || 1;
      const page = Number(got?.page) || v.page;
      if (pages > 1) {
        const go = (/** @type {number} */ n) => { this.view = { ...v, page: n, probe: null }; this.draw(); this.scrollTop(); };
        replace(pager,
          h('button.set-btn', { type: 'button', disabled: page <= 1, onclick: () => go(page - 1) }, icon('chevron-left'), t('prev')),
          h('span.kb-pager-at', t('pages', { page, pages })),
          h('button.set-btn', { type: 'button', disabled: page >= pages, onclick: () => go(page + 1) }, t('next'), icon('chevron-right')));
      }
      if (v.probe) requestAnimationFrame(() => scrollToText(doc, /** @type {string} */ (v.probe)));
    }, (/** @type {any} */ err) => {
      if (this.view !== v) return;
      const why = err?.data?.reason;
      replace(body, h('p.kb-empty.is-bad', why === 'unknown_document' ? t('errors.unknown_document') : why === 'unknown_kb' ? t('errors.unknown_kb') : this.refusal(err)));
    });
    return h('div.kb-read-page',
      h('div.kb-head', h('button.kb-back', { type: 'button', onclick: () => this.back() }, icon('chevron-left'), t(v.from.kind === 'list' ? 'back_list' : 'back')),
        h('span.kb-head-id', `${this.nameOf(v.kb)} / ${v.path}`)),
      h('div.kb-read-card', body, pager));
  }

  // —— 走 ——

  /** @param {string} id */
  openBase(id) {
    this.view = { kind: 'base', id };
    this.docs = null;
    this.armed = null;
    this.selecting = false;
    this.selected = new Set();
    this.draw();
    this.scrollTop();
    this.loadDocs(id).then(() => this.draw());
  }

  /** @param {string} kb @param {string} path @param {number} page @param {string|null} probe */
  openRead(kb, path, page, probe) {
    this.view = { kind: 'read', kb, path, page, probe, from: this.view };
    this.draw();
    this.scrollTop();
  }

  back() {
    // 新建的小窗开着：先收起它
    if (this.creating) {
      this.creating = false;
      this.draw();
      return;
    }
    const v = this.view;
    this.armed = null;
    if (v.kind === 'read') {
      this.view = v.from;
      if (v.from.kind === 'base') this.loadDocs(v.from.id).then(() => this.draw());
    } else this.view = { kind: 'list' };
    this.draw();
  }

  scrollTop() {
    this.el.closest('.set-body')?.scrollTo?.({ top: 0 });
  }

  // —— 改 ——

  /** @param {import('./model.js').Base} b @param {boolean} on */
  async setAuto(b, on) {
    try {
      await this.ctx.core.request('kb.update', { kb: b.id, auto: on });
      b.auto = on;
      return true;
    } catch (err) {
      this.say(this.refusal(err));
      return false;
    }
  }

  /** 加文档：一个一个先存进核心（`blob.put`），再 `kb.add`；同名的提示、不替换。 @param {import('./model.js').Base} b @param {any[]} list */
  async addFiles(b, list) {
    if (!list.length) return;
    const files = this.ctx.host?.files;
    const request = (/** @type {string} */ method, /** @type {any} */ params) => this.ctx.core.request(method, params);
    const pathOf = (/** @type {any} */ f) => f.relative || f.name;
    this.uploading.push(...list.map(pathOf));
    this.draw();
    await Promise.all(list.map((f) => this.queue(async () => {
      try {
        const got = f.path
          ? await request('blob.put', { path: f.path })
          : await upload(request, { name: f.name, size: f.size }, null, (offset, length) => files.read(f, offset, length), { chunk: CHUNK, tries: TRIES });
        await request('kb.add', { kb: b.id, path: pathOf(f), blob: got.blob });
        if (list.length === 1) this.kit.toast(this.t('added', { name: pathOf(f) }));
      } catch (err) {
        this.say(/** @type {any} */ (err)?.data?.reason === 'document_exists' ? this.t('exists', { name: pathOf(f) }) : this.refusal(err));
      }
      const i = this.uploading.indexOf(pathOf(f));
      if (i >= 0) this.uploading.splice(i, 1);
    })));
    if (list.length > 1) this.kit.toast(this.t('added_n', { n: list.length }));
    await this.reload();
  }

  /** 删一篇：点一下变「确认删除」，三秒内再点才删。 @param {import('./model.js').Base} b @param {string} path */
  async removeDoc(b, path) {
    if (!this.arm(`doc:${path}`)) return;
    try {
      await this.ctx.core.request('kb.remove', { kb: b.id, path });
      this.kit.toast(this.t('removed'));
    } catch (err) {
      this.say(this.refusal(err));
    }
    await this.reload();
  }

  /**
   * 删几样（多选、一个文件夹）：点两下（`key` 记着点的是哪个）。核心 b03598e2 起 `kb.remove` 的 `path` 收文件夹、`paths` 收几样（有一样不在的
   * 一样都不删）：`targets` 照它交；旧核心不认 `paths` 的，照 `docs` 一篇篇删。删完提示几篇。
   * @param {import('./model.js').Base} b @param {string[]} docs 要删的每一篇 @param {string} key @param {string[]} [targets] 交给核心的（文件夹、文档）
   */
  async removeMany(b, docs, key, targets = docs) {
    if (!docs.length || !this.arm(key)) return;
    let done = 0;
    try {
      await this.ctx.core.request('kb.remove', targets.length === 1 ? { kb: b.id, path: targets[0] } : { kb: b.id, paths: targets });
      done = docs.length;
    } catch (err) {
      const old = /** @type {any} */ (err)?.data?.reason === 'bad_params' && targets.length > 1;
      if (!old) this.say(this.refusal(err));
      else {
        for (const path of docs) {
          try {
            await this.ctx.core.request('kb.remove', { kb: b.id, path });
            done += 1;
          } catch (e) {
            this.say(this.refusal(e));
            break;
          }
        }
      }
    }
    this.selecting = false;
    this.selected = new Set();
    if (done) this.kit.toast(this.t('removed_n', { n: done }));
    await this.reload();
  }

  /** 删库：同上，删了回到卡片。 @param {import('./model.js').Base} b */
  async deleteBase(b) {
    if (!this.arm('base')) return;
    try {
      await this.ctx.core.request('kb.delete', { kb: b.id });
      this.kit.toast(this.t(sourceOf(b) === 'mount' ? 'deleted_mount' : 'deleted_own'));
      this.view = { kind: 'list' };
    } catch (err) {
      this.say(this.refusal(err));
    }
    await this.reload();
  }

  /** @param {import('./model.js').Base} b */
  async reindex(b) {
    this.reindexing = true;
    this.progress = { kb: b.id };
    this.draw();
    try {
      await this.ctx.core.request('kb.reindex', { kb: b.id });
      this.kit.toast(this.t('reindexed'));
    } catch (err) {
      this.say(this.refusal(err));
    }
    this.reindexing = false;
    this.progress = null;
    await this.reload();
  }

  /**
   * 点两下才办：第一下记着、重画成「确认」，三秒内再点交真；别的交假。
   * @param {string} key
   */
  arm(key) {
    clearTimeout(this.armTimer);
    if (this.armed === key) {
      this.armed = null;
      return true;
    }
    this.armed = key;
    this.draw();
    this.armTimer = setTimeout(() => { if (this.armed === key) { this.armed = null; this.draw(); } }, ARM_MS);
    return false;
  }

  // —— 别的 ——

  /** 库的名字（搜到的段、看原文的头上写） @param {string} id */
  nameOf(id) {
    const b = this.bases.find((x) => x.id === id);
    return b?.name || id;
  }

  /** 画一段 Markdown（经整页的 `markdown` 服务；图不画，`style.css`）；没有这个服务的照原文写 @param {string} text @param {string} tag */
  markdown(text, tag) {
    const el = /** @type {HTMLElement} */ (h(tag));
    if (this.ctx.markdown?.render) this.ctx.markdown.render(el, text);
    else el.append(h('pre.kb-plain', text));
    return el;
  }

  /** 核心拒了：照原因写一句 @param {any} err */
  refusal(err) {
    const why = err?.data?.reason;
    if (why === 'kb_read_only') return this.t('errors.read_only');
    if (why === 'kb_packaged') return this.t('errors.packaged');
    if (why === 'unknown_kb') return this.t('errors.unknown_kb');
    if (why === 'unknown_document') return this.t('errors.unknown_document');
    return err?.data?.message ?? err?.message ?? String(err);
  }

  /** @param {string} text */
  say(text) {
    if (text) this.kit?.toast(text);
  }
}

/** 搜的字淡黄底标出来（画好的 Markdown 里一段段字找，不区分大小写） @param {HTMLElement} root @param {string} q */
function mark(root, q) {
  if (!q) return;
  const lower = q.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** @type {Text[]} */
  const found = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.toLowerCase().includes(lower)) found.push(/** @type {Text} */ (n));
  for (const node of found) {
    const text = node.nodeValue ?? '';
    const parts = [];
    let at = 0;
    for (let i = text.toLowerCase().indexOf(lower); i >= 0; i = text.toLowerCase().indexOf(lower, at)) {
      parts.push(text.slice(at, i), h('mark', text.slice(i, i + q.length)));
      at = i + q.length;
    }
    parts.push(text.slice(at));
    node.replaceWith(...parts);
  }
}

/** 看原文时滚到片段那一处：找头一个字里含着它的块，滚到它、淡淡亮一下。 @param {HTMLElement} root @param {string} probe */
function scrollToText(root, probe) {
  const blocks = root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, pre, blockquote');
  for (const el of blocks) {
    if (!(el.textContent ?? '').includes(probe)) continue;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('kb-found');
    return;
  }
}
