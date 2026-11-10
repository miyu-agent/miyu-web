// @ts-check
//! 一个包的设置项分成一张张卡片（W-1141，2026-11-10 项目主人：「这软件包设置页，怎么是纯平铺，而且选择 mimo 也会出现 minimax 的配置项目」
//! 「可以看看 im web 的会话卡片的设计」）。核心在 `config.schema` 里给包的每一项一格 `section`（组编号，没分组的是空的），包那一组多一列
//! `sections`：`[{id, name, shown_when?: {key, is: [...]}}]`（核心 PS 线，`key` 是全名、`is` 是数组）。这里只算分组、条件，画在
//! `core-packages.js`：没分组的排最前、没有组名；分了组的照 `sections` 的先后一组一张卡；`shown_when` 不满足的卡不画（值照旧留着，核心照旧
//! 读、照旧校验）；一格不剩的卡不画。旧核心不带 `sections` 的交回空的，照原来一组一块平铺。

/** @typedef {{key: string, is: any[]}} ShownWhen */
/** @typedef {{id: string, name: string, shown_when?: ShownWhen}} Section */

/**
 * 包那一组的 `sections`：组上写的（`group.sections`），没有的再看 `config.schema` 顶上照组编号的那一份（`schema.sections[组]`）；名字照语言挑好。
 * 读不懂的一项不认。
 * @param {any} group 合好的组（`buildPages` 带上了它的 `sections`） @param {string} [lang] 这个连接的语言（名字写成三语对象时挑）
 * @returns {Section[]}
 */
export function sectionsOf(group, lang = 'zh') {
  const raw = Array.isArray(group?.sections) ? group.sections : [];
  return raw.flatMap((/** @type {any} */ s) => {
    if (!s || typeof s.id !== 'string' || !s.id) return [];
    const name = typeof s.name === 'string' ? s.name : s.name && typeof s.name === 'object' ? (s.name[lang] ?? s.name.zh ?? s.name.en ?? Object.values(s.name)[0] ?? s.id) : s.id;
    const when = s.shown_when;
    const shown = when && typeof when.key === 'string' && Array.isArray(when.is) ? { key: when.key, is: when.is } : undefined;
    return [{ id: s.id, name: String(name), ...(shown ? { shown_when: shown } : {}) }];
  });
}

/**
 * 条件满不满足：那一项现在的值（写了的照写的，没写的照默认）在 `is` 里。找不到那一项的当满足（宁可多画，不把能改的藏了）。
 * @param {ShownWhen|undefined} when @param {(key: string) => {found: boolean, value: any}} valueOf
 */
export function shown(when, valueOf) {
  if (!when) return true;
  const { found, value } = valueOf(when.key);
  if (!found) return true;
  return when.is.some((v) => v === value || (v != null && value != null && String(v) === String(value)));
}

/**
 * 分好的卡片：没分组的（`section` 空的、写了 `sections` 里没有的组）一张、排最前、`name` 是 `null`；分了组的照 `sections` 的先后一张张；
 * 条件不满足的、一项都没有的不交。`sections` 是空的（旧核心）交回 `null`：照原来平铺。
 * @template T
 * @param {T[]} items 这个包这一组里要画的项（带 `section`） @param {Section[]} sections
 * @param {(key: string) => {found: boolean, value: any}} valueOf
 * @returns {{id: string|null, name: string|null, items: T[]}[]|null}
 */
export function cardsOf(items, sections, valueOf) {
  if (!sections.length) return null;
  const known = new Set(sections.map((s) => s.id));
  const sectionOf = (/** @type {any} */ item) => (typeof item?.section === 'string' && known.has(item.section) ? item.section : null);
  const loose = items.filter((i) => sectionOf(i) === null);
  const cards = [{ id: null, name: null, items: loose }];
  for (const s of sections) {
    if (!shown(s.shown_when, valueOf)) continue;
    cards.push({ id: s.id, name: s.name, items: items.filter((i) => sectionOf(i) === s.id) });
  }
  return cards.filter((c) => c.items.length);
}

/**
 * 照全名找一项现在的值：配置页合好的各页各组里找，写了的照写的，没写的照默认。
 * @param {any[]} pages `dialog.pages` @returns {(key: string) => {found: boolean, value: any}}
 */
export function valueLookup(pages) {
  /** @type {Map<string, any>} */
  const items = new Map();
  for (const p of pages ?? []) for (const g of p.groups ?? []) for (const i of g.items ?? []) items.set(i.key, i);
  return (key) => {
    const item = items.get(key);
    if (!item) return { found: false, value: undefined };
    const written = item.entry && 'value' in item.entry ? item.entry.value : undefined;
    return { found: true, value: written ?? item.fact?.value ?? item.default };
  };
}
