// @ts-check
//! 图片卡片的大小（蓝图 `web.md`「图片」第 4 条）：表情包长边缩到 `layout.json` 的 `sticker`，小的不放大。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { stickerSize } from '../src/ui/media.js';

loadRes();

test('表情包：长边缩到 160，宽高比不变；比它小的照原样；竖的照高算', () => {
  assert.deepEqual(stickerSize(300, 240, 160), [160, 128]);
  assert.deepEqual(stickerSize(240, 480, 160), [80, 160]);
  assert.deepEqual(stickerSize(96, 64, 160), [96, 64]);
  assert.deepEqual(stickerSize(4000, 1, 160), [160, 1]);
});
