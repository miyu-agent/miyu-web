// @ts-check
//! 时间线的一步（蓝图 `web.md`「时间线」，照旧版网页 `app.js:6962-7051`、`8574-8771`、`diff.js`）：思考一行、工具一行，
//! 下面接在想时的窗口、命令本身、点开的细节。
//!
//! 一步是一个一直在的节点，流式的字来了只改里面的字：新来的一步淡入一次，在想的标题的流光不断（重建节点会从头来）。
//! 点开、收起记在这一步里，人点过的照人点的；没点过的照 `timeline.json` 的 `expand`。

import { fromUnified, samePath } from '../model/diff.js';
import { h, icon, replace, hasIcon } from './dom.js';
import { spring } from '../lib/motion.js';
import { res, t, moreIcons } from '../util/res.js';
import { row, peek, messagePeek, rollStart, commandLines, details, kindOf, quiet } from '../model/words.js';
import { imageCard } from './media.js';
import { drawMarkdown } from './render.js';
import { blobUrl } from '../core/host.js';
import { NestedList } from './nested.js';

export class StepView {
  /**
   * @param {import('../model/timeline.js').Step} step 第一次的样子：种类（思考、工具）以后不变
   * @param {import('./rich.js').Where} where 看着的会话在哪（点开时问调用的输出）
   * @param {boolean} fresh 新来的：淡入一次（读回来的历史不淡入）
   * @param {() => void} [foldSegment] 收起它在的那一段：铺开画（`bare`）的时候，点内容收的是整段
   */
  constructor(step, where, fresh, foldSegment = () => {}) {
    this.where = where;
    this.foldSegment = foldSegment;
    /** 人点过：开还是关；没点过的是 `null`。 */
    this.open = /** @type {boolean|null} */ (null);
    this.step = step;
    this.thought = step.kind === 'thought';
    this.iconName = '';
    this.drawnBody = '';
    this.drawnCommand = '';
    this.node = h('span.tl-node');
    this.name = h('span.tl-name');
    this.time = h('span.tl-time');
    /** 一段里只有这一步、人点开了那一段：不画这一行，直接铺开内容（`timeline.js` 的 `bare`）。 */
    this.bare = false;
    /** 只有这一步、人点开了那一段的工具（照常画标题行，`words.js` 的 `keepsHead`）：没点过这一步的先开着。 */
    this.lead = false;
    // 先告诉对话区钉住被点的这一行（内容往下长，`follow.js`），再开、关
    const toggle = guard(() => {
      // 铺开画的（一段里只有这一步、人点开了那一段）：这一步一直开着，点内容收起整段（2026-09-30 项目主人：原来只能点那一段的
      // 收起那一行才收得起）
      if (this.bare) {
        this.foldSegment();
        return;
      }
      // 点不开的（忘掉、删知识库文档）
      if (quiet(this.step)) return;
      this.row.dispatchEvent(new CustomEvent('tl-toggle', { bubbles: true }));
      this.open = !this.opened();
      this.update(this.step, this.spinning, this.live);
    });
    if (this.thought) {
      this.peek = h('span.tl-peek', h('span'));
      // 那一小段前面的 `·` 单独一个：放不下时那一小段左边淡出，点不跟着淡没
      this.row = h('button.tl-row', { type: 'button', onclick: toggle },
        this.node, this.name, this.time, h('span.tl-peek-dot', t('timeline.peek_sep')), this.peek, h('span.tl-chevron', icon('chevron-right')));
      // 在想时滚着的那几行：和那一行一样能点（2026-09-30 项目主人：原来只能点那一行）
      this.window = h('div.tl-window', { onclick: toggle });
      // 点开的全文也整块能点：点了收起（选着字的时候不收，`guard`），悬停亮一档（2026-09-30 项目主人定）
      this.body = h('div.tl-thought-body', { onclick: toggle });
      // 全文放在和工具细节同一种收放的壳里：点开、收起都有动画
      this.el = h(`div.tl-step.is-thought${fresh ? '.is-new' : ''}`, this.row, this.window, h('div.tl-fold', h('div.tl-fold-inner', this.body)));
    } else {
      this.subject = h('span.tl-subject');
      this.said = h('span.tl-said');
      // 编辑、写入：加减的行数（`+3 -1`）
      this.diff = h('span.tl-diff');
      // 执行命令：脚本最近调的那个工具（`#12 翻记忆`，核心 M-5 上）
      this.nestedTail = h('span.tl-nested-tail', { hidden: true });
      // 执行中的进度（核心 X-45 补）：那一行后面接「· 视频 3.0 MiB / 16.5 MiB（18%）」，暗色、原地换，结果来了收掉
      this.progress = h('span.tl-progress', { hidden: true });
      this.status = h('span.tl-status');
      // 留言：收着时那一行后面接留言开头的预览（2026-10-01 项目主人定）
      const message = kindOf(step.name) === 'message';
      // 编号和预览中间一个 `·`（2026-10-01 项目主人定）
      this.peek = message ? h('span.tl-peek', h('span.tl-peek-sep', t('timeline.peek_sep')), h('span')) : null;
      this.row = h('button.tl-row', { type: 'button', onclick: toggle },
        this.node, h('span.tl-head', this.name, this.time, this.subject, this.said, this.diff, this.nestedTail, this.progress), this.peek, this.status);
      this.command = h('div.tl-command', { onclick: toggle });
      // 点开的细节：点这一块也收起（点的是链接、按钮、图，或者拖选了字的不算；蓝图「压缩、清空」里的开关规矩）
      this.body = h('div.tl-body', {
        onclick: (/** @type {MouseEvent} */ e) => {
          if (/** @type {Element} */ (e.target).closest('a, button, input, textarea, .conversation-media, .tl-nested')) return;
          toggle(e);
        },
      });
      // 收着时结果里的图（读图）画在预览区，小一点；点开换成细节里的那张（蓝图「图片」第 2 条）
      this.thumbs = h('div.tl-thumbs', { hidden: true });
      this.el = h(`div.tl-step.is-tool${message ? '.is-message' : ''}${fresh ? '.is-new' : ''}`, this.row, this.command, this.thumbs, h('div.tl-fold', h('div.tl-fold-inner', this.body)));
    }
    this.spinning = false;
  }

