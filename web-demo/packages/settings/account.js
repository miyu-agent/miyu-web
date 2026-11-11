// @ts-check
//! 设置「通用」页里的「访问」一组（网页自己的一组；蓝图 `web.md`「设置页」第 12c 条；2026-10-30 项目主人：原来单独一页，放进通用，网页默认只给本机，
//! 一个开关放开到局域网、能填监听地址和端口、写访问密码）。2026-11-11 项目主人（W-1153）照 im 网页的会话卡片重排成一张卡片：卡片头是开关和现在的
//! 状态，开着时里面分行——监听地址和端口一行两个框、紧跟着访问密码、别的设备怎么打开（二维码、地址、「更多地址」）。头像挪到「用户身份」页（第 12d 条）。
//! 「退出登录」2026-10-30 项目主人定整行去掉：本机没设访问密码时点了会停在输不了密码的那一屏；要踢掉别的设备就改访问密码，或者 `miyu web --logout`。

import { h, icon } from '../../src/lib/dom.js';
import { sectionKit } from './kit.js';
import { groupBlock, toggle, textField } from './rows.js';
import { plainItem } from './model.js';
import { fold } from './privacy.js';
import { ACCESS } from '../../src/lib/launch.js';
import { lanCard } from './lan-card.js';
import { ALL, lanAddrs, loopbackOnly, portOf, turnOnWay } from './access-model.js';
import { askPassword, passwordRows } from './access-password.js';

export { loopbackOnly } from './access-model.js';
export { withEye } from './access-password.js';

/** 改了要网页软件当场换监听的两项 */
export const LISTEN_KEYS = ['web.listen', 'web.port'];

/**
 * 「访问」一组（第 12c 条）。`withAvatar` 的（核心没有「用户身份」页）头像排最前。一行都没有的交 `null`。
 * @param {any} dialog @param {boolean} [withAvatar]
 */
export function accessGroup(dialog, withAvatar = false) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const listen = dialog.schema ? plainItem(dialog.schema, dialog.got ?? {}, 'web.listen') : null;
  const port = dialog.schema ? plainItem(dialog.schema, dialog.got ?? {}, 'web.port') : null;
  const group = groupBlock(t('pages.account'), [withAvatar ? avatarRow(dialog) : null, listen ? lanBlock(dialog, listen, port) : null]);
  // `miyu web --settings access` 照它滚到这一组（W-1085）
  if (group) group.dataset.group = ACCESS;
  return group;
}

/** 「用户身份」页最上面的头像（第 12d 条）；没有的交 `null`。 @param {any} dialog */
export function avatarGroup(dialog) {
  return groupBlock(null, [avatarRow(dialog)]);
}

/**
 * 局域网访问那张卡片（第 12c 条，W-1153）。卡片头：「允许局域网访问」、后面一个小标签写现在的状态（「仅本机」「已开启」）、一句说明、一句
 * `warn` 色的不加密，右边开关。开着时下面展开（收起展开的动画同私密目录的总开关）：监听地址和端口、访问密码、别的设备怎么打开。
 *
 * 开关（网页软件的 `web.listen`）：开是写 `0.0.0.0`（这台电脑的所有地址，不用人再去改地址），关是去掉这一项（回到出厂的 `127.0.0.1`）。
 * 没设访问密码的打开时先弹窗设（`askPassword`），设好了才写；不设的开关拨回去、提示要先设密码（没密码不放开局域网，规矩照旧）。
 * @param {any} dialog @param {any} listen @param {any} port
 */
function lanBlock(dialog, listen, port) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const on = !loopbackOnly(listen.entry?.value ?? listen.default);
  if (on && dialog.lanInfo === undefined) lookUp(dialog);
  const sw = toggle(on, async (/** @type {boolean} */ next) => {
    if (next && turnOnWay(dialog.ctx.host?.access?.set()) === 'ask' && !(await askPassword(dialog, sw))) {
      dialog.toast(t('account.lan_password_first'));
      return false;
    }
    const why = await dialog.save(listen, next ? { value: ALL } : { unset: true });
    if (why) dialog.toast(why);
    // 打开了：卡片往下展开（地址和端口、访问密码、二维码），露不全的挪到露得出来为止；本来就露着的不动
    else if (next) dialog.reveal?.(ACCESS, 'nearest');
    return !why;
  });
  sw.setAttribute('aria-label', t('account.lan'));
  const { main, others } = lanAddrs(on ? dialog.lanInfo : null);
  // Mac 上别的设备打不开多半是防火墙挡了传入连接，开着时写一句去哪放行（2026-11-10 项目主人：换了真实地址也打不开）
  const mac = on && !!main && dialog.ctx.host?.platform === 'macos';
  return h('div.acc-card',
    h('div.acc-card-head',
      h('div.set-text',
        h('div.set-name', h('span', t('account.lan')), h(`span.set-mark.acc-state${on ? '.is-on' : ''}`, t(on ? 'account.lan_state_on' : 'account.lan_state_off'))),
        h('p.acc-card-desc', t('account.lan_desc')),
        // 明文 HTTP（2026-10-30 项目主人定不配证书，第二轮审查 W2-3）
        h('p.acc-card-desc.acc-lan-warn', t('account.lan_risk'))),
      sw),
    fold(dialog, 'lan', !on,
      listenRow(dialog, listen, port, on),
      ...passwordRows(dialog),
      main ? h('div.acc-card-open', lanCard(dialog.ctx, main.url, main.card, {
        inset: true, others, open: !!dialog.lanMore, remember: (/** @type {boolean} */ open) => { dialog.lanMore = open; },
      }), mac ? h('p.acc-card-desc', t('account.lan_mac_firewall')) : null) : null));
}

