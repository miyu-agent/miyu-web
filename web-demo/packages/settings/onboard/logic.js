// @ts-check
//! 接一家供应商的纯逻辑（蓝图 `web.md`「第一次引导」第 5–7、12 条；照核心 `cli/setup.md` 第 3–10 条，写的东西和 `miyu setup` 一样）：
//! 选一家那一屏有哪几行、标什么；配置里的编号怎么起（目录里的、自定义的）；`provider.test` 带什么；存的时候写哪几项。

import { validId, providerName } from '../model.js';

/** 通用的二级域名：`api.example.co.uk` 取 `example`（`cli/setup.md` 第 4 条第 3 款） */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'edu', 'gov', 'ac']);
/** 出厂的三个池：配置里一个池都没有时一起写（`cli/setup.md` 第 10 条） */
export const DEFAULT_POOLS = ['lite', 'standard', 'flagship'];

/**
 * 目录里的编号写进配置用的编号（`cli/setup.md` 第 10 条）：别的字换成 `-`，不是字母开头的前面加 `p-`（`302ai` → `p-302ai`、
 * `wafer.ai` → `wafer-ai`），最长 32。
 * @param {string} catalog
 */
export function configId(catalog) {
  let id = catalog.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!/^[a-z]/.test(id)) id = `p-${id}`;
  return id.slice(0, 32);
}

/**
 * 自定义的那一家的编号（`cli/setup.md` 第 4 条第 3 款）：照地址的主机名起，本机的（`localhost`、IP）是 `local`，别的取倒数第二段
 * （是通用二级域名的再往前一段）；配置里有了的往后加 `-2`、`-3`。
 * @param {string} url @param {Set<string>} taken 配置里已经有的编号
 */
export function customId(url, taken) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  let base;
  if (host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) base = 'local';
  else {
    const parts = host.split('.');
    let i = parts.length - 2;
    if (i > 0 && SECOND_LEVEL.has(parts[i])) i -= 1;
    base = parts[Math.max(0, i)];
  }
  const root = configId(base).slice(0, 29);
  let id = root;
  for (let n = 2; taken.has(id); n += 1) id = `${root}-${n}`;
  return id;
}

/**
 * 自定义的那一家人起的编号哪里不对（2026-10-13 项目主人：能自己起）：照「路径里的名字」的写法（小写字母开头，只有小写字母、数字、`-`、`_`，
 * 最长 32），不能和配置里已有的重。对的交 `null`，不然交字的键（设置页编辑表那两句）。
 * @param {string} id @param {Set<string>} taken
 * @returns {'bad_id'|'taken_id'|null}
 */
export function customIdProblem(id, taken) {
  if (!validId(id)) return 'bad_id';
  return taken.has(id) ? 'taken_id' : null;
}

