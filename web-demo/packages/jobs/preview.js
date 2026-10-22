// @ts-check
//! 后台命令的预览（软件包 `jobs`，蓝图 `web.md`「后台任务」第 3 条最后一点）：浮层里点一条后台命令，在它下面展开一块：「命令」
//! 一段（命令本身），「输出」一段（最后 `preview_lines` 行，等宽，放不下在里面滚）。输出照核心的 `job.output` 读（施工 7-4 补）：
//! 打开时读最后几行；跑着的之后带 `after`、`wait` 接着读（核心 V-6 上：有新的字、命令结束了才答，2026-10-15 设计 00「避免轮询」，
//! 原来每秒从头读一次），收起、浮层关了就不再接，回来的丢掉。输出贴着底，人往上翻了不拽回去。连的核心太旧、没有这个接口的写一句；
//! 回应里没有 `size`（V-6 上以前的核心）的只读开头那一次。

import { h } from '../../src/lib/dom.js';
import { Tail } from './tail.js';

/** JSON-RPC 的「没有这个方法」：连的核心比施工 7-4 补旧，没有 `job.output` */
const NO_METHOD = -32601;

export class Preview {
  /**
   * @param {import('./sections.js').Node} task
   * @param {(path: string, fields?: any) => string} t 这个包的字
   * @param {(owner: string, job: string, after?: number) => Promise<{output: string, lines?: number, truncated?: boolean, running?: boolean, size?: number, more?: boolean}>} read
   *   不带 `after` 的读最后几行；带的读那个字节往后的，没有新的等着
   * @param {number} keep 最多露几行
   * @param {(owner: string, job: string) => {el: HTMLElement, sync: (nested: any) => void}|null} [nested] 脚本调用的工具那一段（核心 M-5 上）
   */
  constructor(task, t, read, keep, nested) {
    this.task = task;
    this.t = t;
    this.read = read;
    this.out = h('pre.jobs-output', t('preview.loading'));
    this.head = h('div.jobs-preview-note', { hidden: true });
    const section = (label, ...body) => h('div.jobs-preview-part', h('div.jobs-preview-label', label), ...body);
    this.el = h('div.jobs-preview',
      section(t('preview.command'), h('pre.jobs-command', task.command ?? t('preview.no_command'))),
      section(t('preview.output'), this.head, this.out));
    // 脚本调用的工具（蓝图「时间线」的「脚本里调的工具」第 3 条）：接在「输出」后面，条目上那一格变了接着要
    this.nested = nested?.(task.owner, task.job) ?? null;
    if (this.nested) {
      this.el.append(this.nested.el);
      this.nested.sync(task.nested);
    }
    /** 露着的字、一共几行 */
    this.tail = new Tail(keep);
    /** 读到第几个字节了；没有（还没读、核心不给）的不接着读 */
    /** @type {number|null} */
    this.size = null;
    /** 读完了、不用再读（结束了；接口没有、任务没了的也不再读） */
    this.done = false;
    /** 第几回接着读：停了、重新开始的换一个，晾着的回来对不上就丢掉 */
    this.run = 0;
  }

  /** 会话状态里这个任务的 `nested` 变了 @param {any} nested */
  syncNested(nested) {
    this.nested?.sync(nested);
  }

  /** 开始读（展开、浮层重新打开）：没读过的读最后几行，跑着的接着往下读到结束。 */
  start() {
    if (this.done) return;
    const run = ++this.run;
    this.follow(run);
  }

  /** 不再接着读（收起、浮层关了）：已经发出去的那一条回来丢掉。 */
  stop() {
    this.run++;
  }

  /** @param {number} run */
  async follow(run) {
    try {
      while (run === this.run && !this.done) {
        const first = this.size === null;
        const got = await this.read(this.task.owner, this.task.job, first ? undefined : /** @type {number} */ (this.size));
        if (run !== this.run) return;
        if (first) this.reset(got);
        else this.append(got);
        if (!got.running && !got.more) this.done = true;
        if (typeof got.size !== 'number') {
          // V-6 上以前的核心：不知道从哪儿接，只露这一次
          this.done = true;
          return;
        }
        this.size = got.size;
      }
    } catch (err) {
      if (run !== this.run) return;
      this.done = true;
      const t = this.t;
      const e = /** @type {any} */ (err);
      const known = e?.reason ? t(`reasons.${e.reason}`) : null;
      this.out.textContent = e?.code === NO_METHOD ? t('preview.no_api')
        : known && known !== `reasons.${e.reason}` ? known : e?.message ?? String(err);
    }
  }

  /** 第一次（最后几行）：一共几行照核心数的。 @param {{output: string, lines?: number}} got */
  reset(got) {
    this.tail.first(got.output ?? '', got.lines);
    this.draw();
  }

  /** 接上新的一段。 @param {{output: string}} got */
  append(got) {
    if (!got.output) return;
    this.tail.add(got.output);
    this.draw();
  }

  draw() {
    const t = this.t;
    const pre = this.out;
    const stick = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
    const { text, total, shown } = this.tail;
    pre.textContent = text || t('preview.empty');
    this.head.hidden = total <= shown;
    this.head.textContent = total > shown ? t('preview.tail', { total, shown }) : '';
    if (stick) pre.scrollTop = pre.scrollHeight;
  }
}
