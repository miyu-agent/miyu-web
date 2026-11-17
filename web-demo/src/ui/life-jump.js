// @ts-check
//! 快速跳转人生会话（核心 LF-12；2026-11-17 项目主人本机验收第 28、29 条，W-1211；蓝图 `web.md`「推演人生」第 4 条）：光打 `/life` 回的 `lives`
//! 一条直接跳过去，几条在输入框上面的列表里让人挑（人格的头像、名字、在干嘛，右边状态）；空会话里光打 `/life` 不要求先开会话，照 `life.list` 列。
//! 判断在 `lib/life.js`，这里只问核心、画。

import { t } from '../util/res.js';
import { livesOf, lifeJump, lifeSide } from '../lib/life.js';
import { refusalText } from '../model/commands.js';

/** @typedef {import('./app.js').App} App @typedef {import('../lib/life.js').Life} Life */

/** 状态那一小格的字（照界面语言） @param {string} key @param {any} [fields] */
const side = (key, fields) => t(`life.side.${key}`, fields);

/**
 * 几段人生让人挑一个跳过去：输入框上面的列表（同 `/persona`），一行头像、名字、在干嘛，右边状态；正看着的那一条写「当前」。
 * @param {App} app @param {Life[]} lives
 */
export function pickLife(app, lives) {
  const now = new Date();
  const current = lives.findIndex((l) => l.session === app.current);
  app.composer.picker.show({
    title: t('life.jump_title'),
    hint: t('life.jump_hint'),
    note: t('life.jump_current'),
    current,
    items: lives.map((l) => {
      const look = app.chat.lookFor?.(l.persona);
      return { label: l.name, desc: l.doing ?? undefined, side: lifeSide(l, now, side), avatar: { url: look?.avatar ?? null, name: look?.name ?? l.name } };
    }),
    choose: (i) => { const s = lives[i]?.session; if (s && s !== app.current) app.open(s); },
  });
}

/**
 * 光打的 `/life` 回来以后：带 `lives` 的照条数跳或者挑。交回处理过没有（挑的列表出来了的不再写回执，回执和列表叠在一个位置）；
 * 没带 `lives` 的（一条都没有）照常跳 `session`、写回执。
 * @param {App} app @param {string} name @param {string|null} words @param {any} got `command.run` 的回应
 */
export function afterLife(app, name, words, got) {
  if (name.toLowerCase() !== 'life' || (words ?? '').trim()) return false;
  const lives = livesOf(got);
  const plan = lifeJump(lives);
  if (plan.kind === 'pick') {
    pickLife(app, lives);
    return true;
  }
  if (plan.kind === 'open' && plan.session !== app.current) app.open(plan.session);
  return false;
}

/**
 * 空会话里光打 `/life`：问 `life.list`，没有的说一句，一条直接打开，几条让人挑。
 * @param {App} app
 */
export async function emptyLifeList(app) {
  try {
    const lives = livesOf(await app.store.conn.request('life.list', {}));
    const plan = lifeJump(lives);
    if (plan.kind === 'none') app.composer.say(t('life.none'));
    else if (plan.kind === 'open') app.open(plan.session);
    else pickLife(app, lives);
  } catch (err) {
    app.composer.say(refusalText(err), false, false, true);
  }
}
