// @ts-check
//! 包的「启用」（核心 UX-1、UX-1补，协议参考 `config.md`）：每个包都有一项 `packages.<编号>.enabled`，来源是 `package`（不在哪一层配置里），
//! 就是 `package.enable`、`package.disable` 那个开关。软件包页、信息页顶上已经有这个开关，网页照下面几条对待这一项：
//! 信息页不再画一行「启用」（`ownSettings`），名字后面不写「默认 / 已改」（`switchOrigin`），开关换了跟着改读到的值（`followEnabled`），
//! 软件的后台页不给（`frame.js`）。

/** 包 `id` 的「启用」那一项的键 @param {string} id */
export const enabledKey = (id) => `packages.${id}.enabled`;

/** 这一项是不是某个包的「启用」 @param {{key?: string}|null|undefined} item */
export const isEnabledItem = (item) => /^packages\.[^.]+\.enabled$/.test(String(item?.key ?? ''));

/** 读到的值来源是包的开关（`origin.layer` 是 `package`）：不写「默认 / 已改」 @param {any} entry `config.get` 的一项 */
export const switchOrigin = (entry) => entry?.origin?.layer === 'package';

/**
 * 包的开关换了（`package.enable`、`package.disable` 的回应、推来的 `package.changed`、扩展的 `on`）：读到的 `config.get` 里那一项跟着换，
 * 设置页搜出来的那一行、别处画的不再写着旧的。配置清单里的一项和 `got.items` 是同一个对象，改一处两边都是新的。交回换没换。
 * @param {any} got `config.get` 的回应 @param {string} id @param {unknown} on
 */
export function followEnabled(got, id, on) {
  const entry = got?.items?.[enabledKey(id)];
  if (!entry || typeof on !== 'boolean' || entry.value === on) return false;
  entry.value = on;
  if ('effective' in entry) entry.effective = on;
  return true;
}

/**
 * 信息页上包 `id` 自己的设置项：照 `owner` 认是不是它的，去掉它的「启用」（顶上那块已经有开关）。
 * @template {{key: string}} T
 * @param {T[]} items @param {string} id @param {(item: T) => string|null} owner
 * @returns {T[]}
 */
export function ownSettings(items, id, owner) {
  return items.filter((item) => owner(item) === id && item.key !== enabledKey(id));
}