/** 地址写得对不对：`http://`、`https://` 开头、读得出主机名。 @param {string} text */
export function validUrl(text) {
  if (!/^https?:\/\//i.test(text)) return false;
  try {
    return !!new URL(text).hostname;
  } catch {
    return false;
  }
}

/** 地址去掉前后空白和末尾的 `/`（`cli/setup.md` 第 4 条第 1 款）。 @param {string} text */
export const cleanUrl = (text) => text.trim().replace(/\/+$/, '');

/**
 * @typedef {{kind: 'catalog', id: string, name: string, supported: boolean, configured: string|null, env: string|null, logo?: any}
 *   | {kind: 'local', id: string, name: string, base_url: string, host: string, configured: string|null, logo?: any}
 *   | {kind: 'mine', id: string, name: string, configured: string, logo?: any}} Row
 *   一行：常用的一家（`configured` 是配置里的编号，没配的是 `null`；`env` 是找到的变量），本机的一家；`logo` 是核心给的图标（`src/lib/logo.js`），
 *   核心给图标的（目录里有一项带 `logo` 这一格）每一行都带（没有的 `null`，画名称的第一个字），老核心的不带（不画图标位）
 */

/**
 * 算配好了的几家（蓝图第 6 条）：`model.list` 里密钥取得到的、没写密钥的（本机的服务这类）。写了密钥、引用的密钥没了的（`key.set` 是
 * `false`，2026-10-13 项目主人实测）不算：照没配过的走，存的时候照同一个编号写新的密钥。
 * @param {any[]} providers `model.list` 的 `providers`
 */
export const usableIds = (providers) => new Set(providers.filter((p) => !p?.key || p.key.set).map((p) => p.id));

/**
 * 选一家那一屏的几行（蓝图第 5 条）：常用的照 `featured` 的先后，本机的照 `provider.detect` 的先后。
 * @param {any[]} featured `provider.catalog {featured: true}` 的 `providers`
 * @param {any} detect `provider.detect` 的回应（读不到是 `null`）
 * @param {Set<string>} configured 配好了的编号（`usableIds`）
 * @returns {{common: Row[], local: Row[]}}
 */
export function providerRows(featured, detect, configured) {
  const keys = /** @type {any[]} */ (detect?.keys ?? []);
  // 核心给不给图标（2026-10-11 起 `provider.catalog` 每一项带 `logo`）：给的每一行都带，好对齐
  const logos = featured.some((p) => p && typeof p === 'object' && 'logo' in p);
  const logoOf = (/** @type {any} */ x) => (logos ? { logo: x?.logo ?? null } : {});
  const common = featured.map((p) => {
    const id = configId(p.id);
    const key = keys.find((k) => k.provider === p.id && k.supported);
    const configuredAs = configured.has(id) ? id : keys.find((k) => k.provider === p.id && k.configured)?.configured ?? null;
    return /** @type {Row} */ ({ kind: 'catalog', id: p.id, name: p.name || p.id, supported: !!p.supported, configured: configuredAs, env: key?.env ?? null, ...logoOf(p) });
  });
  const local = (/** @type {any[]} */ (detect?.local ?? [])).map((l) => {
    let host = l.base_url;
    try {
      host = new URL(l.base_url).host;
    } catch {
      // 读不出的照原样写
    }
    return /** @type {Row} */ ({ kind: 'local', id: l.provider, name: l.name || l.provider, base_url: l.base_url, host, configured: l.configured ?? null, ...logoOf(l) });
  });
  return { common, local };
}

/**
 * 配置里已经有、常用和本机里都没有的几家（自定义的、搜出来接的）：一家一行，排在最前面（2026-10-23 项目主人：建好了自定义的，点了返回，
 * 列表里哪儿都没有，再建同一个 ID 又说已经有了）。
 * @param {any[]} providers `model.list` 的 `providers` @param {Row[]} shown 常用、本机那几行（它们里已经有的不再列）
 * @returns {Row[]}
 */
export function mineRows(providers, shown) {
  const taken = new Set(shown.map((r) => r.configured).filter(Boolean));
  return (providers ?? []).filter((p) => p?.id && !taken.has(p.id))
    .map((p) => /** @type {Row} */ ({ kind: 'mine', id: p.id, name: providerName(p), configured: p.id, ...('logo' in p ? { logo: p.logo ?? null } : {}) }));
}

/**
 * @typedef {{kind: 'configured', id: string}
 *   | {kind: 'catalog', catalog: string, env: string|null}
 *   | {kind: 'local', catalog: string}
 *   | {kind: 'custom', driver: string, base_url: string, id?: string, name?: string|null}} Target 要接的那一家：配好了的、目录里的、本机的服务、自定义的（`id` 人起的编号，空着照主机名起；`name` 显示名称，空着照 ID）
 * @typedef {{value: string}|{env: string}|null} Key 这一次用的密钥：贴的、环境变量、不要
 */

/**
 * `provider.test` 的参数（`cli/setup.md` 第 7 条）：配好的带 `provider`，别的带 `candidate`；贴的密钥照 `{value}` 交。
 * @param {Target} target @param {Key} key @param {string|null} model 列不出模型时人填的模型名
 */
export function testParams(target, key, model) {
  /** @type {Record<string, any>} */
  const params = {};
  if (target.kind === 'configured') params.provider = target.id;
  else {
    /** @type {Record<string, any>} */
    const candidate = {};
    if (target.kind === 'custom') Object.assign(candidate, { driver: target.driver, base_url: target.base_url });
    else candidate.catalog = target.catalog;
    if (key) candidate.key = key;
    params.candidate = candidate;
  }
  if (model) params.model = model;
  return params;
}

/**
 * 存的时候写哪几项（蓝图第 6 条；照 `cli/setup.md` 第 10 条）：没配过的这一家的密钥（`{env}`、`{secret}`；本机的服务写 `local = true`）、
 * 目录里的编号改过写法的另写 `catalog`、自定义的写 `driver`、`base_url`；`chat` 的写 `models.chat`；`pools` 的写三个出厂的池。
 * @param {Target} target
 * @param {{env: string}|{secret: string}|null} key 写进配置的密钥引用
 * @param {{chat?: string|null, pools?: boolean, taken: Set<string>}} opts 主对话用哪个模型、要不要建池、配置里已经有的编号
 * @returns {{id: string, changes: {key: string, value?: any, input?: string}[]}}
 */
export function setupChanges(target, key, opts) {
  /** @type {{key: string, value?: any, input?: string}[]} */
  const changes = [];
  let id;
  if (target.kind === 'configured') id = target.id;
  else {
    id = target.kind === 'custom' ? target.id || customId(target.base_url, opts.taken) : configId(target.catalog);
    const put = (/** @type {string} */ field, /** @type {any} */ value) => changes.push({ key: `providers.${id}.${field}`, value });
    if (target.kind !== 'custom' && id !== target.catalog) put('catalog', target.catalog);
    if (target.kind === 'custom') {
      put('driver', target.driver);
      if (target.name) put('name', target.name);
      changes.push({ key: `providers.${id}.base_url`, input: target.base_url });
    }
    if (target.kind === 'local') put('local', true);
    else if (key) put('key', key);
  }
  if (opts.chat) changes.push({ key: 'models.chat', value: `${id}/${opts.chat}` });
  if (opts.pools) {
    for (const pool of DEFAULT_POOLS) changes.push({ key: `pools.${pool}.models`, value: [] }, { key: `pools.${pool}.subagent`, value: true });
  }
  return { id, changes };
}

/** 配置里一个池都没有（`config.get` 的 `items` 里没有 `pools.` 开头的键）。 @param {Record<string, any>} items */
export const noPools = (items) => !Object.keys(items ?? {}).some((k) => k.startsWith('pools.'));

/**
 * 测完以后的一列模型：试的那一个排第一（推荐），别的照列出的先后，去重。
 * @param {string[]} models @param {string|null} tried
 */
export function modelOrder(models, tried) {
  const rest = [...new Set(models)].filter((m) => m !== tried);
  return tried ? [tried, ...rest] : rest;
}

/** 照搜索框里的字挑模型（不分大小写，空着全部）。 @param {string[]} models @param {string} query */
export function filterNames(models, query) {
  // 空格分开的几个词都要有（不分先后），每个词也可以是跳着的几个字（「cline deepseek」找得到 clinepass/cline-pass/deepseek-v4.1-flash，
  // 「dsflash」找得到 deepseek-flash；2026-10-23 项目主人：搜索不支持模糊搜索）；连着含着的排前面
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return models;
  const loose = (/** @type {string} */ text, /** @type {string} */ w) => {
    let i = 0;
    for (const ch of text) if (ch === w[i]) i += 1;
    return i >= w.length;
  };
  const scored = [];
  for (const m of models) {
    const low = m.toLowerCase();
    if (!words.every((w) => low.includes(w) || loose(low, w))) continue;
    scored.push({ m, exact: words.every((w) => low.includes(w)) ? 0 : 1 });
  }
  return scored.sort((a, b) => a.exact - b.exact).map((x) => x.m);
}

/**
 * 没测成的那一行写什么（蓝图第 6 条）：核心说要模型名的（`need_model`，核心 8-11 五补）写「未获取到模型列表」（多一行填模型名），
 * `stage` 是 `config` 的写「配置错误」，别的照出错的分类（列模型时认证错的也是）；有状态码的接 ` · 401`。交回字的键和要不要填模型名。
 * @param {any} result `provider.test` 的回应
 * @returns {{key: string, status: number|null, needsModel: boolean, message: string}}
 */
export function failureOf(result) {
  const error = result?.error ?? {};
  const message = typeof error.message === 'string' ? error.message : '';
  const status = typeof error.status === 'number' ? error.status : null;
  if (result?.need_model) return { key: 'onboard.no_list', status: null, needsModel: true, message };
  if (result?.stage === 'config') return { key: 'onboard.config_error', status: null, needsModel: false, message };
  const KNOWN = ['retryable', 'rate_limited', 'context_too_long', 'auth', 'no_model', 'cooling', 'content_policy', 'bad_stream', 'empty_reply'];
  return { key: `onboard.classes.${KNOWN.includes(error.class) ? error.class : 'other'}`, status, needsModel: false, message };
}
