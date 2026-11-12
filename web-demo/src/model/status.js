// @ts-check
//! `/status` 会话状态要写的几行（蓝图 `web.md`「会话状态 `/status`」，照终端 `tui.md` 同名一节，W-1152）：纯逻辑，不碰页面。
//! 数都是页面已经有的：会话状态（`view.status`）、订阅回应的限额、会话表那一项，不另外问核心。没有的那一行不写。

import { short, hitRate, percentTenths } from '../lib/format.js';
import { costText } from '../lib/cost.js';

/**
 * @typedef {{id: string, title: string|null, persona: string|null, preset: string|null, level: string|null, cwd: string|null,
 *   effort: string|null, status: any, limits?: {window?: number, compaction_line?: number, context?: number}}} Facts
 *   `persona`、`preset`、`level`、`effort` 是已经换成给人看的名字的
 * @typedef {{key: string, name: string, value: string}} Row
 */

const input = (/** @type {any} */ u) => (u?.uncached ?? 0) + (u?.cache_read ?? 0) + (u?.cache_write ?? 0);

/**
 * 一行一样：会话 ID、标题、人格、预设、权限级别、工作区、模型（端点、思考强度、窗口）、上下文（设了会话上限的接着写）、
 * 压缩（几次、压缩线）、累计（输入、输出，连子代理）、缓存（命中率、断了几次）、花费。
 * @param {Facts} f @param {(key: string, fields?: Record<string, string|number>) => string} t 字表（`status_box.*`）
 * @returns {Row[]}
 */
export function statusRows(f, t) {
  const sep = t('sep');
  const s = f.status ?? {};
  const limits = f.limits ?? {};
  /** @type {Row[]} */
  const rows = [];
  const add = (/** @type {string} */ key, /** @type {string|null|undefined} */ value) => { if (value) rows.push({ key, name: t(`keys.${key}`), value }); };
  add('id', f.id);
  add('title', f.title);
  add('persona', f.persona);
  add('preset', f.preset);
  add('level', f.level);
  add('cwd', f.cwd);
  const window = s.context?.window ?? limits.window ?? null;
  if (s.model?.model) {
    add('model', [
      s.model.endpoint ? `${s.model.endpoint}/${s.model.model}` : s.model.model,
      f.effort ? t('effort', { effort: f.effort }) : null,
      window ? t('window', { window: short(window) }) : null,
    ].filter(Boolean).join(sep));
  }
  const used = s.context?.used ?? 0;
  const cap = s.context?.context ?? limits.context ?? null;
  if (used > 0) {
    add('context', [
      window ? t('context', { used: short(used), window: short(window), percent: percentTenths(used, window) }) : short(used),
      cap ? t('cap', { n: short(cap) }) : null,
    ].filter(Boolean).join(sep));
  }
  const usage = s.usage_tree ?? s.usage ?? null;
  const line = s.context?.compaction_line ?? limits.compaction_line ?? null;
  const own = s.usage ?? null;
  if (own || line) {
    add('compaction', [
      own ? t('times', { n: own.compactions ?? 0 }) : null,
      line ? t('line', { line: short(line) }) : null,
      // 这个会话钉了压缩线的（核心 CT-1：`view.status` 顶层的 `compaction_line`，百分数）接着写（W-1163）
      Number.isInteger(s.compaction_line) ? t('line_pinned', { n: s.compaction_line }) : null,
    ].filter(Boolean).join(sep));
  }
  const all = usage?.usage ?? null;
  if (all && input(all) + (all.output ?? 0) > 0) {
    add('usage', t('usage', { total: short(input(all) + (all.output ?? 0)), input: short(input(all)), output: short(all.output ?? 0) }));
    if (input(all) > 0) {
      add('cache', [
        t('hit', { percent: hitRate(all.cache_read ?? 0, input(all)) }),
        own ? t('breaks', { n: own.cache_breaks ?? 0 }) : null,
      ].filter(Boolean).join(sep));
    }
    add('cost', costText(usage));
  }
  return rows;
}
