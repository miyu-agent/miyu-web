// @ts-check
//! 人叫的整理的进度（蓝图 `web.md`「记忆页」第 13 条，核心 R-21）：照记忆日志（`memory.event`）和模型边写边推的决定（`memory.dreaming`）
//! 记着这一趟到哪了、滚动区要浮过哪几行。纯逻辑，界面在 `dream.js`。
//!
//! 进度：批和批之间照合了多少（头一批的 `left` 是总数，合完的各批 `fresh` 加起来）；一批之内照推来了几条决定往前挪，最多挪到这一批的
//! 九成，`merged` 来了走满。只重看旧记忆的那一批（`fresh`、`left` 都是 0）照这一批自己的决定走。

/** 一批之内最多挪到几成 */
export const WITHIN = 0.9;
/** 一批之内每多一条决定，离九成还差的剩几成（越来越慢，不知道这一批会写几条） */
const STEP = 0.72;

/**
 * 滚动区的一行。
 * @typedef {{kind: 'read', id: string}
 *   | {kind: 'batch', count: number}
 *   | {kind: 'new', id: string, text: string}
 *   | {kind: 'del', id: string, retire: string|null, kept: string|null, why: string}
 *   | {kind: 'sum', chars: number, done: boolean}
 *   | {kind: 'kw', id: string, keywords: string}
 *   | {kind: 'fail'}} Line
 * @typedef {{upto: number, fresh: number, given: string[], decided: number}} Batch
 */

export class DreamTrack {
  constructor() {
    /** 一共几条要合（头一批的 `left`）；还没开始的是 `null` @type {number|null} */
    this.total = null;
    /** 合完了几条（收了尾的各批 `fresh` 加起来） */
    this.merged = 0;
    /** 第几批（从 1 起；还没开始是 0） */
    this.batches = 0;
    /** 正在合的那一批 @type {Batch|null} */
    this.batch = null;
    /** 最后一批交了几条（只重看旧记忆时底下写「重看 N 条」） */
    this.given = 0;
    this.tally = { del: 0, new: 0, kw: 0 };
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
      if (this.total === null) this.total = num(body.left);
      const given = Array.isArray(body.given) ? body.given.map(String) : [];
      this.batch = { upto: body.upto, fresh, given, decided: 0 };
      this.batches += 1;
      this.given = given.length;
      // 老核心（R-21 以前）不带 `given`：只写一行这一批几条，滚动区不空着
      if (!Array.isArray(body.given)) return fresh ? [{ kind: 'batch', count: fresh }] : [];
      return given.map((id) => ({ kind: /** @type {const} */ ('read'), id }));
    }
    if (kind === 'ext.memory.merged' && this.batch && body.upto === this.batch.upto) {
      this.merged += this.batch.fresh;
      this.batch = null;
      return [];
    }
    if (kind === 'ext.memory.merge_failed' && this.batch && body.upto === this.batch.upto) {
      this.batch.decided = 0;
      return [{ kind: 'fail' }];
    }
    // 补的关键词：合完以后日志里的（不在 `memory.dreaming` 里）
    if (kind === 'ext.memory.tagged' && typeof body.id === 'string') {
      this.tally.kw += 1;
      return [{ kind: 'kw', id: body.id, keywords: Array.isArray(body.keywords) ? body.keywords.join('、') : String(body.keywords ?? '') }];
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

  /** 走到哪了：0 到 1。 */
  progress() {
    const within = this.batch ? WITHIN * (1 - STEP ** this.batch.decided) : 0;
    if (this.total) return Math.min(1, (this.merged + (this.batch ? this.batch.fresh * within : 0)) / this.total);
    // 只重看旧记忆（没有要合的新记忆）：照这一批自己的
    return this.batch ? within : this.batches ? 1 : 0;
  }
}

/** @param {any} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
