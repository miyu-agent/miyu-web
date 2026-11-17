// @ts-check
//! 推演人生（核心设计 70，LF-1 到 LF-9；蓝图 `web.md`「推演人生」）：会话表里认人生会话、结束了没有，`/life` 哪几种要先问，
//! `life.status` 写成一行字。纯函数。
//!
//! 人生会话不进左栏和全部会话（2026-11-14 项目主人：「和别的会话混在一起的话，万一误删了不是很尴尬？」「还记得那个 webui 左侧边栏那个
//! 更多吗？可以放那里」）：从左栏「更多」的「推演人生」打开（软件包 `life`）。

/** 会话表那一项是不是人生会话（`session.list` 的 `life: true`）。 @param {{life?: boolean}|null|undefined} entry */
export const isLife = (entry) => entry?.life === true;

/** 结束了的人生会话（`life_ended: true`）：封存了，只读。 @param {{life?: boolean, life_ended?: boolean}|null|undefined} entry */
export const lifeEnded = (entry) => isLife(entry) && entry?.life_ended === true;

/**
 * `/life` 的哪几种发之前先问（2026-11-14 项目主人：网页确认，终端不确认）：`kill` 结束这段人生、`new` 先结束再开，都会清掉这段人生的记忆、
 * 恢复不了；`/life`、`pause`、`resume` 不问。交回问的是哪一种，不用问的是 `null`。
 * @param {string} name 命令名（不带 `/`） @param {string|null} words 后面的字
 * @returns {'kill'|'new'|null}
 */
export function lifeAsk(name, words) {
  if (name.toLowerCase() !== 'life') return null;
  const first = (words ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return first === 'kill' || first === 'new' ? first : null;
}

/**
 * `life.status` 的回应写成状态那一行的几样（人格设置、「推演人生」的列表）：`state` 照原样，`next` 是下一轮开始的时刻（只有在跑的有），
 * `doing` 是她最近写的「现在在干嘛」那一句（没有的 `null`）。认不得的当 `none`。
 * @param {any} got
 * @returns {{state: 'none'|'running'|'paused'|'ended', session: string|null, next: Date|null, doing: string|null}}
 */
export function lifeState(got) {
  const state = ['running', 'paused', 'ended'].includes(got?.state) ? got.state : 'none';
  const next = state === 'running' && typeof got?.next === 'string' ? new Date(got.next) : null;
  return {
    state,
    session: typeof got?.session === 'string' ? got.session : null,
    next: next && !Number.isNaN(next.getTime()) ? next : null,
    doing: typeof got?.doing?.text === 'string' && got.doing.text.trim() ? got.doing.text.trim() : null,
  };
}

/**
 * 开关该是开着还是关着（人格设置）：在跑的开着；暂停、结束、没有的关着。拨开时做哪一样：没有的、结束了的 `start`（开一条新的，先问一句），
 * 暂停着的 `resume`；拨关时在跑的 `pause`（关掉算暂停，不是结束，设计 70 第二节第 10 条）。
 * @param {'none'|'running'|'paused'|'ended'} state @param {boolean} on 拨成开还是关
 * @returns {'start'|'resume'|'pause'|null} 什么都不用做的是 `null`
 */
export function lifeToggle(state, on) {
  if (on) return state === 'running' ? null : state === 'paused' ? 'resume' : 'start';
  return state === 'running' ? 'pause' : null;
}

/**
 * 没结束的一段人生（核心 LF-12 的 `life.list`、光打 `/life` 回的 `lives` 的一项）：`life.status` 的样子，多带人格的编号、名字、`busy`（这一轮正在跑；
 * 核心 WK-2 起不叫 `awake`）。第几轮（`rounds`）不读：头不显示。
 * @typedef {{session: string, persona: string, name: string, state: 'running'|'paused', next: Date|null, busy: boolean, doing: string|null}} Life
 */

/**
 * 读 `lives`：缺会话、缺人格、状态不是在跑、暂停的丢掉；没有名字的写编号。
 * @param {any} got `life.list`、`command.run` 的回应 @returns {Life[]}
 */
export function livesOf(got) {
  const list = Array.isArray(got?.lives) ? got.lives : [];
  return list.flatMap((/** @type {any} */ x) => {
    if (typeof x?.session !== 'string' || typeof x?.persona !== 'string' || !['running', 'paused'].includes(x?.state)) return [];
    const s = lifeState(x);
    const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim() : x.persona;
    return [{ session: x.session, persona: x.persona, name, state: /** @type {Life['state']} */ (s.state), next: s.next, busy: x.busy === true, doing: s.doing }];
  });
}

/**
 * 她自己结束了、还没人看过的人生（`life.list` 的 `ended_unseen`，核心 LF-14）：会话、人格、名字（那时不带人格的是 `null`）、结束的时刻。
 * @param {any} got @returns {{session: string, persona: string|null, name: string|null, at: string|null}[]}
 */
export function endedUnseenOf(got) {
  const list = Array.isArray(got?.ended_unseen) ? got.ended_unseen : [];
  return list.flatMap((/** @type {any} */ x) => (typeof x?.session === 'string' ? [{
    session: x.session,
    persona: typeof x.persona === 'string' ? x.persona : null,
    name: typeof x.name === 'string' && x.name ? x.name : null,
    at: typeof x.at === 'string' ? x.at : null,
  }] : []));
}

/**
 * 光打 `/life`（2026-11-17 项目主人本机验收第 29 条「快速跳转人生会话」）：一条都没有的照回执，一条直接跳过去，几条列出来让人挑。
 * @param {Life[]} lives @returns {{kind: 'none'}|{kind: 'open', session: string}|{kind: 'pick'}}
 */
export function lifeJump(lives) {
  if (!lives.length) return { kind: 'none' };
  return lives.length === 1 ? { kind: 'open', session: lives[0].session } : { kind: 'pick' };
}

/**
 * 时刻写成「14:05」，明天的「明天 14:05」，再往后「11/16 14:05」（浏览器本地时区）。
 * @param {Date} at @param {Date} now @param {(key: string, fields?: any) => string} t 认 `tomorrow`（带 `time`）
 */
export function clockText(at, now, t) {
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const day = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(at) - day(now)) / 86400000);
  if (diff <= 0) return hm;
  if (diff === 1) return t('tomorrow', { time: hm });
  return `${at.getMonth() + 1}/${at.getDate()} ${hm}`;
}