  /** 现在点开着没有。不画那一行的一直开着。 */
  opened() {
    if (this.bare) return true;
    if (this.open != null) return this.open;
    if (this.lead) return true;
    const expand = res.timeline.expand;
    const kind = this.thought ? 'thought' : kindOf(this.step.name);
    return kind ? !!expand[kind] : false;
  }

  /**
   * 照这一步现在的样子改字。
   * @param {import('../model/timeline.js').Step} step
   * @param {boolean} spinning 这一段正在动的那一步（同一时刻只转一处）
   * @param {boolean} [live] 这一段还在进行：想完的思考照旧露着最后几行，等这一段收起（照 TUI，不一条一条地缩）
   */
  update(step, spinning, live = false) {
    this.live = live;
    this.step = step;
    this.spinning = spinning;
    const r = row(step);
    const open = this.opened();
    this.el.classList.toggle('is-open', open);
    this.el.classList.toggle('is-bare', this.bare);
    this.el.classList.toggle('is-quiet', quiet(step));
    this.el.classList.toggle('is-failed', r.failed);
    this.el.classList.toggle('is-live', step.state !== 'done');
    this.el.classList.toggle('is-preparing', step.state === 'preparing');
    this.setIcon(r.icon, step.state === 'preparing');
    this.name.textContent = r.name;
    setTime(this.time, r, step.state === 'preparing');
    if (step.kind === 'thought') this.updateThought(step, open);
    else this.updateTool(step, r, open, spinning);
  }

  /**
   * 思考：收着时接那一小段；这一段还在进行、收着时下面滚着显示最后几行（想完了也留着，照 TUI「时间线」第 5 条：原来想完
   * 就缩成一行，一条思考缩一次，正文跟着上下跳）；点开是全部的字。
   */
  updateThought(step, open) {
    const tail = /** @type {HTMLElement} */ (this.peek?.firstChild);
    tail.textContent = peek(step);
    // 放不下时从右往左推、左边淡出（照旧版 setReasoningPeek）
    requestAnimationFrame(() => this.peek?.classList.toggle('is-overflow', tail.offsetWidth > (this.peek?.clientWidth ?? 0)));
    const rolling = this.live && !open && !!step.text.trim();
    this.window.hidden = !rolling;
    this.el.classList.toggle('is-rolling', rolling);
    if (rolling) this.roll(step.text.trim(), step.state === 'thinking');
    else this.rollText = '';
    // 收起时字留着，收的动画里还看得到；点开时照最新的字接上
    if (open) this.thinkText(step.text.trim(), step.state === 'thinking');
  }

