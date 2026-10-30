// @ts-check
//! 软件包用到的服务都写在清单的 `inject` 里（蓝图 `web-module.md`：没写的经 `ctx` 拿会抛错）。2026-10-30 皮肤包读 `ctx.host` 没写，换皮肤时
//! 抛在半路，`skin.changed` 没发出去、登录页记的皮肤也没记上（桌面端在调试口子里看到的警告）。这里照代码里出现的 `ctx.<服务>` 查一遍：
//! 服务的名字照所有清单 `inject` 里写过的（去掉 `~`、`?`），不认 `ctx` 自己带的几样。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../packages/', import.meta.url).pathname;
const ids = readdirSync(root).filter((id) => statSync(join(root, id)).isDirectory() && readdirSync(join(root, id)).includes('manifest.json'));
const manifests = new Map(ids.map((id) => [id, JSON.parse(readFileSync(join(root, id, 'manifest.json'), 'utf8'))]));
const plain = (/** @type {string} */ name) => name.replace(/[~?]+$/, '');
const services = new Set([...manifests.values()].flatMap((m) => (m.inject ?? []).map(plain)));

/** 一个包里的 .js（连子目录） @param {string} dir @returns {string[]} */
const sources = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return sources(path);
  return name.endsWith('.js') ? [path] : [];
});

test('包里经 ctx 用到的服务都写在 inject 里', () => {
  /** @type {string[]} */
  const missing = [];
  for (const [id, m] of manifests) {
    const declared = new Set((m.inject ?? []).map(plain));
    for (const file of sources(join(root, id))) {
      const code = readFileSync(file, 'utf8');
      for (const [, name] of code.matchAll(/\bctx\??\.([a-zA-Z_]\w*)/g)) {
        if (services.has(name) && !declared.has(name)) missing.push(`${id}：${file.slice(root.length)} 用了 ctx.${name}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
