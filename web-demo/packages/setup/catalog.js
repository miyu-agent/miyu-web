// @ts-check
//! 有哪些人格、预设，默认是哪个（软件包 `setup`）：照核心的 `persona.list`、`preset.list`、`config.get` 读，进空会话、打开设置时读一次；
//! 读不到的（旧核心）那一样是 `null`，界面就不出那个按钮。
//! 有写错的人格、预设时多调一次 `check`，拿给人看的那一句（照连接的语言，带行号、文件）。人格的头像照版本缓存（`avatars.js`，
//! 读到一张新的叫 `listeners`）；预设的图标是 Lucide 的名字，读列表时顺带读一次整套图标（`moreIcons`，核心 P-5）。

import { problemsOf } from './model.js';
import { PersonaImages } from './avatars.js';

/** 出厂的「无功能」预设（核心 P-17）：全关、能编辑，替了原来 `preset: null` 的「无工具」 */
export const NONE = 'none';

export class Catalog {
  /**
   * @param {{request: (method: string, params: any) => Promise<any>}} core @param {() => Promise<void>} [moreIcons] 读整套图标（内核的 `icons`）
   * @param {{member?: boolean, configless?: boolean}} [who] 成员调不了 `check`；老核心上的成员（Y-2下下上）默认人格、预设（配置）也读不了，不问
   */
  constructor(core, moreIcons = () => Promise.resolve(), who = {}) {
    this.core = core;
    this.member = !!who.member;
    this.configless = !!who.configless;
    this.moreIcons = moreIcons;
    /** @type {import('./model.js').Persona[]|null} */
    this.personas = null;
    /** @type {import('./model.js').Preset[]|null} */
    this.presets = null;
    /** @type {{name?: string, summary?: string, icon?: string}|null} 「无工具」那一项（核心 P-16 下；旧核心没有） */
    this.noTools = null;
    /** 配置项 `persona.default`、`preset.default` 的最终值 */
    this.personaDefault = /** @type {string|null} */ (null);
    this.presetDefault = /** @type {string|null} */ (null);
    /** 写错的人格、预设照 `check` 查到的问题（给人看的那一句照连接的语言）；没有写错的不查，是空的 */
    this.problems = /** @type {any[]} */ ([]);
    /** 头像读到一张新的时叫的（列表、对话区她那一轮的头重画） @type {Set<() => void>} */
    this.listeners = new Set();
    /** 人格的头像 */
    const changed = () => this.changed();
    this.avatars = new PersonaImages(core, changed, 'avatar');
    /** 人格的背景图（核心 P-6） */
    this.backgrounds = new PersonaImages(core, changed, 'background');
  }

  /** 重新读一遍。 */
  async load() {
    const [personas, presets, got] = await Promise.all([
      this.core.request('persona.list', {}).then((r) => r?.personas ?? [], () => null),
      this.core.request('preset.list', {}).then((r) => r?.presets ?? [], () => null),
      this.configless ? null : this.core.request('config.get', { keys: ['persona.default', 'preset.default'] }).catch(() => null),
      this.moreIcons(),
    ]);
    this.personas = personas;
    // 「无工具」（核心 P-16 下：`preset.list` 末尾一项 `preset: null`）单拿出来：它不是能编辑、能设成默认的预设，
    // 只在新会话、换预设的菜单里列（蓝图 web.md「人格、预设、工作区」第 6 条）；混在预设里的话卡片、编辑、引导都照编号找，找不到
    this.noTools = presets?.find((p) => p?.preset === null) ?? null;
    this.presets = presets?.filter((p) => p?.preset != null) ?? null;
    this.personaDefault = got?.items?.['persona.default']?.value ?? null;
    this.presetDefault = got?.items?.['preset.default']?.value ?? null;
    const bad = [...(personas ?? []), ...(presets ?? [])].some((x) => x.problem);
    this.problems = bad && !this.member ? await this.core.request('check', {}).then((r) => r?.problems ?? [], () => []) : [];
    // 重读完叫一声：左上角、对话区的头像、主题色、背景图照新的列表重画（编辑卡片里改了主题色、换了背景图，不等别的事来再画）
    this.changed();
  }

  /** 列表重读了、读到了一张新的图：叫听着的重画。 */
  changed() {
    for (const fn of this.listeners) fn();
  }

  /**
   * 「无工具」的老会话（`preset: null` 又带 `no_tools`）该算在哪个预设上：旧核心是单拿的那一项（`false`），新核心（P-17）是出厂的
   * `none`「无功能」；都没有的是 `null`。
   * @returns {false|string|null}
   */
  noToolsAs() {
    if (this.noTools) return false;
    return this.presets?.some((p) => p.preset === NONE) ? NONE : null;
  }

  /** 一个写错的人格、预设，人看的那几句：`check` 里找到的，找不到的退回列表里那句原话。 @param {'persona'|'preset'} kind @param {{problem?: string} & Record<string, any>} item */
  problemOf(kind, item) {
    const found = problemsOf(this.problems, kind, item[kind]);
    return found.length ? found : [{ line: null, message: item.problem ?? '', file: '' }];
  }
}
