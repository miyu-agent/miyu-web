// @ts-check
//! 桌面端启动时的等待页 `miyu-webui/loading.html`（蓝图 `web.md`「第一次引导」第 2a 条）：照 `tools/loading.mjs` 生成，和欢迎页的剪影源文件对得上；
//! 自带一切（不引文件、不连网）、100 KB 以内、占位只出现一次、脚本读得成。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { build, OUTPUT } from '../../tools/loading.mjs';

const html = readFileSync(OUTPUT, 'utf8');

test('等待页和剪影的源文件对得上（改了 glyphs.js、glyph-mask.js 要 node tools/loading.mjs 重出）', () => {
  assert.equal(html, build());
});

test('等待页自带一切：不引文件、不连网，100 KB 以内，占位只出现一次，脚本读得成', () => {
  assert.ok(Buffer.byteLength(html) < 100 * 1024, `${Buffer.byteLength(html)} 字节`);
  assert.doesNotMatch(html, /\b(src|href)=|@import|url\(|https?:\/\//);
  assert.doesNotMatch(html, /^\s*(import|export)\b/m);
  assert.equal(html.split('{{starting}}').length - 1, 1);
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? '';
  assert.ok(script.includes('glyphArt'), '剪影在里面');
  assert.doesNotThrow(() => new Script(script));
});