/**
 * 「监听地址和端口」一行（`web.listen`、`web.port`，W-1153，2026-11-11 项目主人：「监听地址和端口我认为应该是一行的两个输入框而不是两个配置
 * 项目」，原来各占一行、把访问密码挤到很下面）：左边名字和一句说明，右边地址的框、冒号、端口的框。改完（回车、离开）就存：地址写成回环的存完开关
 * 跟着关；地址清空的放回原来的（要关用开关）；端口清空的去掉这一项（回到出厂的端口），写得不是 1–65535 的放回原来的。核心拒了的原因写在这一行
 * 下面。网页软件实际听的端口和配置里的不一样的（出厂端口被占、回退了）多一行暗字写现在用的。
 * @param {any} dialog @param {any} listen @param {any} port @param {boolean} on
 */
function listenRow(dialog, listen, port, on) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const error = h('p.set-error', { hidden: true });
  const save = async (/** @type {any} */ item, /** @type {any} */ change) => {
    error.hidden = true;
    const why = await dialog.save(item, change);
    if (!why) return;
    error.textContent = why;
    error.hidden = false;
  };
  const addrNow = String(listen.entry?.value ?? listen.default ?? '');
  const addr = textField(addrNow, 'text', listen.name ?? '', (text) => {
    if (text === '') addr.value = addrNow;
    else void save(listen, { input: text });
  });
  addr.classList.add('acc-listen-addr');
  addr.setAttribute('aria-label', listen.name ?? t('account.listen'));
  addr.autocomplete = 'off';
  const wrote = port ? port.entry?.value ?? port.default : null;
  const portNow = wrote == null ? '' : String(wrote);
  const number = port ? textField(portNow, 'number', port.name ?? '', (text) => {
    const n = portOf(text);
    if (n === null) number.value = portNow;
    else void save(port, n === '' ? { unset: true } : { value: n });
  }) : null;
  if (number) {
    number.classList.add('acc-listen-port');
    number.inputMode = 'numeric';
    number.setAttribute('aria-label', port.name ?? '');
    number.autocomplete = 'off';
  }
  const now = dialog.lanInfo?.port;
  const problems = [...(listen.problems ?? []), ...(port?.problems ?? [])];
  return h('div.set-row.acc-listen-row',
    h('div.set-text',
      h('div.set-name', h('span', t(port ? 'account.listen' : 'account.listen_only'))),
      h('p.acc-card-desc', t('account.listen_desc')),
      on && typeof now === 'number' && typeof wrote === 'number' && now !== wrote ? h('p.acc-card-desc', t('account.port_now', { port: now })) : null,
      ...problems.map((p) => h(`p.set-problem.is-${p.level === 'error' ? 'error' : 'warn'}`, p.message)),
      error),
    h('div.acc-listen', addr, number ? h('span.acc-listen-colon', { 'aria-hidden': 'true' }, ':') : null, number));
}

/** 问网页软件一次在听的（`GET /listen`）：拿到了记下、重画；问不到的记成 `null`，不再问。 @param {any} dialog */
function lookUp(dialog) {
  const listen = dialog.ctx.host?.listen;
  dialog.lanInfo = null;
  if (!listen?.get) return;
  listen.get().then((/** @type {any} */ got) => {
    dialog.lanInfo = got ?? null;
    if (got?.lan && dialog.current === 'general') dialog.drawBody?.();
  }, () => {});
}

/**
 * 存完 `web.listen`、`web.port`（这一组、「软件包」页都算）：网页软件自己跟着核心的配置换（`web-ui.md` 第一条第 11 款），这里再 `POST /listen` 拿换完的样子
 * （第 12c 条第 1 款）：换不了的、端口换了的提示一句。端口换走了、这个页面请不到它的，照新端口提示新地址；走桥的不提示。
 * @param {any} dialog @param {string[]} keys 这一次存了的键
 */
