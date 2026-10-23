// @ts-check
//! 给人看的字（蓝图 `web.md`「时间线的数」第 5 条）：工具的显示名、对象是哪个参数、结果那一句的模板，和终端界面、`miyu ask`
//! 同一份。握手以后照界面语言问核心的 `human.get`（核心施工 W-1；原来由桥读资源目录经 `web.human` 给）。

/**
 * @typedef {{tools: Record<string, {name: string, subject?: string, icon?: string, block?: string}>, said: Record<string, string>,
 *   packages: Record<string, string>, icons: Record<string, string>}} Human
 *   `said` 的编号带位置（`core/…`、`software/<包>/…`），模板是原文，字段由页面换（`model/words.js` 的 `say`）；`packages` 是每件工具
 *   属于哪个包（核心 X-24 补，旧核心没有）；`icons` 是包的图标（`package.list` 的 `icon`，Lucide 的名字，没写的不在里面）
 */

/**
 * 问核心要这一种语言的字：只留页面用得上的 `tools`、`said`、`packages`，缺的格子当空的；包的图标另问 `package.list`，问不到的当没有。
 * 字问不到的照原样报出去，由开机那里决定怎么办。
 * @param {import('./connection.js').Connection} conn
 * @param {string} language 界面语言的代码（`zh`、`ja`）；核心那边哪个包没有这种语言的照英文
 * @param {boolean} [packages] 问不问 `package.list`（包的图标）：成员调不了（核心 Y-2下下上），不问
 * @returns {Promise<Human>}
 */
export async function loadHuman(conn, language, packages = true) {
  const [got, listed] = await Promise.all([
    conn.request('human.get', { language }),
    packages ? conn.request('package.list', {}).then((r) => r?.packages ?? [], () => []) : [],
  ]);
  return { tools: got?.tools ?? {}, said: got?.said ?? {}, packages: got?.packages ?? {}, icons: iconsOf(listed) };
}

/** 包的编号 → 它清单里写的图标（只留写了的）。 @param {any[]} listed `package.list` 的 `packages` @returns {Record<string, string>} */
export function iconsOf(listed) {
  const out = /** @type {Record<string, string>} */ ({});
  for (const p of Array.isArray(listed) ? listed : []) if (typeof p?.package === 'string' && typeof p.icon === 'string' && p.icon) out[p.package] = p.icon;
  return out;
}
