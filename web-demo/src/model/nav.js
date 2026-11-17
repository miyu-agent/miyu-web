// @ts-check
//! 左栏头上交互区里软件包挂的入口（挂载位 `sidebar.nav`、`sidebar.more`；蓝图 `web.md`「左栏」第 1 条）：挂的是数据，这里定画哪几行、
//! 哪一行照选中的亮着（正在看的会话归它：`owns`）、哪一行带记号（`mark`）。纯的。

/**
 * 软件包挂的一个入口：名字、图标（认不得的画 `puzzle`）、点了做什么；`owns` 说正在看的会话归不归它（会话表那一项 → 是不是），归它的那一行照选中的亮着；
 * `mark` 交回要不要带一个记号（有没看过的东西），`onChange` 登记要重画（记号变了、图标读到了）时叫谁（交回怎么不叫）。
 * @typedef {{id: string, label: string, icon?: string, run: () => void, order?: number, owns?: (entry: any) => boolean,
 *   mark?: () => boolean, onChange?: (fn: () => void) => () => void}} NavEntry
 */

/** 画得出来的：有名字、点了有事做的 @param {any[]} entries @returns {NavEntry[]} */
export const navEntries = (entries) => entries.filter((x) => typeof x?.label === 'string' && typeof x?.run === 'function');

/**
 * 每一行画成什么：编号、名字、图标，这一刻亮不亮（正在看的会话归它）、带不带记号。挂的人的 `owns`、`mark` 出错的当不归它、不带。
 * @param {NavEntry[]} entries @param {any} here 正在看的会话的会话表那一项（没有的 `null`）
 * @returns {{id: string, label: string, icon: string|null, here: boolean, mark: boolean}[]}
 */
export function navRows(entries, here) {
  const safe = (/** @type {() => boolean} */ f) => { try { return f() === true; } catch { return false; } };
  return navEntries(entries).map((x) => ({
    id: x.id, label: x.label, icon: typeof x.icon === 'string' ? x.icon : null,
    here: !!here && typeof x.owns === 'function' && safe(() => /** @type {any} */ (x.owns)(here)),
    mark: typeof x.mark === 'function' && safe(/** @type {any} */ (x.mark)),
  }));
}
