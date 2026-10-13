// @ts-check
//! 引导自己画的几屏（蓝图 `web.md`「第一次引导」第 3、4、10 条和第 9 条下面一款）：欢迎、界面语言、沙盒、完成。模型、人格、主题、
//! 预设那几屏由别的包交来。

import { h, icon, replace } from '../../src/lib/dom.js';

/** 这台设备上记一笔走到哪一步（换了界面语言要重载页面，重载完接着走） */
export const STEP_KEY = 'welcome.step';
/** 这台设备上记着这个账号走过了引导：一打开不再先盖底色 */
export const DONE_KEY = 'welcome.done';

/**
 * 欢迎（第 3 条）：吉祥物站在标题上面（放大，舞台在 `guide.js`），标题、一行说明、「开始」，下面暗色「按 Enter 开始」。
 * @param {import('./guide.js').Guide} g
 */
export function helloScreen(g) {
  const t = g.t;
  return {
    title: t('hello.title'),
    sub: t('hello.sub'),
    center: true,
    body: h('p.wl-hint', t('hello.hint')),
    next: { label: t('hello.start'), ready: () => true, run: async () => { g.go('language', 1); return null; } },
  };
}

/**
 * 界面语言（第 4 条）：表里的每一种一行（写它自己的名字），浏览器的语言那一行标「跟随系统」；先选中现在用的。设置项是跟着浏览器、
 * 选的又是浏览器的那一种：不写（照旧跟着）；别的和设置项不一样的写进去，要重载的先记一笔接着第 5 条。
 * @param {import('./guide.js').Guide} g
 */
export function languageScreen(g) {
  const t = g.t;
  const lang = g.ctx.language;
  const { items } = lang.options();
  const auto = items.find((/** @type {any} */ x) => x.auto);
  const rows = items.filter((/** @type {any} */ x) => !x.auto);
  const browser = rows.find((/** @type {any} */ x) => x.name === auto?.name)?.value ?? null;
  const setting = lang.setting;
  let chosen = setting === 'auto' ? browser ?? rows[0]?.value : setting;
  const list = h('div.wl-langs');
  const draw = () => replace(list, rows.map((/** @type {any} */ r) => h(`button.wl-lang${r.value === chosen ? '.is-on' : ''}`, { type: 'button', onclick: () => { chosen = r.value; draw(); } },
    h('span.wl-lang-name', r.name), r.value === browser ? h('span.wl-tag', t('language.system')) : null,
    r.value === chosen ? h('span.wl-check', icon('check')) : null)));
  draw();
  return {
    title: t('language.title'),
    sub: t('language.sub'),
    body: list,
    focus: /** @type {HTMLElement|null} */ (list.querySelector('.wl-lang.is-on')),
    next: {
      ready: () => !!chosen,
      run: async () => {
        const keep = chosen === setting || (setting === 'auto' && chosen === browser);
        if (!keep) {
          // 界面的字变了要重载页面：先记一笔，重载完接着选模型
          g.ctx.storage.set(STEP_KEY, 'model');
          const got = await lang.set(chosen);
          if (got?.reload) return null;
          g.ctx.storage.set(STEP_KEY, null);
        }
        g.go('model', 1);
        return null;
      },
    },
  };
}

/** 称呼、更多描述最多几个字（核心 P-9 的配置清单） */
const NAME_MAX = 64;
const ABOUT_MAX = 2000;

/**
 * 关于你（第 8 条下面一款；核心 P-9，2026-10-13 项目主人定两部分）：「AI 怎么称呼你」（必填）、「更多描述（可选）」，先填现在写着的。
 * 「下一步」和现在的不一样的写个人设置：写了的写，清空了的删掉。新会话生效。
 * @param {import('./guide.js').Guide} g
 */
