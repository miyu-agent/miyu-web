// @ts-check
//! MCP 服务的一行和「个人设置中的 MCP 服务」那一组（蓝图 `web.md`「设置页」第 13 条；核心 X-4、F-9 补）。包里带的（扩展包、`bundle`）在
//! 包的信息页里一组（`core-packages.js` 的 `mcpGroup`），个人设置里写的（`settings.toml` 的 `[mcp.<名字>]`，不属于哪个包）在「软件包」
//! 页单列一组，照 `mcp.list`。一行一个服务：名字、现在怎样（停下的红字、能展开看输出）；被个人设置里同名的替代了的写「被个人设置中的
//! 同名服务替代」，不写已停用（`covered`）。个人设置里的每一行右边一个「重启」（`mcp.restart`）；加、删、改照旧手改文件（核心不给编辑）。

import { h } from '../../src/lib/dom.js';
import { stateText } from './extensions.js';

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
  const stopped = opts.on && !s.covered && s.state === 'stopped';
  const stderr = Array.isArray(s.stderr) ? s.stderr.join('\n') : s.stderr ?? '';
  const peek = stopped && stderr ? h('button.set-link', { type: 'button', onclick: () => { if (showing.has(key)) showing.delete(key); else showing.add(key); dialog.drawBody(); } },
    t(showing.has(key) ? 'ext.hide_output' : 'ext.show_output')) : null;
  const desc = s.covered ? t('pkg.mcp_covered') : stateText(t, { ...s, on: opts.on && s.state !== 'off' });
  return [
    h('div.set-row', h('div.set-text', h('div.set-name', h('span', s.name)), h(`p.set-desc${stopped ? '.is-error' : ''}`, desc), peek),
      opts.action ? h('div.set-control', opts.action) : null),
    showing.has(key) && stderr ? h('pre.set-ext-output', stderr) : null,
  ];
}

/**
 * 「个人设置中的 MCP 服务」：一组，组头下一行暗色说在哪里改；没有的（个人设置里没写、旧核心没有 `mcp.list`）不画。
 * @param {any} dialog
 */
export function homeMcpPart(dialog) {
  const servers = /** @type {any[]|null} */ (dialog.homeMcp ?? null);
  if (!servers?.length) return null;
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const rows = servers.map((s) => serverRow(dialog, `~home/${s.name}`, s, { on: true, action: restartButton(dialog, s.name) }));
  return h('section.set-part', h('h2.set-part-name', t('pkg.part.home_mcp')), h('p.set-part-hint', t('pkg.home_mcp_hint')), h('section.set-group', h('div.set-rows', rows)));
}

/** 「重启」：`mcp.restart {name}`，回应是那一项，换进去重画；拒了弹一句。 @param {any} dialog @param {string} name */
function restartButton(dialog, name) {
  return h('button.set-btn.is-small', { type: 'button', onclick: async () => {
    try {
      const got = await dialog.ctx.core.request('mcp.restart', { name });
      if (got?.name) dialog.homeMcp = (dialog.homeMcp ?? []).map((/** @type {any} */ x) => (x.name === got.name ? got : x));
    } catch (err) {
      dialog.toast(err?.message ?? String(err));
    }
    dialog.drawBody();
  } }, dialog.ctx.text('pkg.mcp_restart'));
}
