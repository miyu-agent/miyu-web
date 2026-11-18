// @ts-check
//! 推演人生整个移除（2026-11-18 项目主人定，核心 RM-1，W-1216）：网页不再调 `life.*`、不认 `/life`、没有软件包 `life`，
//! 只有它在用的挂载位 `sidebar.nav`、`stage.top` 跟着拿掉；预设不再照 `hidden` 筛。普通循环的「◷ 循环 · 继续」留着。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** web-demo 下的源码（不含第三方的 vendor、测试自己） @param {string} dir @returns {string[]} */
function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'vendor' || name === 'tests' ? [] : sources(path);
    return /\.(js|css|json|html)$/.test(name) && name !== 'lucide-all.json' ? [path] : [];
  });
}

test('源码里没有推演人生：不调 life.*、不认 /life、不画 <life-round>、没有 sidebar.nav、stage.top', () => {
  const bad = /['"`]life\.(status|start|pause|resume|kill|new|list|seen)['"`]|life\.ended|['"`]\/life\b|life-round|life-doing|end_life|note_change|base-life|['"`](sidebar\.nav|stage\.top)['"`]|推演人生/;
  const hits = sources(root).filter((path) => bad.test(readFileSync(path, 'utf8'))).map((path) => path.slice(root.length));
  assert.deepEqual(hits, []);
});

test('没有软件包 life；出厂的包表里也没有它', () => {
  assert.equal(existsSync(join(root, 'packages/life')), false);
  const distro = JSON.parse(readFileSync(join(root, 'distro.json'), 'utf8'));
  assert.ok(!JSON.stringify(distro).includes('"life"'));
});

test('续轮那一行只有循环一种：三种语言的 notes.round 只剩 loop', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const text = JSON.parse(readFileSync(join(root, `resources/text/${lang}.json`), 'utf8'));
    assert.deepEqual(Object.keys(text.notes.round), ['loop'], lang);
  }
});
