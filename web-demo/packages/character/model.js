// @ts-check
//! 交给吉祥物的状态（蓝图 `web.md`「选吉祥物」第 3 条）：照 `view.changed` 那一份统一算，角色不自己猜。纯的。

/** @typedef {'idle'|'waiting'|'compacting'|'thinking'|'writing'|'tool'|'subagent'} Now */

/**
 * 这一刻在做什么：这一轮没在跑的 `idle`；等人确认、回答的 `waiting`；在压缩的 `compacting`；照 `doing`：`thinking`、`writing`、
 * `tool`（`doing` 指的那一条是派子代理的工具的算 `subagent`）；重试、别的照 `thinking`。
 * @param {any} v `view.changed` 那一份 @returns {Now}
 */
export function nowOf(v) {
  if (!v?.running) return 'idle';
  const st = v.status ?? {};
  if (Array.isArray(st.waiting) && st.waiting.length) return 'waiting';
  if (v.compacting || st.doing?.what === 'compacting') return 'compacting';
  const what = st.doing?.what;
  if (what === 'writing') return 'writing';
  if (what === 'tool') {
    const e = (v.entries ?? []).find((/** @type {any} */ x) => x.id === st.doing.entry);
    return e?.name === 'subagent' ? 'subagent' : 'tool';
  }
  return 'thinking';
}

/**
 * 一轮刚收尾：最后一条收尾（`end`）的 `reason`：`completed` → `done`、`error` → `error`、`interrupted` → `interrupted`，别的（`max_steps` 这些）照 `done`；
 * 没有收尾那一条的是 `null`。
 * @param {any[]} entries @returns {'done'|'error'|'interrupted'|null}
 */
export function endedOf(entries) {
  const e = [...(entries ?? [])].reverse().find((x) => x?.kind === 'end');
  if (!e) return null;
  return e.reason === 'error' ? 'error' : e.reason === 'interrupted' ? 'interrupted' : 'done';
}

/**
 * 站的那条边：弹出的列表露着的照最上面那一个，不然照输入框；各自加上主题挪的 `dy`、`dx`（`combine` 过的落脚点）。都没有的是 `null`。
 * @param {{top: number, left: number, right: number}|null} box 输入框 @param {{top: number, left: number, right: number}[]} floats 露着的弹出列表
 * @param {{composer?: {dx?: number, dy?: number}, floats?: {dx?: number, dy?: number}}} off
 * @returns {{top: number, left: number, right: number}|null}
 */
export function surfaceOf(box, floats, off) {
  const top = floats.length ? floats.reduce((a, b) => (b.top < a.top ? b : a)) : null;
  const r = top ?? box;
  if (!r) return null;
  const o = (top ? off.floats : off.composer) ?? {};
  return { top: Math.round(r.top + (o.dy ?? 0)), left: Math.round(r.left + (o.dx ?? 0)), right: Math.round(r.right + (o.dx ?? 0)) };
}
