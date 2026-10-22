// @ts-check
//! 包的信息页里「MCP 服务」那一组的一行（蓝图 `web.md`「设置页」第 13 条；核心 X-4、F-9 补）：名字、现在怎样（停下的红字、能展开看输出）；
//! 被个人设置里同名的替代了的写「被个人设置中的同名服务替代」，不写已停用（`covered`）。个人设置里写的服务 2026-10-20 起在「MCP」页
//! （`tool-pages.js`，第 20 条）。

import { h } from '../../src/lib/dom.js';
import { stateText } from './extensions.js';
import { loginState, loginText, loginButton, loginErrorNode } from './mcp-login.js';

/**
 * 一个服务一行（连展开的输出）。
 * @param {any} dialog @param {string} key 记着展开了哪个的键（包编号/服务名，个人设置里的 `~home/服务名`）
 * @param {any} s 服务那一格（X-4：`name`、`state`、`failures`、`retry_in`、`reason`、`stderr`；F-9 补的 `covered`）
 * @param {{on: boolean, action?: Node|null}} opts `on` 这个服务所在的包开着（个人设置里的总是开着）；`action` 右边的按钮
 */
export function serverRow(dialog, key, s, opts) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  dialog.mcpShowing ??= new Set();
  const showing = /** @type {Set<string>} */ (dialog.mcpShowing);
  // 要浏览器登录的（核心 X-42 上）不算停了：「需要登录」warn 色，右边一个「登录」
  const login = loginState(dialog, s, opts.on && s.state !== 'off');
  const stopped = opts.on && !s.covered && s.state === 'stopped' && !login.needs;
  const stderr = Array.isArray(s.stderr) ? s.stderr.join('\n') : s.stderr ?? '';
  const peek = stopped && stderr ? h('button.set-link', { type: 'button', onclick: () => { if (showing.has(key)) showing.delete(key); else showing.add(key); dialog.drawBody(); } },
    t(showing.has(key) ? 'ext.hide_output' : 'ext.show_output')) : null;
  const desc = s.covered ? t('pkg.mcp_covered') : login.needs ? loginText(t, login) : stateText(t, { ...s, on: opts.on && s.state !== 'off' });
  const action = login.needs ? loginButton(dialog, s.name, login, { small: true }) : opts.action ?? null;
  return [
    h('div.set-row', h('div.set-text', h('div.set-name', h('span', s.name)), h(`p.set-desc${stopped ? '.is-error' : login.needs ? '.is-warn' : ''}`, desc), peek, loginErrorNode(login)),
      action ? h('div.set-control', action) : null),
    showing.has(key) && stderr ? h('pre.set-ext-output', stderr) : null,
  ];
}