export function profileScreen(g) {
  const t = g.t;
  const core = g.ctx.core;
  const name = /** @type {HTMLInputElement} */ (h('input.set-input.ob-input', { type: 'text', maxlength: String(NAME_MAX), placeholder: t('profile.name_hint'), spellcheck: 'false', autocomplete: 'off' }));
  const about = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.wl-area', { maxlength: String(ABOUT_MAX), rows: '5', placeholder: t('profile.about_hint') }));
  /** 现在写着的（读到以前是空的） */
  const now = { name: '', about: '' };
  core.request('config.get', { keys: ['profile.name', 'profile.about'] }).then((/** @type {any} */ got) => {
    const read = (/** @type {string} */ k) => (typeof got?.items?.[k]?.value === 'string' ? got.items[k].value : '');
    now.name = read('profile.name');
    now.about = read('profile.about');
    // 人已经打了字的不盖掉
    if (!name.value) name.value = now.name;
    if (!about.value) about.value = now.about;
    g.sync();
  }).catch(() => {});
  name.addEventListener('input', () => g.sync());
  const row = (/** @type {string} */ label, /** @type {HTMLElement} */ control) => h('div.ob-field.wl-profile-row', h('span.ob-field-name', label), h('div.ob-field-control', control));
  return {
    title: t('profile.title'),
    sub: t('profile.sub'),
    body: h('div.wl-profile', row(t('profile.name'), name), row(t('profile.about'), about)),
    focus: name,
    next: {
      ready: () => !!name.value.trim(),
      run: async () => {
        /** @type {{key: string, value?: string, unset?: boolean}[]} */
        const changes = [];
        for (const [key, value, was] of [['profile.name', name.value.trim(), now.name], ['profile.about', about.value.trim(), now.about]]) {
          if (value === was) continue;
          changes.push(value ? { key, value } : { key, unset: true });
        }
        if (changes.length) {
          await core.request('config.set', { layer: 'personal', changes });
          now.name = name.value.trim();
          now.about = about.value.trim();
        }
        g.go('preset', 1);
        return null;
      },
    },
  };
}

/**
 * 沙盒（第 9 条下面一款；核心 8-32，2026-10-13 项目主人：默认开）：两行「开」「关」，先选中现在的（没写的是开）。「下一步」和现在的不一样的
 * 写个人设置的 `permission.level`：开是 `workspace`，关是 `full`。新会话照它开局。
 * @param {import('./guide.js').Guide} g
 */
export function sandboxScreen(g) {
  const t = g.t;
  const core = g.ctx.core;
  let now = 'workspace';
  let chosen = now;
  const list = h('div.wl-langs');
  const draw = () => replace(list, ['workspace', 'full'].map((v) => h(`button.wl-lang${v === chosen ? '.is-on' : ''}`, { type: 'button', onclick: () => { chosen = v; draw(); } },
    h('span.wl-lang-name', t(`sandbox.${v}`)), h('span.wl-lang-note', t(`sandbox.${v}_note`)),
    v === chosen ? h('span.wl-check', icon('check')) : null)));
  draw();
  // 读现在写着的（中途关了重来的、设置页改过的）：是关的换过去
  core.request('config.get', { keys: ['permission.level'] }).then((/** @type {any} */ got) => {
    const value = got?.items?.['permission.level']?.value;
    if (value !== 'full' || chosen !== 'workspace' || now !== 'workspace') return;
    now = chosen = 'full';
    draw();
  }).catch(() => {});
  return {
    title: t('sandbox.title'),
    sub: t('sandbox.sub'),
    body: list,
    focus: /** @type {HTMLElement|null} */ (list.querySelector('.wl-lang.is-on')),
    next: {
      ready: () => true,
      run: async () => {
        if (chosen !== now) {
          await core.request('config.set', { layer: 'personal', changes: [{ key: 'permission.level', value: chosen }] });
          now = chosen;
        }
        g.go('done', 1);
        return null;
      },
    },
  };
}

/**
 * 完成（第 10 条）：一行写用的模型、人格、预设，「开始聊天」。
 * @param {import('./guide.js').Guide} g
 */
export function doneScreen(g) {
  const t = g.t;
  const r = g.result;
  const model = r.model ? r.model.model || r.model.name : '';
  const parts = [model ? t('done.model', { name: model }) : null, r.persona ? t('done.persona', { name: r.persona }) : null, r.preset ? t('done.preset', { name: r.preset }) : null].filter(Boolean);
  return {
    title: t('done.title'),
    sub: parts.join(' · '),
    center: true,
    body: h('span'),
    next: {
      label: t('done.start'),
      ready: () => true,
      run: async () => {
        try {
          g.ctx.mascot?.hop?.();
          return await g.finish();
        } catch (err) {
          return t('failed', { reason: /** @type {any} */ (err)?.message ?? String(err) });
        }
      },
    },
  };
}