export async function relisten(dialog, keys) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const listen = dialog.ctx.host?.listen;
  if (!listen?.relisten) return;
  const got = await listen.relisten().catch(() => null);
  if (!got) {
    const item = dialog.schema ? plainItem(dialog.schema, dialog.got ?? {}, 'web.port') : null;
    const port = item?.entry?.value ?? item?.default;
    if (!keys.includes('web.port') || typeof port !== 'number') return;
    dialog.toast(t('account.lan_port_moved', { port }));
    // 记着的照新端口改（网页软件已经跟着配置换过去了；局域网的网址只换端口）
    const was = dialog.lanInfo;
    if (was) {
      const moved = (/** @type {any} */ u) => (typeof u === 'string' ? u.replace(/:\d+$/, `:${port}`) : u);
      dialog.lanInfo = { ...was, port, lan: moved(was.lan), lans: Array.isArray(was.lans) ? was.lans.map((/** @type {any} */ l) => ({ ...l, url: moved(l?.url) })) : was.lans };
    }
    if (dialog.current === 'general') dialog.drawBody?.();
    return;
  }
  const before = dialog.lanInfo;
  dialog.lanInfo = got;
  if (typeof got.error === 'string') dialog.toast(t('account.lan_failed', { error: got.error }));
  else if (typeof got.port === 'number' && String(got.port) !== (globalThis.location?.port ?? '')) dialog.toast(t('account.lan_port_moved', { port: got.port }));
  if (got.lan !== before?.lan && dialog.current === 'general') dialog.drawBody?.();
}

/**
 * 「头像」一行（核心 AV-1，只有你那一张；蓝图第 12d 条）：左边圆的头像（有图的画图，没有的画一个人的图标），右边「更换头像」（选图、不是正方形的先裁、
 * 缩小、传上去、`account.set_avatar`）、有头像的「移除」。走桥的（宿主不记头像）、人格那一套不在的不出「更换头像」。
 * @param {any} dialog
 */
function avatarRow(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const me = dialog.ctx.host?.avatar ?? null;
  if (!me) return null;
  const face = () => {
    const img = me.get();
    return img ? h('span.acc-avatar.is-pic', h('img', { src: img, alt: '' })) : h('span.acc-avatar', icon('user-round'));
  };
  const holder = h('span.acc-avatar-slot', face());
  const say = (/** @type {any} */ err) => {
    const why = err?.reason === 'avatar_not_image' ? t('account.avatar_not_image') : err?.reason === 'avatar_too_big' ? t('account.avatar_too_big')
      : err?.reason === 'avatar_conflict' ? t('account.avatar_conflict') : err?.message ?? String(err);
    dialog.toast(why);
  };
  /** 设成这张（`null` 是移除）：成了记下、当场换；别处刚改过的照新的取一次 @param {{blob: string, image: Blob}|null} got */
  const apply = async (got) => {
    try {
      const done = await dialog.ctx.core.request('account.set_avatar', { ...(got ? { blob: got.blob } : { unset: true }), expect: me.version() });
      await me.set(done?.avatar ?? null, got?.image ?? null);
    } catch (err) {
      if (/** @type {any} */ (err)?.reason === 'avatar_conflict') {
        const now = await dialog.ctx.core.request('account.avatar', {}).catch(() => null);
        await me.set(now?.avatar ?? null, now?.data ? new Blob([Uint8Array.from(atob(now.data), (c) => c.charCodeAt(0))], { type: now.media_type ?? 'image/png' }) : null);
      }
      say(err);
    }
  };
  const picker = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    try {
      const got = await dialog.ctx.personas.avatarUpload(sectionKit(dialog), holder, file);
      if (got) await apply(got);
    } catch (err) {
      say(err);
    }
  } }));
  const canPick = typeof dialog.ctx.personas?.avatarUpload === 'function';
  const actions = h('div.acc-actions');
  const drawActions = () => actions.replaceChildren(...[
    canPick ? h('button.set-btn', { type: 'button', onclick: () => picker.click() }, t('account.avatar_change')) : null,
    me.get() ? h('button.set-btn', { type: 'button', onclick: () => apply(null) }, t('account.avatar_remove')) : null,
    picker,
  ].filter((x) => x !== null));
  drawActions();
  const stop = me.watch(() => {
    if (!holder.isConnected) return stop();
    holder.replaceChildren(face());
    drawActions();
  });
  return h('div.set-row.acc-avatar-row', h('div.set-text', h('div.set-name', h('span', t('account.avatar')))), h('div.acc-avatar-control', holder, actions));
}
