// @ts-check
//! 人叫的整理的进度（蓝图 `web.md`「记忆页」第 13 条，核心 R-21、R-22）：照记忆日志（`memory.event`）和模型边写边推的决定（`memory.dreaming`）
//! 记着这一趟到哪了、滚动区要浮过哪几行、合完以后结果那一行点开列什么。纯逻辑，界面在 `dream.js`。
//!
//! 进度只照合了多少（头一批的 `left` 是总数，合完的各批 `fresh` 加起来）：一批之内不往前挪，`merged` 来了才走（2026-10-20 项目主人在终端
//! 验收时说「进度条是假的」：她想完一口气写完，照写出的条数挪会一下跳满，写出几条决定也不等于合了几条）。只重看旧记忆的那一批
//! （`fresh`、`left` 都是 0）合完了才算满。

/**
 * 滚动区的一行。
 * @typedef {{kind: 'read', id: string}
 *   | {kind: 'batch', count: number}
 *   | {kind: 'new', id: string, text: string}
 *   | {kind: 'del', id: string, retire: string|null, kept: string|null, why: string}
 *   | {kind: 'sum', chars: number, done: boolean}
 *   | {kind: 'kw', id: string, keywords: string}
 *   | {kind: 'fail'}
 *   | {kind: 'stopped'}} Line
 * @typedef {{upto: number, fresh: number, left: number, given: string[], decided: number}} Batch
 * 结果那一行点开列的一条：日志里记忆模块真正存下的（改的是新写一条指着旧的，作废的带种类，摘要是全文）。
 * @typedef {{kind: 'new', id: string, text: string}
 *   | {kind: 'del', id: string, retire: string|null, kept: string|null, why: string}
 *   | {kind: 'summary', text: string}} Saved
 */

export class DreamTrack {
  constructor() {
    /** 一共几条要合（头一批的 `left`）；还没开始的是 `null` @type {number|null} */
    this.total = null;
    /** 合完了几条（收了尾的各批 `fresh` 加起来） */
    this.merged = 0;
    /** 第几批（从 1 起；还没开始是 0） */
    this.batches = 0;
    /** 收了尾的有几批 */
    this.closed = 0;
    /** 正在合的那一批 @type {Batch|null} */
    this.batch = null;
    /** 最后一批交了几条（只重看旧记忆时底下写「重看 N 条」） */
    this.given = 0;
    /** 叫停了（这一批记了 `merge_failed`，`why: stopped`，核心 R-22） */
    this.stopped = false;
    this.tally = { del: 0, new: 0, kw: 0 };
    /** 这一趟真正存下的（结果那一行点开列它） @type {Saved[]} */
    this.saved = [];
  }

  /**
   * 记忆日志的一行（`memory.event` 的 `event`）：交回要浮过的几行。后台自己整理的（`manual` 不是真的）不管。
   * @param {any} event @returns {Line[]}
   */
  logged(event) {
    const kind = event?.kind;
    const body = event?.body ?? {};
    if (kind === 'ext.memory.merging') {
      if (body.manual !== true) return [];
      const fresh = num(body.fresh);
      const left = num(body.left);
      if (this.total === null) this.total = left;
      const given = Array.isArray(body.given) ? body.given.map(String) : [];
      this.batch = { upto: body.upto, fresh, left, given, decided: 0 };
      this.batches += 1;
      this.given = given.length;
      // 老核心（R-21 以前）不带 `given`：只写一行这一批几条，滚动区不空着
      if (!Array.isArray(body.given)) return fresh ? [{ kind: 'batch', count: fresh }] : [];
      return given.map((id) => ({ kind: /** @type {const} */ ('read'), id }));
    }
    if (kind === 'ext.memory.merged' && this.batch && body.upto === this.batch.upto) {
      this.merged += this.batch.fresh;
      this.closed += 1;
      this.batch = null;
      return [];
    }
    if (kind === 'ext.memory.merge_failed' && this.batch && body.upto === this.batch.upto) {
      this.batch.decided = 0;
      // 人叫停的（R-22）：这一批放弃，下次再合；不是没合成，不写「再试一次」
      if (body.why === 'stopped') {
        this.stopped = true;
        this.batch = null;
        return [{ kind: 'stopped' }];
      }
      return [{ kind: 'fail' }];
    }
    // 补的关键词：合完以后日志里的（不在 `memory.dreaming` 里）
    if (kind === 'ext.memory.tagged' && typeof body.id === 'string') {
      this.tally.kw += 1;
      return [{ kind: 'kw', id: body.id, keywords: Array.isArray(body.keywords) ? body.keywords.join('、') : String(body.keywords ?? '') }];
    }
    // 这一批真正存下的（合着的时候才记：同一时刻别的会话抽的新记忆不算）
    if (this.batch) {
      if (kind === 'ext.memory.saved' && typeof body.replaces === 'string') this.saved.push({ kind: 'new', id: body.replaces, text: String(body.text ?? '') });
      else if (kind === 'ext.memory.retired' && typeof body.id === 'string' && typeof body.kind === 'string') {
        this.saved.push({ kind: 'del', id: body.id, retire: body.kind, kept: typeof body.kept === 'string' ? body.kept : null, why: String(body.why ?? '') });
      } else if (kind === 'ext.memory.summary' && typeof body.text === 'string') {
        // 摘要只留最后一份
        this.saved = this.saved.filter((s) => s.kind !== 'summary');
        this.saved.push({ kind: 'summary', text: body.text });
      }
    }
    return [];
  }

