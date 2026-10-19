// @ts-check
//! 新建项目、项目设置那一张表的纯逻辑（蓝图 `web.md`「会话整理和项目」第 8 条；核心 H-1，`docs/reference/projects.md`）：一个项目填进表里的样子、
//! 表里有什么不对、交给核心的参数（`project.create`、`project.update`）。

/**
 * 核心给的一个项目（同 `src/core/projects.js` 的 `Project`；软件包之间不互相 import，这里照用到的写一份形状）。
 * @typedef {{project: string, name: string, description?: string, color?: string, workspace?: string, persona?: string|null,
 *   preset?: string, prompt?: string, open?: boolean}} Project
 */

/** 名称、说明、附加提示词最多几个字（核心照字数，不照字节） */
export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 80;
export const PROMPT_MAX = 8000;

/** 字数（照 Unicode 码点，同核心）。 @param {string} s */
export const chars = (s) => [...s].length;

/**
 * 表里填的（新建、项目设置那一个窗口）：`persona` 是 `undefined` 的照配置的默认、`null` 的无人格；`workspace` 空的是默认工作区。
 * @typedef {{name: string, description: string, color: string, workspace: string, persona: string|null|undefined, preset: string|undefined,
 *   prompt: string, open: boolean}} Form
 */

/** 一个项目填进表里的样子（新建的是空的、颜色先选上 `color`）。 @param {Project|null} p @param {string} [color] */
export function formOf(p, color = '') {
  return {
    name: p?.name ?? '',
    description: p?.description ?? '',
    color: p ? p.color ?? '' : color,
    workspace: p?.workspace ?? '',
    persona: p && 'persona' in p ? p.persona ?? null : undefined,
    preset: p?.preset ?? undefined,
    prompt: p?.prompt ?? '',
    open: !!p?.open,
  };
}

/**
 * 表里有什么不对（交给人看的那一格和原因，没有的是 `null`）：名称必填、首尾空白去掉以后 1 到 40 个字，说明最多 80，附加提示词最多 8000。
 * @param {Form} f @returns {{field: 'name'|'description'|'prompt', why: 'required'|'too_long'}|null}
 */
export function formProblem(f) {
  const name = f.name.trim();
  if (!name) return { field: 'name', why: 'required' };
  if (chars(name) > NAME_MAX) return { field: 'name', why: 'too_long' };
  if (chars(f.description.trim()) > DESCRIPTION_MAX) return { field: 'description', why: 'too_long' };
  if (chars(f.prompt) > PROMPT_MAX) return { field: 'prompt', why: 'too_long' };
  return null;
}

/** 新建交给核心的（`project.create`）：没填的不写。 @param {Form} f */
export function createParams(f) {
  const out = /** @type {Record<string, any>} */ ({ name: f.name.trim() });
  const description = f.description.trim();
  if (description) out.description = description;
  if (f.color) out.color = f.color;
  if (f.workspace) out.workspace = f.workspace;
  if (f.persona !== undefined) out.persona = f.persona;
  if (f.preset) out.preset = f.preset;
  if (f.prompt.trim()) out.prompt = f.prompt;
  if (f.open) out.open = true;
  return out;
}

/**
 * 项目设置存的时候交给核心的（`project.update`）：只写改了的；改成空的列进 `unset`（回到「没写」：人格、预设照配置的默认，工作区是默认工作区）。
 * 什么都没改的交 `null`。
 * @param {string} id @param {Form} was @param {Form} f
 */
export function updateParams(id, was, f) {
  const out = /** @type {Record<string, any>} */ ({ project: id });
  /** @type {string[]} */
  const unset = [];
  const name = f.name.trim();
  if (name !== was.name.trim()) out.name = name;
  /** @param {'description'|'color'|'workspace'|'preset'|'prompt'} key @param {string|undefined} a @param {string|undefined} b */
  const text = (key, a, b) => {
    if ((a ?? '') === (b ?? '')) return;
    if (b) out[key] = b;
    else unset.push(key);
  };
  text('description', was.description.trim(), f.description.trim());
  text('color', was.color, f.color);
  text('workspace', was.workspace, f.workspace);
  text('preset', was.preset, f.preset);
  text('prompt', was.prompt.trim() ? was.prompt : '', f.prompt.trim() ? f.prompt : '');
  if (was.persona !== f.persona) {
    if (f.persona === undefined) unset.push('persona');
    else out.persona = f.persona;
  }
  if (was.open !== f.open) out.open = f.open;
  if (unset.length) out.unset = unset;
  return Object.keys(out).length > 1 ? out : null;
}
