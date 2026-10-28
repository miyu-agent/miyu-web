// @ts-check
//! 引导自己画的几屏（蓝图 `web.md`「第一次引导」第 3、4、10 条和第 9 条下面一款）：欢迎、界面语言、沙盒、完成。模型、人格、主题、
//! 预设那几屏由别的包交来。

import { h, icon, replace } from '../../src/lib/dom.js';
import { bytes } from '../../src/lib/format.js';

/** 这台设备上记一笔走到哪一步（换了界面语言要重载页面，重载完接着走） */
export const STEP_KEY = 'welcome.step';
/** 这台设备上记着这个账号走过了引导：一打开不再先盖底色 */
export const DONE_KEY = 'welcome.done';

/**
 * 欢迎（第 3 条）：吉祥物站在标题上面（放大，舞台在 `guide.js`），标题、「开始」，下面一闪一闪的「PRESS ENTER」。
 * @param {import('./guide.js').Guide} g
 */
export function helloScreen(g) {
  const t = g.t;
  return {
    title: t('hello.title'),
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
/** 回复语言（核心 P-9 补） */
const LANGUAGE_KEY = 'profile.preferred_reply_language';

/**
 * 关于你（第 8 条下面一款；核心 P-9，2026-10-13 项目主人定两部分）：「AI 怎么称呼你」（必填）、「更多描述（可选）」，先填现在写着的；
 * 核心 P-9 补起回复语言一行，排第一（2026-10-17 项目主人定，和设置页「用户」同序）：名字照 `config.schema` 那一项的 `name` 加「（可选）」，
 * 下拉加「其他」手写（设置页的 `combo`），建议值照它的 `suggestions`；旧核心没有这一项的不画这一行。「下一步」和现在的不一样的写配置：写了的写，清空了的删掉。新会话生效。
 * @param {import('./guide.js').Guide} g
 */
export function profileScreen(g) {
  const t = g.t;
  const core = g.ctx.core;
  const name = /** @type {HTMLInputElement} */ (h('input.set-input.ob-input', { type: 'text', maxlength: String(NAME_MAX), placeholder: t('profile.name_hint'), spellcheck: 'false', autocomplete: 'off' }));
  const about = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.wl-area', { maxlength: String(ABOUT_MAX), rows: '5', placeholder: t('profile.about_hint') }));
  /** 现在写着的（读到以前是空的） */
  const now = { name: '', about: '', language: '' };
  /** 回复语言这一行选着、写着的（`null` 是不设） */
  let language = /** @type {string|null} */ (null);
  const row = (/** @type {string} */ label, /** @type {HTMLElement} */ control) => h('div.ob-field.wl-profile-row', h('span.ob-field-name', label), h('div.ob-field-control', control));
  /** 回复语言那一行：清单和现在的值都到了才画；先占一行的高，画出来下面两行不跳 */
  const languageRow = h('div.wl-profile-slot');
  core.request('config.get', { keys: ['profile.name', 'profile.about'] }).then((/** @type {any} */ got) => {
    const read = (/** @type {string} */ k) => (typeof got?.items?.[k]?.value === 'string' ? got.items[k].value : '');
    now.name = read('profile.name');
    now.about = read('profile.about');
    // 人已经打了字的不盖掉
    if (!name.value) name.value = now.name;
    if (!about.value) about.value = now.about;
    g.sync();
  }).catch(() => {});
  // 分开问：旧核心不认这个键，整个拒（`unknown_config_key`），不能连累上面两项
  Promise.all([core.request('config.schema', { keys: [LANGUAGE_KEY] }), core.request('config.get', { keys: [LANGUAGE_KEY] }), g.service('settings')]).then(([schema, got]) => {
    const item = schema?.items?.find((/** @type {any} */ i) => i.key === LANGUAGE_KEY);
    if (!item) return void languageRow.remove();
    const value = got?.items?.[LANGUAGE_KEY]?.value;
    now.language = typeof value === 'string' ? value : '';
    language = now.language || null;
    languageRow.replaceWith(row(t('profile.language', { name: item.name ?? LANGUAGE_KEY }), g.kit.combo(Array.isArray(item.suggestions) ? item.suggestions : [], language, (next) => { language = next; })));
  }).catch((/** @type {any} */ err) => {
    // 旧核心不认这个键：不画这一行，不算出错
    languageRow.remove();
    if (err?.reason !== 'unknown_config_key') console.error(`回复语言那一行画不了：${err?.message ?? err}`);
  });
  name.addEventListener('input', () => g.sync());
  about.addEventListener('input', () => g.sync());
  const body = h('div.wl-profile', languageRow, row(t('profile.name'), name), row(t('profile.about'), about));
  return {
    title: t('profile.title'),
    sub: t('profile.sub'),
    body,
    focus: name,
    // 第一块是窄的下拉、名字就在它上面：站在整张表的上沿靠右，不挡字
    perch: body,
    next: {
      // 都空着、原来也没写的：主按钮写「跳过」，点了什么都不写（2026-10-19 项目主人）
      label: () => (!name.value.trim() && !about.value.trim() && !now.name && !now.about ? t('skip') : t('next')),
      ready: () => true,
      run: async () => {
        /** @type {{key: string, value?: string, unset?: boolean}[]} */
        const changes = [];
        for (const [key, value, was] of [['profile.name', name.value.trim(), now.name], ['profile.about', about.value.trim(), now.about], [LANGUAGE_KEY, (language ?? '').trim(), now.language]]) {
          if (value === was) continue;
          changes.push(value ? { key, value } : { key, unset: true });
        }
        if (changes.length) {
          await core.request('config.set', { layer: 'system', changes });
          now.name = name.value.trim();
          now.about = about.value.trim();
          now.language = (language ?? '').trim();
        }
        g.go('preset', 1);
        return null;
      },
    },
  };
}

/** 内置语义模型那一项（配置）：`local` 开、`off` 只用关键词 */
export const EMBED_KEY = 'models.embedding';

/**
 * 内置语义模型的包（`embed`）装没装、没装的能不能从软件源装（核心 G-8，`docs/construction/G-8-引导里下语义模型.md`）：
 * - 装了：`config.schema` 里这一项的 `local` 选项不带 `available: false`（2026-10-18 shorin-ee 转来），交 `{installed: true}`；
 * - 没装：`package.install {"source": "embed", "preview": true}` 看一眼，交 `{installed: false, size}`（要下的字节数，照回应的 `download`）；
 *   连不上软件源（`source_unreachable`）的大小交 `null`，这一屏照样出，点「是」装的时候照核心的原话说装不上；
 * - 旧核心没有这一项、软件源里没有、没有本机能用的文件、旧核心不认 `source` 的：交 `null`，这一屏跳过。
 * @param {any} core
 * @returns {Promise<{installed: true}|{installed: false, size: number|null}|null>}
 */
export async function embedState(core) {
  let item;
  try {
    const schema = await core.request('config.schema', { keys: [EMBED_KEY] });
    item = schema?.items?.find((/** @type {any} */ i) => i.key === EMBED_KEY);
  } catch {
    return null;
  }
  const local = (item?.options ?? []).find((/** @type {any} */ o) => o.value === 'local');
  if (!local) return null;
  if (local.available !== false) return { installed: true };
  try {
    const got = await core.request('package.install', { source: EMBED_PACKAGE, preview: true });
    return { installed: false, size: typeof got?.download === 'number' ? got.download : null };
  } catch (err) {
    return /** @type {any} */ (err)?.reason === 'source_unreachable' ? { installed: false, size: null } : null;
  }
}

/** 内置语义模型的包的编号（官方软件源里的 `miyu-agent/miyu-embed`） */
export const EMBED_PACKAGE = 'embed';

/**
 * 装不上的那一句：`source_unreachable`、`download_failed` 的原因在 `data.why`（英文，照原话），别的照核心的话。
 * @param {any} err @returns {string}
 */
export function installWhy(err) {
  const why = err?.data?.why;
  return typeof why === 'string' && why ? why : err?.message ?? String(err);
}

/**
 * 内置语义模型（第 9 条下面最后一款；2026-10-18 项目主人要的，下载那一半照核心 G-8）：`guide.js` 照 `embedState` 决定出不出这一屏。两行「是」
 * 「否」。装了的：先选中现在的（写着 `off` 的是否，别的、没写的是是：核心不写就是 `local`），「下一步」和现在的不一样的写配置。没装的：
 * 「是」暗字「推荐 · 需下载 57 MB」，先选中「是」；选「是」点「下一步」从软件源装，这一块换成进度条（`package.progress`），装好往下走；
 * 装不上的照原话说一句，按钮换成「继续」，再点往下走（以后在软件包页里装）。没装的选「否」什么都不写（设置页那一行照旧说「未安装」）。
 * @param {import('./guide.js').Guide} g
 * @param {{installed: true}|{installed: false, size: number|null}} state
 */
export function embedScreen(g, state) {
  const t = g.t;
  const core = g.ctx.core;
  let now = 'local';
  let chosen = now;
  /** 装不上过一回：再点「继续」往下走，不再试 */
  let failed = false;
  const list = h('div.wl-langs');
  const note = (/** @type {string} */ v) => v === 'local' && !state.installed && state.size != null
    ? t('embed.local_note_download', { size: bytes(state.size) })
    : t(`embed.${v}_note`);
  const draw = () => replace(list, ['local', 'off'].map((v) => h(`button.wl-lang${v === chosen ? '.is-on' : ''}`, { type: 'button', onclick: () => { chosen = v; draw(); } },
    h('span.wl-lang-name', t(`embed.${v}`)), note(v) ? h('span.wl-lang-note', note(v)) : null,
    v === chosen ? h('span.wl-check', icon('check')) : null)));
  draw();
  const body = h('div.wl-embed', list);
  // 读现在写着的（中途关了重来的、设置页改过的）：写着关的换过去
  if (state.installed) {
    core.request('config.get', { keys: [EMBED_KEY] }).then((/** @type {any} */ got) => {
      if (got?.items?.[EMBED_KEY]?.value !== 'off' || chosen !== 'local' || now !== 'local') return;
      now = chosen = 'off';
      draw();
    }).catch(() => {});
  }
  /** 从软件源装：这一块换成进度条，装好交 `null`，装不上交那一句 */
  const install = async () => {
    const bar = h('i');
    const words = h('span.wl-dl-words', t('embed.downloading'));
    const meter = h('div.wl-dl', h('div.wl-dl-bar', bar), words);
    replace(body, meter);
    const onPush = (/** @type {string} */ method, /** @type {any} */ p) => {
      if (method !== 'package.progress' || !p || typeof p.done !== 'number') return;
      const total = typeof p.total === 'number' && p.total > 0 ? p.total : null;
      bar.style.width = total ? `${Math.min(100, (p.done / total) * 100).toFixed(1)}%` : '0%';
      words.textContent = total ? t('embed.progress', { done: bytes(p.done), total: bytes(total) }) : t('embed.downloading');
    };
    core.onPush(onPush);
    try {
      await core.request('package.install', { source: EMBED_PACKAGE });
      return null;
    } catch (err) {
      replace(body, list);
      return t('embed.failed', { why: installWhy(err) });
    } finally {
      core.pushes?.delete(onPush);
    }
  };
  return {
    title: t('embed.title'),
    sub: t('embed.sub'),
    body,
    focus: /** @type {HTMLElement|null} */ (list.querySelector('.wl-lang.is-on')),
    next: {
      ready: () => true,
      label: () => (failed ? t('embed.continue') : t('next')),
      run: async () => {
        if (!state.installed) {
          if (chosen === 'local' && !failed) {
            const why = await install();
            if (why) {
              failed = true;
              return why;
            }
            // 下的时候点了「上一步」走开了的：装好了也不拉回来
            if (g.step !== 'embed') return null;
          }
          g.go('done', 1);
          return null;
        }
        if (chosen !== now) {
          await core.request('config.set', { layer: 'system', changes: [{ key: EMBED_KEY, value: chosen }] });
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
  // 走完的几样一样一行（跳过了的不写），隔 0.3 秒一行弹上来，每弹一行吉祥物跳一下（同 style.css 的时刻；2026-10-19 项目主人：原来的礼花不适合）
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    parts.forEach((_, i) => setTimeout(() => { if (g.step === 'done' && g.layer.isConnected) g.ctx.mascot?.hop?.(); }, 450 + i * 300 + 120));
  }
  return {
    title: t('done.title'),
    center: true,
    kind: 'done',
    body: h('div.wl-done', parts.length ? h('div.wl-pills', parts.map((p, i) => h('span.wl-pill', { style: `--i: ${i}` }, t('done.got'), ' ', h('b', p)))) : null),
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
