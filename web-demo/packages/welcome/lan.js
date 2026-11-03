// @ts-check
//! 在别的设备上用（蓝图 `web.md`「第一次引导」第 9 条下面一款；2026-11-03 项目主人提的、问过定的，W-1086）：语义模型后面、完成前面一屏，问向不向局域网开放。
//! 两张卡「开放」「不开放」，不先选。选「开放」的：没设过访问密码的先在这一屏设（同设置「访问」那一格，宿主的 `access`），再写配置
//! `web.listen = 0.0.0.0`、请网页软件照配置换（`POST /listen`，同设置页「允许局域网访问」），最后画别的设备打开的地址和二维码（设置包的
//! `lan.card`，设置「访问」一组用的同一张）。选「不开放」的直接到完成（以后从托盘、设置里还能开）。

import { h, icon, replace } from '../../src/lib/dom.js';

/** 听哪个地址（网页软件的配置项） */
export const LISTEN_KEY = 'web.listen';
/** 「开放」写的值 */
const ANY = '0.0.0.0';

/**
 * 这一屏出不出：页面直接连着网页软件（宿主有 `listen`，走桥的没有）、核心的配置清单里有 `web.listen`（网页软件装着）。
 * @param {any} ctx
 * @returns {Promise<boolean>}
 */
export async function lanState(ctx) {
  if (!ctx.host?.listen?.relisten) return false;
  try {
    const schema = await ctx.core.request('config.schema', { keys: [LISTEN_KEY] });
    return !!schema?.items?.some((/** @type {any} */ i) => i.key === LISTEN_KEY);
  } catch {
    return false;
  }
}

/**
 * 网页软件这时听的地址是不是对局域网开着（纯的）：本机回环（`127.0.0.1`、`::1`、`localhost`、`127.` 打头的）不算；问不到的不算。
 * @param {string|null|undefined} listen
 */
export function lanOpen(listen) {
  if (typeof listen !== 'string' || !listen) return false;
  const a = listen.replace(/^\[|\]$/g, '');
  return !(a === '::1' || a === 'localhost' || a.startsWith('127.'));
}

/**
 * 点「下一步」做什么（纯的）：`done` 到完成；`close` 先关上再到完成（选了「不开放」、这时却开着：这一屏开过又改选的，或者刷新回到这一屏、
 * 以前在设置里开过的）；`ask` 先设访问密码（没设过的；
 * 旧核心不说设没设的 `null` 不问，同设置页不出那一行）；`set` 设好密码再开；`open` 直接开；`null` 还没选。
 * @param {'choose'|'password'|'shown'} phase @param {'open'|'closed'|null} chosen @param {boolean|null} passwordSet @param {boolean} opened
 * @returns {'done'|'close'|'ask'|'set'|'open'|null}
 */
export function lanAction(phase, chosen, passwordSet, opened) {
  if (phase === 'shown') return 'done';
  if (phase === 'password') return 'set';
  if (chosen === 'closed') return opened ? 'close' : 'done';
  if (chosen === 'open') return passwordSet === false ? 'ask' : 'open';
  return null;
}

/**
 * 「在别的设备上用」一屏：先选（`choose`），选了「开放」点下一步，没设过密码的到设密码那一格（`password`），开好了画地址（`shown`）。
 * 「上一步」在后两段回到选的那一段；选「不开放」时这时开着的（这一屏开过又改选的、刷新回来的、以前在设置里开过的）关上。
 * @param {import('./guide.js').Guide} g
 */
export function lanScreen(g) {
  const t = g.t;
  const { core, host } = g.ctx;
  /** @type {'open'|'closed'|null} */
  let chosen = null;
  /** @type {'choose'|'password'|'shown'} */
  let phase = 'choose';
  /** 这时对局域网开着（进这一屏先问一次，这一屏开、关跟着改）：选「不开放」时关上 */
  let opened = false;
  host.listen.get?.().then((got) => { if (lanOpen(got?.listen)) opened = true; }, () => {});
  const list = h('div.wl-langs');
  const body = h('div.wl-lan', list);
  const draw = () => replace(list, ['open', 'closed'].map((v) => h(`button.wl-lang${v === chosen ? '.is-on' : ''}`, { type: 'button', onclick: () => { chosen = /** @type {'open'|'closed'} */ (v); draw(); g.sync(); } },
    h('span.wl-lan-text', h('span.wl-lang-name', t(`lan.${v}`)), h('span.wl-lang-note', t(`lan.${v}_note`))),
    v === chosen ? h('span.wl-check', icon('check')) : null)));
  draw();
  const password = /** @type {HTMLInputElement} */ (h('input.set-input.ob-input', { type: 'password', placeholder: t('lan.password_hint'), 'aria-label': t('lan.password'), autocomplete: 'new-password', spellcheck: 'false', oninput: () => g.sync() }));
  /** 回到选的那一段 */
  const choose = () => {
    phase = 'choose';
    replace(body, list);
    g.say('');
    g.sync();
    /** @type {HTMLElement|null} */ (list.querySelector('.wl-lang.is-on'))?.focus();
  };
  /** 设密码那一格：同设置「访问」那一格（一个框加眼睛，设置包给的眼睛；浏览器记密码照藏着的固定用户名） */
  const askPassword = () => {
    phase = 'password';
    password.value = '';
    const user = h('input', { type: 'text', autocomplete: 'username', value: 'Miyu', hidden: true, readonly: true, tabindex: '-1' });
    const field = g.ctx.settings?.lan?.secret(password) ?? password;
    replace(body, h('div.wl-profile', user, h('div.ob-field.wl-profile-row', h('span.ob-field-name', t('lan.password')), h('div.ob-field-control', field)),
      h('p.wl-note', t('lan.password_note'))));
    g.sync();
    queueMicrotask(() => password.focus());
  };
  /** 写配置、请网页软件换过去，画地址；交回出错的那一句 */
  const open = async () => {
    await core.request('config.set', { layer: 'system', changes: [{ key: LISTEN_KEY, value: ANY }] });
    opened = true;
    const got = await host.listen.relisten().catch(() => null) ?? await host.listen.get?.().catch(() => null);
    if (typeof got?.error === 'string') return t('lan.failed', { error: got.error });
    phase = 'shown';
    const url = typeof got?.lan === 'string' ? got.lan : null;
    const card = url ? g.ctx.settings?.lan?.card(url) : null;
    replace(body, card ?? h('p.wl-note', t('lan.no_address')));
    g.sync();
    return null;
  };
  /** 关上（选了「不开放」、这时却开着） */
  const close = async () => {
    await core.request('config.set', { layer: 'system', changes: [{ key: LISTEN_KEY, unset: true }] });
    opened = false;
    await host.listen.relisten().catch(() => null);
  };
  return {
    title: t('lan.title'),
    sub: t('lan.sub'),
    body,
    back: () => (phase === 'choose' ? g.go('embed', -1) : choose()),
    next: {
      ready: () => (phase === 'choose' ? chosen !== null : phase === 'password' ? !!password.value : true),
      run: async () => {
        const act = lanAction(phase, chosen, host.access?.set() ?? null, opened);
        if (act === 'ask') {
          askPassword();
          return null;
        }
        if (act === 'set') {
          // 查法、设法同设置「访问」那一格：本机连上的不要旧密码
          const why = host.access.problem(password.value, password.value) ?? await host.access.change(password.value, null);
          if (why) return why;
        }
        if (act === 'set' || act === 'open') return open();
        if (act === 'close') await close();
        if (act) g.go('done', 1);
        return null;
      },
    },
  };
}
