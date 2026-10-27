// @ts-check
//! 装、卸软件包的确认卡片写什么（蓝图 `web.md`「确认和提问」；核心 F-10 下上：访问类别 `install`，`detail` 是
//! `{tool: "package", install|remove|enable, preview}`，`preview` 同 `package.install` / `package.remove` 带 `preview: true` 的回应）。
//! 照命令行 `miyu pkg install` 的排法（`crates/miyu-cli/src/pkg/confirm.rs`），说法换成软件的规范用语（2026-10-12 项目主人）：
//! 标题「安装软件包 notes 0.2.0」，下面一行包文件夹，再几行「包含」「无法加载」「所需权限」「一并删除」「大小」，没有的那一行不写。纯的。

import { bytes } from '../../src/lib/format.js';

/**
 * @typedef {{title: string, path: string|null, rows: {label: string, items: string[]}[]}} Plan
 *   `items` 一项一个（「包含」照顿号连成一行，「无法加载」一项一行，由画的那边定）
 */

/**
 * 卡片的内容；不是装卸包的（`detail.tool` 不是 `package`、没有 `preview`）交回 `null`，照别的确认画。
 * @param {any} detail 确认请求的 `detail`
 * @param {string|null} home 家目录（路径里写成 `~`）
 * @param {(key: string, fields?: Record<string, any>) => string} text 这个包的字（`plan.*`）
 * @returns {Plan|null}
 */
export function packagePlan(detail, home, text) {
  const p = detail?.preview;
  if (detail?.tool !== 'package' || !p || typeof p !== 'object') return null;
  const doing = typeof detail.remove === 'string' ? 'remove' : typeof detail.enable === 'string' ? 'enable' : p.restores === true ? 'restore' : 'install';
  // 写组名的（核心 BS-1 中下修：`{group, packages}`）：卸的照卸，装的是装回卸掉的出厂包
  if (typeof p.group === 'string') return groupPlan(p, doing === 'remove' ? 'remove' : 'restore', text);
  const id = String(p.package ?? detail.remove ?? detail.enable ?? '');
  let title = text(`plan.${doing}`, { id });
  if (typeof p.version === 'string' && p.version) title += ` ${p.version}`;
  if (p.replaces && typeof p.replaces === 'object') title += typeof p.replaces.version === 'string' ? text('plan.replaces', { version: p.replaces.version }) : text('plan.replaces_unknown');
  // 包文件夹：装回出厂的（`restores`）`install` 是编号不是文件夹，不写（不然名字写两遍）
  const path = typeof detail.install === 'string' && doing !== 'restore' ? tilde(detail.install, home) : null;
  /** @type {{label: string, items: string[]}[]} */
  const rows = [];
  const row = (/** @type {string} */ key, /** @type {string[]} */ items) => {
    if (items.length) rows.push({ label: text(`plan.labels.${key}`), items });
  };
  row('includes', included(p, doing, text));
  row('skipped', list(p.skipped).filter((s) => s && typeof s.file === 'string').map((s) => text('plan.skipped', { file: s.file, why: String(s.why ?? '') })));
  row('needs', list(p.capabilities).map((c) => (typeof c?.name === 'string' && c.name ? c.name : String(c?.id ?? ''))).filter(Boolean));
  if (doing === 'remove') {
    const keys = strings(p.settings);
    row('deletes', [...(keys.length ? [text('plan.settings_keys', { keys: keys.join(text('plan.separator')) })] : []), ...(p.state === true ? [text('plan.state_dir')] : [])]);
  }
  if (Number.isInteger(p.size) && Number.isInteger(p.files)) row('size', [text('plan.size', { size: bytes(p.size), files: p.files })]);
  return { title, path, rows };
}

/**
 * 写组名的卡片：问题行「恢复「基础系统」里的 20 个软件包」（组名照编号认，认不得的写编号），下面一行「软件包」照编号连；一个都不动的写没有要动的。
 * @param {any} p @param {'remove'|'restore'} doing @param {(key: string, fields?: Record<string, any>) => string} text @returns {Plan}
 */
function groupPlan(p, doing, text) {
  const ids = strings(p.packages);
  const known = text(`plan.groups.${p.group}`);
  const name = known === `plan.groups.${p.group}` ? p.group : known;
  const title = ids.length ? text(`plan.group_${doing}`, { name, n: ids.length }) : text(`plan.group_${doing}_none`, { name });
  return { title, path: null, rows: ids.length ? [{ label: text('plan.labels.packages'), items: [ids.join(text('plan.separator'))] }] : [] };
}

/** 「包含」那几样，照命令行的先后：程序、命令、后台页、吉祥物、接入、系统账号、MCP 服务、技能、脚本、斜杠命令、人格、预设（核心 P-11 下）、几项设置（卸的不算设置）。 */
function included(p, doing, text) {
  const items = [];
  if (typeof p.program === 'string') {
    const known = text(`plan.programs.${p.program}`);
    items.push(known === `plan.programs.${p.program}` ? p.program : known);
  }
  if (typeof p.command === 'string') items.push(text('plan.carried.command', { name: p.command }));
  if (p.page === true) items.push(text('plan.carried.page'));
  if (p.mascot === true) items.push(text('plan.carried.mascot'));
  if (typeof p.connection === 'string') items.push(text('plan.carried.connection', { platform: p.connection }));
  if (p.system_account === true) items.push(text('plan.carried.system_account'));
  for (const name of strings(p.mcp)) items.push(text('plan.carried.mcp', { name }));
  for (const name of strings(p.skills)) items.push(text('plan.carried.skill', { name }));
  for (const name of strings(p.scripts)) items.push(text('plan.carried.script', { name }));
  for (const name of strings(p.slash)) items.push(text('plan.carried.slash', { name }));
  for (const name of strings(p.personas)) items.push(text('plan.carried.persona', { name }));
  for (const name of strings(p.presets)) items.push(text('plan.carried.preset', { name }));
  if (doing !== 'remove' && Number.isInteger(p.settings)) items.push(text('plan.carried.settings', { count: p.settings }));
  return items;
}

const list = (v) => (Array.isArray(v) ? v : []);
const strings = (v) => list(v).filter((x) => typeof x === 'string');
/** 家目录里的写成 `~`。 */
const tilde = (path, home) => (home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path);