  /**
   * 在想时滚着的那几行（蓝图「思考的预览」）：照 Markdown 流式画末尾那一截（2026-10-29 项目主人），开头切在能单独画的一行
   * （`rollStart`）。来了新字，每一帧自己往底下追一截（临界阻尼的弹簧 `spring`，时间常数 `roll_ms`），起步不猛、字一阵阵来也是
   * 连着滑，不一下跳上去（2026-10-01、10-02 项目主人指出：原来每来一段重开一次浏览器的平滑滚动，Firefox 里接不上）。画出来超过
   * 四屏高时开头往后挪，挪掉的高度自己把位置补回来（CSS 关了滚动锚定）。刚露出来的那一下直接到底。这一步想完了（段还没完、
   * 这几行还留着）照收全的再画一次。
   * @param {string} text @param {boolean} streaming 这一步还在想
   */
  roll(text, streaming) {
    const box = this.window;
    const rows = res.timeline.thinking_rows;
    if (!this.rollMd || !this.rollText || !text.startsWith(this.rollText)) {
      // 刚露出来、字不是接着原来的：从末尾两屏画起，直接到底
      this.rollMd = h('div.markdown-body.tl-think-md');
      replace(box, this.rollMd);
      this.rollText = text;
      this.rollStreaming = streaming;
      this.rollFrom = rollStart(text, rows * 2);
      drawMarkdown(this.rollMd, text.slice(this.rollFrom), { streaming });
      box.scrollTop = box.scrollHeight;
      this.rollAt = { pos: box.scrollTop, vel: 0 };
      return;
    }
    if (text === this.rollText && streaming === this.rollStreaming) return;
    this.rollText = text;
    this.rollStreaming = streaming;
    drawMarkdown(this.rollMd, text.slice(this.rollFrom), { streaming });
    if (box.scrollHeight > box.clientHeight * 4) {
      const from = rollStart(text, rows * 2, this.rollFrom);
      if (from > this.rollFrom) {
        const before = box.scrollHeight;
        this.rollFrom = from;
        drawMarkdown(this.rollMd, text.slice(from), { streaming });
        const at = this.rollAt ?? { pos: box.scrollTop, vel: 0 };
        this.rollAt = { pos: Math.max(0, at.pos - (before - box.scrollHeight)), vel: at.vel };
        box.scrollTop = this.rollAt.pos;
      }
    }
    this.follow();
  }

  /** 往底下追：一帧走一截，到了停；这一块不在页面上了也停。少动画的直接到底。 */
  follow() {
    if (this.rollFrame) return;
    const box = this.window;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tau = reduced ? 0 : res.timeline.roll_ms;
    let last = performance.now();
    const step = (now) => {
      this.rollFrame = 0;
      if (!box.isConnected || box.hidden) return;
      const target = box.scrollHeight - box.clientHeight;
      this.rollAt = spring(this.rollAt ?? { pos: box.scrollTop, vel: 0 }, target, now - last, tau);
      last = now;
      box.scrollTop = this.rollAt.pos;
      if (this.rollAt.pos !== target || this.rollAt.vel !== 0) this.rollFrame = requestAnimationFrame(step);
    };
    this.rollFrame = requestAnimationFrame(step);
  }

  /**
   * 点开的思考全文：照 Markdown 画（蓝图「点开思考」，2026-10-29 项目主人），用回答的同一套画法、收敛的样子（`.tl-think-md`）。
   * 这一步还在想的照 `streaming` 画（半截的写法先补齐），想完了照收全的再画一次；字和状态都没变的不重画。不接链接卡片、mermaid 这些。
   * @param {string} text @param {boolean} streaming 这一步还在想（`state: thinking`）
   */
  thinkText(text, streaming) {
    if (!this.md) {
      this.md = h('div.markdown-body.tl-think-md');
      replace(this.body, this.md);
    }
    const sig = `${streaming ? '~' : '='}${text}`;
    if (this.mdSig === sig) return;
    this.mdSig = sig;
    drawMarkdown(this.md, text, { streaming });
  }

