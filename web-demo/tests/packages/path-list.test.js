// @ts-check
//! 目录表（技能页「读取其他目录的 Skills」，`packages/settings/path-list-model.js`）：一项配置的值是一串路径，默认值就是出厂的样子。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathRows, dropChange, canRestore, batchChange, findRows, restoreChange } from '../../packages/settings/path-list-model.js';

const KEY = 'skills.external.dirs';

test('表：照现在的值，没写的照默认，重了的不重复', () => {
  assert.deepEqual(pathRows({ key: KEY, entry: { value: ['/srv/a', '~/b', '/srv/a'] } }), ['/srv/a', '~/b']);
  assert.deepEqual(pathRows({ key: KEY, entry: null, default: ['~/.agents/skills'] }), ['~/.agents/skills']);
  assert.deepEqual(pathRows({ key: KEY, entry: null }), []);
});

test('删一行：整张交；一次加好几个：空行、已经在的跳过；搜索照路径筛、不分大小写', () => {
  const item = { key: KEY, entry: { value: ['/srv/Keys', '~/b'] } };
  assert.deepEqual(dropChange('~/b', item), { key: KEY, value: ['/srv/Keys'] });
  assert.deepEqual(batchChange('~/a\n\n  ~/c \n~/b\n~/a', item), {
    changes: [{ key: KEY, value: ['/srv/Keys', '~/b', '~/a', '~/c'] }],
    skipped: ['~/b', '~/a'],
  });
  assert.deepEqual(batchChange('~/b\n  \n', item), { changes: [], skipped: ['~/b'] });
  const rows = pathRows(item);
  assert.deepEqual(findRows(rows, 'keys'), ['/srv/Keys']);
  assert.equal(findRows(rows, '  ').length, rows.length);
});

test('重置：系统配置里写过的才能，交回去掉这一项', () => {
  const fresh = { key: KEY, default: ['~/.agents/skills'], entry: null };
  assert.equal(canRestore(fresh), false);
  assert.deepEqual(restoreChange(fresh), []);
  const written = { key: KEY, default: ['~/.agents/skills'], entry: { value: [], layers: [{ value: [], origin: { layer: 'system' } }] } };
  assert.equal(canRestore(written), true);
  assert.deepEqual(restoreChange(written), [{ key: KEY, unset: true }]);
});
