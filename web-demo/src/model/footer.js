// @ts-check
//! 输入框下面那一行要写的字（蓝图 `web.md`「框下面那一行的数」，照 TUI 演示的 `ui/footer.rs`、`core/push.rs`）：
//! 左边权限级别和模型，右边用量那一格（环 · 累计(命中率) · 花费，卡住的变红，2026-11-02）；还是 0 的不写；放不下时先收花费。

import { res, t } from '../util/res.js';
import { short, percentTenths, hitRate } from './format.js';
import { levelOf } from './entries.js';
import { compactingOf } from './view-state.js';
import { costText } from '../lib/cost.js';

const input = (u) => u.uncached + u.cache_read + u.cache_write;

/**
 * @typedef {'failed'|'over'|'compacting'|null} Stuck
 * @typedef {{ratio: number|null, used: number, window: number|null, stuck: Stuck, cap?: number|null}} Ring 用量那一格的环：上下文占窗口多少（`null` 是不知道窗口）、卡住没有、
 *   这个会话设了的上下文上限（`cap`，W-1129；窗口已经照它压小了）
 * @typedef {{key: string, text: string}} Part
 */

/**
 * 照会话状态写（蓝图 `web.md`「照条目画」第 3 条、「框下面那一行的数」的「用量那一格」，2026-11-02）：级别照 `permission`，模型照 `model`；
 * 右边一格：累计 token 和花费都连子代理（`usage_tree`，旧核心没有的照 `usage`；同终端的 Σ），花费照 `converted`（核心 UC-1，一笔都算不出
 * 的不写）；环照 `context.used ÷ window`（窗口没有的照订阅回应的限额）；卡住的（`stuckOf`）写是哪一种和「用了多少 / 线」。还是 0 的不写。
 * 设了会话上限的（核心 CTX-1，设计 68：`context.context`，订阅回应的限额 `context`）这一行不写（2026-11-11 项目主人），只记在环上（`ring.cap`，悬停、明细里写）。
 * @param {any} status @param {{window?: number, compaction_line?: number, context?: number}} [limits] 订阅回应里的限额 @param {any[]} [entries] 视图的条目（认压缩失败）
 * @returns {{left: {level: string, label: string, model: string|null, endpoint: string|null}, right: Part[], ring: Ring|null}}
 */
export function statusFooter(status, limits = {}, entries = []) {
  const level = status?.permission ? levelOf(status.permission) : 'full';
  const used = status?.context?.used ?? 0;
  const window = status?.context?.window ?? limits.window ?? null;
  const line = status?.context?.compaction_line ?? limits.compaction_line ?? null;
  const cap = capOf(status, limits);
  const stuck = stuckOf(status, entries, window, line);
  const right = [];
  const usage = status?.usage_tree ?? status?.usage;
  const all = usage?.usage;
  // 会话上限不在这一行写（2026-11-11 项目主人：「footer 都去掉会话上限 xk 的显示」）：悬停环、上下文明细里有
  if (stuck === 'compacting') right.push({ key: 'stuck', text: t('usage_cell.compacting') });
  else if (stuck) {
    right.push({ key: 'stuck', text: t(`usage_cell.${stuck}`) });
    right.push({ key: 'nums', text: `${short(used)}/${short((stuck === 'failed' ? line : window) ?? 0)}` });
  } else if (all && input(all) + all.output > 0) {
    // 累计后面紧跟缓存命中率「128.4k(C99%)」（2026-11-10 项目主人；同收尾行的算法：命中 ÷ 输入），一次输入都没记下的不写
    const hit = input(all) > 0 ? t('usage_cell.hit_part', { percent: hitRate(all.cache_read, input(all)) }) : '';
    right.push({ key: 'total', text: `${short(input(all) + all.output)}${hit}` });
  }
  // 花费接在后面（2026-10-26 项目主人）：窄的时候它先让出来
  const cost = !stuck && all && input(all) + all.output > 0 ? costText(usage) : null;
  if (cost) right.push({ key: 'cost', text: cost });
  const ring = used > 0 || right.length ? { ratio: window ? used / window : null, used, window, stuck, cap } : null;
  return { left: { level, label: levelLabel(level), model: status?.model?.model ?? null, endpoint: status?.model?.endpoint ?? null }, right, ring };
}

/**
 * 会话卡住了没有（蓝图「用量那一格」）：正在压的 `compacting`（同压缩的进度那一行，`compactingOf`）；条目里最近一次压缩那一项失败了、或自动压缩暂停了（后来没压好、清空过），
 * 用量也到了压缩线（不知道线的也算）的是 `failed`；上下文超出窗口的是 `over`；别的 `null`。
 * @param {any} status @param {any[]} entries @param {number|null} window @param {number|null} line @returns {Stuck}
 */