  /** 工具：状态、命令本身、点开的细节。 */
  updateTool(step, r, open, spinning) {
    this.subject.textContent = r.subject ?? '';
    this.subject.classList.toggle('is-mono', r.mono);
    this.subject.hidden = !r.subject;
    this.said.textContent = r.said ?? '';
    this.said.hidden = !r.said;
    const diff = r.diff ? `+${r.diff.added} -${r.diff.removed}` : '';
    if (this.diff.dataset.sig !== diff) {
      this.diff.dataset.sig = diff;
      replace(this.diff, r.diff ? [h('span.tl-added', `+${r.diff.added}`), ' ', h('span.tl-removed', `-${r.diff.removed}`)] : []);
    }
    this.diff.hidden = !r.diff;
    const tail = r.nested ?? null;
    setText(this.nestedTail, tail?.text ?? '');
    this.nestedTail.hidden = !tail;
    this.nestedTail.classList.toggle('is-danger', tail?.tone === 'danger');
    this.nestedTail.classList.toggle('is-warn', tail?.tone === 'warn');
    const progress = step.progress ?? null;
    setText(this.progress, progress ?? '');
    this.progress.hidden = !progress;
    this.progress.title = progress ?? '';
    if (this.peek) {
      const text = messagePeek(step);
      setText(/** @type {HTMLElement} */ (this.peek.lastChild), text);
      this.peek.hidden = !text;
    }
    // 在跑的转一个圈；排着队的一个暗的点；做完的什么都不写
    const status = spinning && step.state === 'running' ? 'spin' : step.state === 'running' ? 'queued' : '';
    if (this.status.dataset.state !== status) {
      this.status.dataset.state = status;
      if (status === 'spin') replace(this.status, icon('loader-circle'));
      else replace(this.status, status === 'queued' ? '·' : '');
    }
    const lines = commandLines(step);
    const sig = JSON.stringify(lines);
    if (sig !== this.drawnCommand) {
      this.drawnCommand = sig;
      replace(this.command, lines ? [...lines.lines.map((l) => h('div.tl-cline', l)), lines.more ? h('div.tl-more', '⋮') : null] : []);
    }
    this.command.hidden = !lines;
    this.drawThumbs(step, open);
    if (!open) return;
    // 照条目画的（核心 9-8）：条目里没有结果原文，点开时问一次核心（`view.detail` 的 `output`），问到了重画
    if (step.title && !step.output && step.state === 'done' && !(step.detail && step.status === 'ok')) {
      if (this.output == null) this.fetchOutput(step);
      step = { ...step, output: this.output ?? '' };
    }
    const body = JSON.stringify([step.output, step.status, step.args, step.said, step.detail ?? null]);
    if (body === this.drawnBody) {
      this.drawNested(step);
      return;
    }
    this.drawnBody = body;
    /** @type {[any, HTMLElement][]} 差异卡片：问到核心算好的差异以后换掉 */
    const cards = [];
    replace(this.body, details(step).map((s) => {
      if (s.kind === 'diff') {
        const card = diffCard(s);
        cards.push([s, card]);
        return card;
      }
      if (s.kind === 'images') return this.imagesNode(s);
      // 通用的结构化结果（核心 W-11 补）：链接一条一块，能点、新标签页打开；表格照回答里的 Markdown 表格画
      if (s.kind === 'links') return h('div.tl-detail', h('div.tl-label', s.label), h('div.tl-links', s.links.map((l) =>
        h('div.tl-link-card', h('a.tl-link', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.title),
          l.meta ? h('div.tl-link-meta', l.meta) : null, l.snippet ? h('div.tl-link-snippet', l.snippet) : null))));
      if (s.kind === 'table') return h('div.tl-detail', h('div.tl-label', s.label), h('div.markdown-body.tl-table', h('div.markdown-table-scroll',
        h('table', h('thead', h('tr', s.columns.map((c) => h('th', c)))), h('tbody', s.rows.map((r) => h('tr', r.map((c) => h('td', c)))))))));
      // 翻记忆、查知识库、读文档（核心给人看的 `detail`）：记忆一条一行，对话片段、命中一段一块，读到的那一页照 Markdown
      if (s.kind === 'rows') return h('div.tl-detail', h('div.tl-label', s.label), ...s.rows.map((r) => h(`div.tl-found-row${r.struck ? '.is-struck' : ''}`, r.head ? h('span.tl-found-head', r.head) : null, h('span.tl-found-text', r.text))));
      if (s.kind === 'blocks') return h('div.tl-detail', h('div.tl-label', s.label), ...s.blocks.map((b) => h('div.tl-found-block', b.head ? h('div.tl-found-head', b.head) : null, b.md ? this.markdownNode(b.text) : h('pre', b.text))));
      if (s.kind === 'markdown') return h('div.tl-detail', h('div.tl-label', s.label), this.markdownNode(s.text));
      return h('div.tl-detail', h('div.tl-label', s.label), h('pre', s.text));
    }));
    if (cards.length) this.fullDiff(step, cards);
    this.drawNested(step);
  }

