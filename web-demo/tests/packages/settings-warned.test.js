// @ts-check
//! 设置页存成了、核心又接了警告的（`packages/settings/warned.js`，核心 CK-1）：`config.set` 改的默认人格、默认预设指着现在没有的，
//! 照收，回应带 `problems`；网页记在那一项上，那一行下面写。底料照核心 `default_names.rs` 断言的回应剪的。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savedWarnings } from '../../packages/settings/warned.js';

const gone = {
  keys: { 'preset.default': { value: 'gone' } },
  problems: [{ code: 'unknown_preset', key: 'preset.default', level: 'warning', message: "preset.default names preset gone, which doesn't exist yet; it works once the preset is created." }],
};

test('照收了又接了警告的：记在那一项上，照黄字写；没带 problems 的回应什么都不记', () => {
  const warned = savedWarnings(null, [{ key: 'preset.default' }], gone);
  assert.deepEqual([...warned], [['preset.default', [{ level: 'warn', message: gone.problems[0].message }]]]);
  assert.equal(savedWarnings(null, [{ key: 'preset.default' }], { keys: {} }).size, 0);
  assert.equal(savedWarnings(null, [{ key: 'preset.default' }], null).size, 0, '旧核心没有这一格');
});

test('同一项再存一次照新的回应：没警告了就拿掉；别的项记着的照旧；不改原来那一份', () => {
  const before = savedWarnings(null, [{ key: 'preset.default' }], gone);
  const other = savedWarnings(before, [{ key: 'persona.default' }], { problems: [{ key: 'persona.default', level: 'warning', message: 'ghost' }] });
  assert.deepEqual([...other.keys()], ['preset.default', 'persona.default']);
  const fixed = savedWarnings(other, [{ key: 'preset.default' }], { keys: { 'preset.default': { value: 'full' } } });
  assert.deepEqual([...fixed.keys()], ['persona.default']);
  assert.equal(before.size, 1, '原来那一份没动');
});

test('一次改几项：照问题的键落到那一项（列表里的一格也算那一项）；对不上的算在头一项；没有字的不记', () => {
  const warned = savedWarnings(null, [{ key: 'terminal.persona' }, { key: 'kb.read' }], {
    problems: [
      { key: 'kb.read[1]', level: 'warning', message: 'no such knowledge' },
      { key: 'elsewhere', level: 'warning', message: 'stray' },
      { key: 'terminal.persona', level: 'warning', message: '' },
    ],
  });
  assert.deepEqual(Object.fromEntries([...warned].map(([k, v]) => [k, v.map((p) => p.message)])), { 'kb.read': ['no such knowledge'], 'terminal.persona': ['stray'] });
});
