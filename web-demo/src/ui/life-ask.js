// @ts-check
//! `/life kill`、`/life new` 发之前问一句（蓝图 `web.md`「推演人生」第 4 条；2026-11-14 项目主人：网页确认，终端不确认）：会结束一段人生、
//! 这段人生记下的记忆清掉恢复不了的才问。2026-11-17 项目主人本机验收第 25 条（W-1211）：没人格的会话里 `/life new` 不问、直接发（核心回一句
//! 先选人格）；有人格的先问 `life.status`，有在过的才说「先结束现在这段」；没人格的会话里 `/life kill` 写清结束的是哪个人格的（照 `life.list`）。
//! 判断在 `lib/life.js` 的 `lifeConfirm`，这里只问核心、弹卡。

import { t } from '../util/res.js';
import { lifeAsk, lifeConfirm, lifeState, livesOf } from '../lib/life.js';
import { askFirst } from './ask.js';

/** @typedef {import('./app.js').App} App */

/** 正看着的会话的人格（会话状态的，没读进来的照会话表；没有的 `null`） @param {App} app */
function personaHere(app) {
  const id = app.current;
  if (!id) return null;
  return app.store.sessions.get(id)?.view.status?.persona ?? app.store.index.get(id)?.persona ?? null;
}

/**
 * 交回能不能发：别的命令、`/life` 别的几种直接过；问核心出了错的（旧核心没有 `life.status`、`life.list`）照原来的问法问。
 * @param {App} app @param {string} name @param {string|null} words
 */
export async function lifeAsked(app, name, words) {
  const which = lifeAsk(name, words);
  if (!which) return true;
  const persona = personaHere(app);
  /** @type {{kind: 'new'|'kill', name: string|null}|null} */
  let ask;
  try {
    const status = persona ? lifeState(await app.store.conn.request('life.status', { persona })).state : null;
    const lives = !persona && which === 'kill' ? livesOf(await app.store.conn.request('life.list', {})) : [];
    ask = lifeConfirm(which, { persona, status, lives });
  } catch {
    ask = { kind: which, name: null };
  }
  if (!ask) return true;
  const title = ask.name ? t(`life.${ask.kind}_title_of`, { name: ask.name }) : t(`life.${ask.kind}_title`);
  return askFirst({ title, text: t(`life.${ask.kind}_text`), yes: t(`life.${ask.kind}_yes`), danger: true });
}
