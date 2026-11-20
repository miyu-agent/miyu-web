// @ts-check
//! 群里旁听的话（W-1221，蓝图 `web.md`「群里旁听的话」）：平台上的人说了、没叫 AI 的（视图里 `from` 是 `external`、条目没有 `turn`）
//! 不一条条画成气泡，连着的几条收成一行，放在它们后面那一轮前面；叫 AI 的、AI 的回复照常画。条目照核心视图投影的写法（`view.md`）。

import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { itemsOf } from '../src/model/entries.js';
import { group } from '../src/model/group.js';
import { t } from '../src/util/res.js';

loadRes();

const AT = '2026-11-19T01:00:00.000Z';
const VENUE = 'qq:30003:group:777';
/** 群里一个人说的一句：叫了 AI 的带 `turn` @param {number} seq @param {string} id @param {string} text @param {number} [turn] */
const said = (seq, id, text, turn) => ({ id: `m${seq}`, kind: 'user', at: AT, text, level: 'full', from: { kind: 'external', venue: VENUE, id, role: 'member' }, ...(turn ? { turn } : {}) });
/** 她的一轮：一段时间线、回答、收尾 @param {number} turn */
const herTurn = (turn) => [
  { id: `g${turn}.0`, kind: 'group', turn, at: AT, steps: [`b${turn}.0`], summary: [{ text: '1 次思考' }] },
  { id: `b${turn}.0`, kind: 'thought', group: `g${turn}.0`, turn, at: AT, text: '想一想' },
  { id: `b${turn + 3}.0`, kind: 'reply', turn, at: AT, text: '好的', persona: null },
  { id: `e${turn + 5}`, kind: 'end', turn, at: AT, reason: 'completed' },
];
/** 块的样子：旁听的写 `heard:N`，人话写正文，她的一轮写 `her` */
const shape = (/** @type {any[]} */ blocks) => blocks.map((b) => (b.kind === 'overheard' ? `heard:${b.item.count}` : b.kind === 'user' ? b.item.text : b.kind));

test('连着的旁听收成一行，放在叫 AI 的那句和她那一轮前面；叫 AI 的、她的回复照常画', () => {
  const entries = [
    said(2, 'qq:20001', '今晚谁值班'),
    said(3, 'qq:20017', '我昨天值过了'),
    said(4, 'qq:20001', '那就老王吧'),
    said(5, 'qq:20017', '@Miyu 你帮我看看今天天气', 6),
    ...herTurn(6),
    said(12, 'qq:20033', '谢谢'),
    said(13, 'qq:20001', '哈哈'),
  ];
  const blocks = group(itemsOf(entries, null).items);
  assert.deepEqual(shape(blocks), ['heard:3', '@Miyu 你帮我看看今天天气', 'her', 'heard:2']);
  // 点开看的是原来那几条，每条带发言人（照群友名字那一行的写法）
  const first = blocks[0].item;
  assert.deepEqual(first.items.map((/** @type {any} */ it) => [it.text, it.speaker.name]), [['今晚谁值班', 'qq:20001'], ['我昨天值过了', 'qq:20017'], ['那就老王吧', 'qq:20001']]);
  assert.equal(t('overheard', { count: first.count }), '群里另有 3 条');
});

test('她这一轮还没结束时来的旁听不切开她的一轮：挪到这一轮后面', () => {
  const [g, thought, reply, end] = herTurn(6);
  const entries = [said(5, 'qq:20017', '@Miyu 在吗', 6), g, thought, said(8, 'qq:20001', '插一句'), reply, end, said(13, 'qq:20090', '@Miyu 再问一下', 14), ...herTurn(14)];
  const blocks = group(itemsOf(entries, null).items);
  assert.deepEqual(shape(blocks), ['@Miyu 在吗', 'her', 'heard:1', '@Miyu 再问一下', 'her']);
  assert.equal(blocks[1].cont, false, '她的一轮一块，没被切成两块');
});

test('编号照这一串的第一条：后面又来一条，那一行还是同一个（点开的不收回去）', () => {
  const two = group(itemsOf([said(2, 'qq:1', '一'), said(3, 'qq:2', '二')], null).items);
  const three = group(itemsOf([said(2, 'qq:1', '一'), said(3, 'qq:2', '二'), said(4, 'qq:3', '三')], null).items);
  assert.equal(two[0].key, three[0].key);
  assert.equal(three[0].item.count, 3);
});

test('本机会话、子代理发来的话不收：只收平台上的人没叫 AI 的', () => {
  const entries = [
    { id: 'm1', kind: 'user', at: AT, text: '你说的', turn: 2 },
    ...herTurn(2),
    { id: 'm9', kind: 'user', at: AT, text: '子代理说的', from: { kind: 'session', id: 's1' } },
  ];
  assert.deepEqual(shape(group(itemsOf(entries, null).items)), ['你说的', 'her', '子代理说的']);
});

test('「群里另有 N 条」和群消息同一侧（2026-11-20 主人验收第 7 条，W-1241）：靠右、不缩进到她那一列，和气泡一样各空一行', () => {
  const css = readFileSync(new URL('../styles/chat.css', import.meta.url), 'utf8');
  const rule = (/** @type {string} */ sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.+]/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';
  const heard = rule('.note.is-overheard');
  assert.match(heard, /justify-items: end/, '靠右，同群消息的气泡');
  assert.match(heard, /padding-left: 0/, '不缩进到她的内容那一列');
  assert.match(heard, /padding-bottom: calc\(27px \* var\(--space\)\)/, '下面空的同一条群消息（.user-message）');
  assert.match(rule('.user-message'), /padding-bottom: calc\(27px \* var\(--space\)\)/, '群消息下面空的还是这么多');
  assert.match(rule('.assistant-message + .note.is-overheard'), /margin-top: 0/, '跟在她的回复后面不往上提（那是她的提示行的写法）');
});
