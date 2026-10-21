// @ts-check
//! 网页每个 JS 文件都过一遍语法检查（`node --check`）：不被测试导入的文件（设置页的 `dialog.js` 这类）写坏了，整个包起不来，别的测试照样绿
//! （2026-10-21 撞见：设置包里一个函数插进了类定义中间，齿轮都没了）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  if (name === 'node_modules' || name === 'vendor') return [];
  return statSync(p).isDirectory() ? walk(p) : name.endsWith('.js') ? [p] : [];
});

test('每个 JS 文件语法都对', async () => {
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'packages'))];
  assert.ok(files.length > 50);
  /** @type {string[]} */
  const bad = [];
  const check = (/** @type {string} */ f) => new Promise((done) => {
    execFile(process.execPath, ['--check', f], (err, _out, stderr) => {
      if (err) bad.push(`${f}\n${String(stderr).split('\n').slice(0, 4).join('\n')}`);
      done(null);
    });
  });
  const queue = [...files];
  await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await check(/** @type {string} */ (queue.shift())); }));
  assert.deepEqual(bad, []);
});