  /** 点开着的执行命令：脚本调用的工具那一段接在细节后面，条目上那一格变了接着要（命令还在跑也画）。 @param {any} step */
  drawNested(step) {
    if (!step.nested || !step.callId || !this.where.nested) return;
    const call = step.callId;
    this.nestedList ??= new NestedList((after) => this.where.nested?.(call, after) ?? Promise.resolve(null));
    if (this.nestedList.el.parentNode !== this.body) this.body.append(this.nestedList.el);
    this.nestedList.sync(step.nested);
  }

  /** 知识库的文档（读到的那一页、查到的片段）照 Markdown 画，里面的图不画（`styles/timeline.css`）。 @param {string} text */
  markdownNode(text) {
    const md = h('div.markdown-body.tl-found-doc');
    drawMarkdown(md, text, { streaming: false });
    return md;
  }

  /** 问核心这一步的结果原文（`view.detail` 的 `output`，同一次调用只问一次，`ui/app.js` 记着）；问到了照新的字重画。 @param {any} step */
  fetchOutput(step) {
    if (!step.callId || !this.where.detail || this.fetching) return;
    this.fetching = true;
    this.where.detail(step.callId).then((got) => {
      this.output = typeof got?.output === 'string' ? got.output : '';
      this.drawnBody = '';
      if (this.el.isConnected) this.update(this.step, this.spinning, this.live);
    });
  }

  /**
   * 编辑、写入做完了：问核心这次调用真改了什么（`view.detail`，完整的差异带行号），照路径换掉照参数比的那张卡片；算不出的写为什么，
   * 进回收站的写一句。问不到的（旧核心、没改成）照参数比的留着。
   * @param {any} step @param {[any, HTMLElement][]} cards
   */
  fullDiff(step, cards) {
    if (!step.callId || step.end == null || !this.where.detail) return;
    this.where.detail(step.callId).then((got) => {
      const files = got?.files ?? [];
      for (const [s, card] of cards) {
        const file = files.find((f) => samePath(f.path, s.path)) ?? (files.length === 1 && cards.length === 1 ? files[0] : null);
        if (!file || !card.isConnected) continue;
        card.replaceWith(file.action === 'trash' ? noteCard(s, t('timeline.trashed'))
          : file.skipped ? noteCard(s, t(`timeline.diff_skipped.${file.skipped}`))
            : diffCard({ ...s, diff: fromUnified(file.diff ?? []) }));
      }
    });
  }

  /** 收着时预览区的小图（`result_image_thumb`）：点开了收掉，换成细节里的；图变了才重画。 */
  drawThumbs(step, open) {
    const images = step.images ?? [];
    this.thumbs.hidden = open || !images.length || !this.where.session;
    const sig = images.map((img) => img.blob).join(',');
    if (this.thumbs.hidden || this.thumbs.dataset.sig === sig) return;
    this.thumbs.dataset.sig = sig;
    const row = /** @type {HTMLElement} */ (this.imagesNode({ label: '', images }).lastChild);
    row.style.setProperty('--media-max', `${res.layout.result_image_thumb}px`);
    replace(this.thumbs, row);
  }