export function stuckOf(status, entries, window, line) {
  if (compactingOf(entries, status)) return 'compacting';
  const used = status?.context?.used ?? 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.what === 'cleared' || (e?.what === 'compaction' && e.state !== 'failed')) break;
    if (e?.what === 'paused' || (e?.what === 'compaction' && e.state === 'failed')) {
      if (line == null || used >= line) return 'failed';
      break;
    }
  }
  return window && used > window ? 'over' : null;
}

/** 这个会话设的上下文上限（`context.context`，旧核心、没设的是 `null`；订阅回应的限额里也有）。 @param {any} status @param {any} limits @returns {number|null} */
export function capOf(status, limits = {}) {
  const cap = status?.context?.context ?? limits?.context;
  return typeof cap === 'number' && cap > 0 ? cap : null;
}

/** 环悬停写的：「上下文 41.2k / 1M（4.1%）」，设了会话上限的接「，会话上限」；没窗口的只写用了多少 @param {Ring} ring */
export const ringTip = (ring) => (ring.window ? t(ring.cap ? 'usage_cell.tip_cap' : 'usage_cell.tip', { used: short(ring.used), window: short(ring.window), percent: percentTenths(ring.used, ring.window) }) : t('usage_cell.tip_bare', { used: short(ring.used) }));

/**
 * 还没开的新会话：环照核心的预览画（`session.context` 不写 `session`，蓝图「上下文明细、累计按用途」第 1 条），没有累计、花费。
 * @param {{used?: number, window?: number}|null} preview @returns {Ring|null}
 */
export function previewRing(preview) {
  const used = preview?.used ?? 0;
  return used > 0 ? { ratio: preview?.window ? used / preview.window : null, used, window: preview?.window ?? null, stuck: null, cap: null } : null;
}

/**
 * 一句打头是权限级别记号的字（框下面那一格 `⏵⏵ 开放权限`、收尾那一行 `⏵⏵ 16:06 · …`）拆成「画哪个图标、后面的字」：记号是 `layout.json`
 * 的 `level_icons`，图标是 `level_svg` 里同一级的名字。画的时候用自带的图标，不靠字体（2026-11-11 项目主人：手机上没有这两个字的字体，
 * 变成方块和 emoji）；复制出去的照旧是原来那句字。打头不是记号的、那一级没写图标的 `icon` 是 `null`、字原样。
 * @param {string} text @returns {{icon: string|null, text: string}}
 */
export function levelParts(text) {
  const marks = res.layout.level_icons ?? {};
  const svgs = res.layout.level_svg ?? {};
  for (const [level, mark] of Object.entries(marks)) {
    const glyph = String(mark).trimEnd();
    if (glyph && svgs[level] && text.startsWith(glyph)) return { icon: svgs[level], text: text.slice(glyph.length).replace(/^ /, '') };
  }
  return { icon: null, text };
}

/** 左边的级别：图标加名字，`⏵⏵ 开放权限`（图标照 TUI 的 `layout.json`）。 */
export const levelLabel = (level) => `${res.layout.level_icons[level]}${res.text.levels[level]}`;

/**
 * 点一下换到下一级：照 `layout.json` 的 `level_cycle`，开放权限 ⇄ 只读（照 TUI 的 Tab；LV-3 起没有工作区，切回开放权限不问）。
 * @param {string} level
 */
export function nextLevel(level) {
  const cycle = res.layout.level_cycle;
  return cycle[(cycle.indexOf(level) + 1) % cycle.length];
}

/**
 * 换到这一级发给核心的参数（`session.set_permission_level`，蓝图 `protocol.md`）：只读只开只读开关；开放权限写 `full` 并关掉只读
 * （LV-3：不再发 `workspace`）。
 * @param {string} level 换到的那一级
 */
export function levelParams(level) {
  return level === 'read_only' ? { read_only: true } : { level: 'full', read_only: false };
}

/** 丢的先后：先花费（2026-10-26 项目主人：窄的时候金额先让出来），卡住的先丢「用了多少 / 线」，再累计，那几个字留到最后。 */
const DROP = ['cost', 'nums', 'total', 'stuck'];

/**
 * 右边放得下的几格：照 `DROP` 的先后一格格丢，直到 `measure` 量出来不超过 `room`。
 * @param {Part[]} parts
 * @param {number} room 放得下多宽
 * @param {(parts: Part[]) => number} measure 量这几样连起来多宽
 */
export function fit(parts, room, measure) {
  let kept = parts;
  for (const key of DROP) {
    if (kept.length === 0 || measure(kept) <= room) return kept;
    kept = kept.filter((p) => p.key !== key);
  }
  return [];
}