/**
 * 一段人生右边那一小格：这一轮正在跑的「这一轮正在跑」，在跑的「进行中 · 下次继续 14:05」（没定下一次的「进行中」），暂停的「已暂停」。
 * 不写第几轮（核心 LF-14：`rounds` 头不显示）。
 * @param {Pick<Life, 'state'|'next'|'busy'>} life @param {Date} now @param {(key: string, fields?: any) => string} t 认 `busy`、`running`、`paused`、`next`（带 `time`）、`tomorrow`
 */
export function lifeSide(life, now, t) {
  if (life.state === 'paused') return t('paused');
  if (life.busy) return t('busy');
  return life.next ? t('next', { time: clockText(life.next, now, t) }) : t('running');
}

/**
 * 空会话里光打 `/life`（2026-11-17 核心实测：原来说「需要先开始会话」）：不用先开会话，照 `life.list` 列。带字的照旧要先开会话。
 * @param {{kind: string, name?: string, words?: string|null}} line `read` 认出来的那一行
 */
export const emptyLife = (line) => line.kind === 'later' && line.name?.toLowerCase() === 'life' && !line.words;

/**
 * `/life new`、`/life kill` 发之前问不问、问什么（2026-11-17 项目主人本机验收第 25 条）：会结束一段人生的才问。
 * - `new`：没人格的会话不问（核心回一句先选人格，什么都不动）；有人格的有在过的（在跑、暂停）才问「先结束现在这段」，没有的直接开。
 * - `kill`：有人格的有在过的才问；没人格的会话照所有人格找（核心照办的规矩）：只有一个的问，写上是哪个人格的（`name`）；一个都没有、好几个的核心不动，不问。
 * 不用问的交 `null`。
 * @param {'new'|'kill'} which
 * @param {{persona: string|null, status: 'none'|'running'|'paused'|'ended'|null, lives: Life[]}} now 这个会话的人格、它的 `life.status`、没人格时的 `life.list`
 * @returns {{kind: 'new'|'kill', name: string|null}|null}
 */
export function lifeConfirm(which, now) {
  const living = now.status === 'running' || now.status === 'paused';
  if (now.persona) return living ? { kind: which, name: null } : null;
  if (which === 'new') return null;
  return now.lives.length === 1 ? { kind: 'kill', name: now.lives[0].name } : null;
}
