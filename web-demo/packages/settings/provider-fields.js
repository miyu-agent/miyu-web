// @ts-check
//! 添加、编辑供应商的表画哪几项、软件包给的值怎么摆（蓝图 `web.md`「设置页」第 14 条「添加、编辑供应商」；2026-11-21 主人验收
//! 第 8 条，核心 FX-11）：`model.list` 每家的 `needs: {key, base_url}` 是 `none` 的那一项不画（Antigravity 这种扩展驱动没有地址、
//! 不要密钥）；旧核心没有 `needs` 的、新建的照旧都画。软件包带的那一家，`config.get` 里来源是 `package` 的值是包给的：地址框空着、
//! 包给的写成暗的占位字，空着存不写；接口照包给的选着，没改的不写（写进配置就盖住包的，包更新了也跟不上）。

import { keySegment, envRef, inputText } from './model.js';

/** 这一项要不要画：只有 `none` 不画 @param {unknown} need */
const shows = (need) => need !== 'none';

/**
 * 这一家的一项是不是软件包给的：`config.get` 里这一项来源是 `package` 的交它的值，别的交 `null`。
 * @param {{items?: Record<string, any>}} got @param {string} id @param {string} field
 */
export function packageValue(got, id, field) {
  const entry = got?.items?.[`providers.${keySegment(id)}.${field}`];
  return entry?.origin?.layer === 'package' ? (entry.value ?? null) : null;
}

/**
 * 表怎么画：`url` 是地址那一格（`null` 不画；`hint` 是空着时的暗字：包给的地址、环境变量的名字；`keepWhenEmpty` 空着存不写），
 * `key` 是画不画密钥，`driver` 是接口：`current` 选着的，`packaged` 包给的（没有是 `null`）。`p` 是 `model.list` 里这一家，新建是 `null`。
 * @param {any} p @param {{items?: Record<string, any>}} got @param {string|null} id
 */
export function formPlan(p, got, id) {
  const needs = p?.needs ?? {};
  const fromPackage = id ? packageValue(got, id, 'base_url') : null;
  const urlEnv = envRef(p?.base_url);
  const url = !shows(needs.base_url) ? null
    : fromPackage !== null ? { value: '', hint: { package: inputText(fromPackage) }, keepWhenEmpty: true }
      : urlEnv ? { value: '', hint: { env: urlEnv }, keepWhenEmpty: true }
        : { value: inputText(p?.base_url ?? ''), hint: null, keepWhenEmpty: false };
  const driver = id ? packageValue(got, id, 'driver') : null;
  return { url, key: shows(needs.key), driver: { current: p?.driver ?? null, packaged: typeof driver === 'string' ? driver : null } };
}

/**
 * 存的时候接口写什么：包给的、人没改的不写（`null`），别的照选着的写。
 * @param {ReturnType<typeof formPlan>} plan @param {string} chosen
 */
export const driverToWrite = (plan, chosen) => (plan.driver.packaged !== null && chosen === plan.driver.packaged ? null : chosen);
