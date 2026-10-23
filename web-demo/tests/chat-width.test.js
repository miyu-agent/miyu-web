// @ts-check
//! 对话那一列拖宽（蓝图「样子」三列那一条下面）：照正中对称、夹在最窄和对话区的宽之间
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { widthAt } from '../src/ui/chat-width.js';

test('拖到哪：离正中多远乘二，最窄 560、最宽到对话区', () => {
  assert.equal(widthAt(1100, 600, 1200), 1000);
  assert.equal(widthAt(100, 600, 1200), 1000, '左边拖一样');
  assert.equal(widthAt(650, 600, 1200), 560, '最窄 560');
  assert.equal(widthAt(2000, 600, 1200), 1200, '最宽到对话区');
});
