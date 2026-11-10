// @ts-check
//! 软件包设置分卡片（`packages/settings/package-sections.js`，W-1141，核心 SG-1；2026-11-10 项目主人：「这软件包设置页，怎么是纯平铺，而且选择 mimo 也会
//! 出现 minimax 的配置项目」「可以看看 im web 的会话卡片的设计」）：核心给包的项 `section`、包那一组 `sections`，一组一张卡，条件不满足、
//! 一项不剩的不画；旧核心照原来平铺。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPages } from '../../packages/settings/model.js';
import { cardsOf, sectionsOf, shown, valueLookup } from '../../packages/settings/package-sections.js';

/** 语音合成包：引擎选 minimax、mimo，两家各一组，再一项没分组的 */
const SECTIONS = [
  { id: 'minimax', name: 'MiniMax', shown_when: { key: 'say.engine', is: ['minimax'] } },
  { id: 'mimo', name: 'MiMo', shown_when: { key: 'say.engine', is: ['mimo'] } },
  { id: 'cache', name: '缓存' },
];
const item = (key, section, extra = {}) => ({ key, type: 'string', group: 'say', page: 'packages', package: 'say', name: key, ...(section ? { section } : {}), ...extra });
const schema = (sections) => ({
  pages: [{ id: 'packages', name: '软件包' }],
  groups: [{ id: 'say', name: '语音合成', page: 'packages', ...(sections ? { sections } : {}) }],
  items: [
    item('say.engine', null, { type: 'option', default: 'minimax', options: [{ value: 'minimax', name: 'MiniMax' }, { value: 'mimo', name: 'MiMo' }] }),
    item('say.minimax.voice', 'minimax'),
    item('say.minimax.speed', 'minimax'),
    item('say.mimo.voice', 'mimo'),
    item('say.cache.dir', 'nope'),
  ],
});

test('一组一张卡：没分组的（含写了不认识的组）排最前、没有组名；条件照现在的值，没写的照默认；一项不剩的组不画', () => {
  const pages = buildPages(schema(SECTIONS), { items: {} });
  const group = pages[0].groups[0];
  const cards = cardsOf(group.items, sectionsOf(group), valueLookup(pages));
  assert.deepEqual(cards?.map((c) => [c.name, c.items.map((i) => i.key)]), [
    [null, ['say.engine', 'say.cache.dir']],
    ['MiniMax', ['say.minimax.voice', 'say.minimax.speed']],
  ], '默认 minimax：mimo 那张不画，缓存那组没有项也不画');
  // 换成 mimo：minimax 那张收起、mimo 那张出来；值照旧在
  const picked = buildPages(schema(SECTIONS), { items: { 'say.engine': { value: 'mimo', layers: [{ origin: { layer: 'system' } }] } } });
  const g2 = picked[0].groups[0];
  assert.deepEqual(cardsOf(g2.items, sectionsOf(g2), valueLookup(picked))?.map((c) => c.name), [null, 'MiMo']);
});

test('旧核心不带 sections：交回 null，照原来平铺；读不懂的分组不认', () => {
  const pages = buildPages(schema(null), { items: {} });
  const group = pages[0].groups[0];
  assert.equal(group.sections, undefined);
  assert.equal(cardsOf(group.items, sectionsOf(group), valueLookup(pages)), null);
  assert.deepEqual(sectionsOf({ sections: [{ id: '' }, { name: 'x' }, { id: 'a', name: '甲' }, { id: 'b', shown_when: { key: 'k', is: 'x' } }] }),
    [{ id: 'a', name: '甲' }, { id: 'b', name: 'b' }], '缺 id 的不认；没名字的照编号写；shown_when 的 is 不是数组的当没写');
});

test('条件：选项的值在 is 里才画；找不到那一项的当满足，不把能改的藏了', () => {
  const look = (/** @type {Record<string, any>} */ values) => (/** @type {string} */ key) => (key in values ? { found: true, value: values[key] } : { found: false, value: undefined });
  assert.equal(shown({ key: 'a', is: ['x', 'y'] }, look({ a: 'y' })), true);
  assert.equal(shown({ key: 'a', is: ['x'] }, look({ a: 'z' })), false);
  assert.equal(shown({ key: 'gone', is: ['x'] }, look({})), true);
  assert.equal(shown(undefined, look({})), true);
});