  /** 结果里的图：小一点（`result_image_max`），照核心收下的 blob 取，点开是灯箱（蓝图「图片」第 2 条）。 */
  imagesNode(s) {
    const name = String(this.step.parsed?.file_path ?? '').split('/').pop() || undefined;
    return h('div.tl-detail', s.label ? h('div.tl-label', s.label) : null,
      h('div.tl-images', { style: `--media-max: ${res.layout.result_image_max}px` }, s.images.map((img) =>
        // 不照记的宽高先占地方：记的是原图的，blob 可能缩过、比例对不上，框会多出一截空（照图自己的比例画）
        // 通用结构化结果的图（核心 W-11 补）带一句说明：写在图下面
        img.caption ? h('figure.tl-figure', imageCard({ url: blobUrl(img.blob, img.media_type), name, lightbox: this.where.lightbox }), h('figcaption', img.caption))
          : imageCard({ url: blobUrl(img.blob, img.media_type), name, lightbox: this.where.lightbox }))));
  }

  /** 节点里的图标：变了才换（在想的原子图标在呼吸，别打断）。 */
  setIcon(name, spin) {
    if (name === this.iconName) return;
    this.iconName = name;
    const svg = icon(name);
    if (spin) svg.classList.add('is-spin');
    replace(this.node, svg);
    // 软件包写的图标不在常用的那一套里：读一次整套图标再画；整套里也没有这个名字的（写错了、Lucide 改了名）画通用的扳手
    if (!hasIcon(name)) moreIcons().then(() => {
      if (this.iconName !== name) return;
      const again = icon(hasIcon(name) ? name : res.timeline.icon_default);
      if (spin) again.classList.add('is-spin');
      replace(this.node, again);
    });
  }
}

/** 用时那一格：做完的写定的字；在走的记下从哪一刻起、怎么写，由 `Ticker` 走表。 */
function setTime(el, r, preparing) {
  el.hidden = !r.took && !r.timer;
  el.classList.toggle('tl-timer', !!r.timer);
  if (r.timer) {
    el.dataset.since = String(r.timer.since);
    el.dataset.format = r.timer.format;
    el.dataset.lead = preparing ? ' · ' : '';
  } else {
    delete el.dataset.since;
    el.textContent = r.took ?? '';
  }
}

/**
 * 差异卡片（照旧版 `diff.js:139-200`）：头一行「修改」「新建」、路径、`+N −N`；下面一行一行，加的 `+`、删的 `−`，
 * 两处之间一行 `⋯`。
 */
function diffCard(s) {
  const marks = { added: '+', removed: '−', keep: ' ' };
  // 行号：核心算好的差异、写入照参数比的有；编辑照参数比的不知道在第几行，这一列空着
  const numbered = s.diff.lines.some((l) => l.number != null);
  return h(`div.diff-file${numbered ? '.is-numbered' : ''}`,
    h('div.diff-file-head',
      h(`span.diff-op${s.created ? '.is-add' : ''}`, s.op),
      h('span.diff-path', s.path),
      h('span.diff-stat', h('b.diff-stat-add', `+${s.diff.added}`), ' ', h('b.diff-stat-del', `−${s.diff.removed}`))),
    h('div.diff-lines', s.diff.lines.map((l) => (l.mark === 'gap'
      ? h('div.diff-hunk', '⋯')
      : h(`div.diff-line.is-${l.mark}`, numbered ? h('span.diff-no', l.number ?? '') : null, h('span.diff-gutter', marks[l.mark]), h('span.diff-text', l.text))))));
}

/** 没有差异可画的那张卡片（进回收站的、核心算不出的）：头一行照旧，下面一句为什么。 */
function noteCard(s, text) {
  return h('div.diff-file', h('div.diff-file-head', h(`span.diff-op${s.created ? '.is-add' : ''}`, s.op), h('span.diff-path', s.path)), h('p.diff-note', text));
}

/** 点击：拖选了字的不算点（字照常能拖选）。 */
export function guard(fn) {
  return (/** @type {Event} */ e) => {
    if (String(getSelection() ?? '')) return;
    e.stopPropagation();
    fn();
  };
}

/** 字变了才写（流式的参数一个字一个字来，别每一下都动 DOM）。 */
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