  /**
   * 模型边写边推的一条决定（`memory.dreaming` 的 `params`）：不是正在合的那一批的不管。交回要浮过的几行。
   * @param {any} p @returns {Line[]}
   */
  dreaming(p) {
    if (!this.batch || p?.upto !== this.batch.upto) return [];
    if (p.kind === 'revised' && typeof p.id === 'string') {
      this.batch.decided += 1;
      this.tally.new += 1;
      return [{ kind: 'new', id: p.id, text: String(p.text ?? '') }];
    }
    if (p.kind === 'retired' && typeof p.id === 'string') {
      this.batch.decided += 1;
      this.tally.del += 1;
      return [{ kind: 'del', id: p.id, retire: typeof p.retire === 'string' ? p.retire : null, kept: typeof p.kept === 'string' ? p.kept : null, why: String(p.why ?? '') }];
    }
    if (p.kind === 'summary') {
      this.batch.decided += 1;
      return [{ kind: 'sum', chars: num(p.chars), done: p.done === true }];
    }
    return [];
  }

  /** 走到哪了：0 到 1，只照合完的批（一批之内不挪）。 */
  progress() {
    if (this.total) return Math.min(1, this.merged / this.total);
    // 只重看旧记忆（没有要合的新记忆）：合完了才满
    return this.batch ? 0 : this.closed ? 1 : 0;
  }

  /** 这一批她还一个字都没写出来：正在合、还没推来决定（头一行原来照它写「做梦中…」，2026-10-20 项目主人删掉了） */
  quiet() {
    return !!this.batch && this.batch.decided === 0;
  }

  /** 一共几批：收了尾的加上这一批起还要几批（这一批的 `left` ÷ 每批 `fresh`）；还没开始、算不出的是 `null` */
  planned() {
    const b = this.batch;
    if (!b) return this.closed || null;
    if (!b.fresh) return this.batches;
    return this.batches - 1 + Math.max(1, Math.ceil(b.left / b.fresh));
  }
}

/** @param {any} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * 「整理记录」一行右边写什么（核心 DR-1、记忆 D-2 补的 `dream.result`）：在跑的交 `running`；跑完的「改 N · 删 N」，叫停的前面接「已叫停」；
 * 不在跑又没有结果的（出错、没跑完、核心崩了没记上）是 `unfinished`。纯的。
 * @param {{busy?: boolean, dream?: {result?: any}}} e 会话表那一项
 * @returns {{kind: 'running'}|{kind: 'unfinished'}|{kind: 'done', revised: number, retired: number, stopped: boolean}}
 */
export function dreamOutcome(e) {
  if (e?.busy) return { kind: 'running' };
  const r = e?.dream?.result;
  if (!r || typeof r !== 'object') return { kind: 'unfinished' };
  const n = (/** @type {any} */ v) => (Number.isInteger(v) && v > 0 ? v : 0);
  return { kind: 'done', revised: n(r.revised), retired: n(r.retired), stopped: r.stopped === true };
}

/**
 * 跑完的那一趟写成一句：是 0 的那一截不写（2026-10-27 项目主人：0 的就不必要显示出来了），叫停的前面接「已叫停」；什么都没有的是空串。
 * @param {{revised: number, retired: number, stopped: boolean}} o `dreamOutcome` 交的 `done` @param {(key: string, fields?: any) => string} t 这个包的字
 */
export function dreamResultText(o, t) {
  const parts = [o.stopped ? t('dream.view.stopped') : '', o.revised ? t('dream.view.revised', { n: o.revised }) : '', o.retired ? t('dream.view.retired', { n: o.retired }) : ''];
  return parts.filter(Boolean).join(t('dream.view.sep'));
}
