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
/** 群里一个人说的一句：被哪一轮收走的带 `turn` @param {number} seq @param {string} id @param {string} text @param {number} [turn] */
const said = (seq, id, text, turn) => ({ id: `m${seq}`, kind: 'user', at: AT, text, level: 'full', from: { kind: 'external', venue: VENUE, id, role: 'member' }, ...(turn ? { turn } : {}) });
/** 叫了 AI 的那一句（核心 FX-16：开了这一轮、并进正在进行的这一轮的那一条带 `trigger`） @param {number} seq @param {string} id @param {string} text @param {number} turn */
const asked = (seq, id, text, turn) => ({ ...said(seq, id, text, turn), trigger: true });
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
    asked(5, 'qq:20017', '@Miyu 你帮我看看今天天气', 6),
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
  const entries = [asked(5, 'qq:20017', '@Miyu 在吗', 6), g, thought, said(8, 'qq:20001', '插一句'), reply, end, asked(13, 'qq:20090', '@Miyu 再问一下', 14), ...herTurn(14)];
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

test('一轮收走一批群消息（im 隔一阵看一眼群，核心给每一条都记上那一轮）：只有带 trigger 的那一条画气泡，其余照旧收起（W-1250、FX-16）', () => {
  // 20、21、30、31 被第 40 轮一起收走，31 是开这一轮的那一条；22 单独开了第 23 轮
  const entries = [
    said(20, 'qq:20001', '闲聊一', 40),
    said(21, 'qq:20017', '闲聊二', 40),
    asked(22, 'qq:20090', '@Miyu 在吗', 23),
    ...herTurn(23),
    said(30, 'qq:20001', '闲聊三', 40),
    asked(31, 'qq:20017', '闲聊四', 40),
    ...herTurn(40),
  ];
  assert.deepEqual(shape(group(itemsOf(entries, null).items)), ['heard:2', '@Miyu 在吗', 'her', 'heard:1', '闲聊四', 'her']);
});

test('她正在答别人时来的、后来被别的轮收走的话不切开她的一轮（W-1250：原来前半块只剩时间线、回答掉到那句话后面）', () => {
  const [g, thought, reply, end] = herTurn(6);
  const entries = [asked(5, 'qq:20017', '@Miyu 在吗', 6), g, thought, said(8, 'qq:20001', '插一句', 30), reply, end, said(15, 'qq:20033', '再插一句', 30), ...herTurn(30)];
  const blocks = group(itemsOf(entries, null).items);
  assert.deepEqual(shape(blocks), ['@Miyu 在吗', 'her', 'heard:2', 'her']);
  assert.deepEqual(blocks[1].items.map((/** @type {any} */ it) => it.type), ['steps', 'reply', 'done'], '她的一轮还是一块：时间线、回答、收尾');
});

test('她正在答别人时有人叫她、排到后面单独答：不切开她这一轮，挪到后面照常画气泡，不收进「群里另有」', () => {
  const [g, thought, reply, end] = herTurn(6);
  const entries = [
    asked(5, 'qq:20017', '@Miyu 在吗', 6), g, thought, said(8, 'qq:20001', '闲聊', 30), asked(9, 'qq:20090', '@Miyu 我也问一下', 20), reply, end,
    ...herTurn(20), said(27, 'qq:20001', '闲聊二', 30), ...herTurn(30),
  ];
  const blocks = group(itemsOf(entries, null).items);
  assert.deepEqual(shape(blocks), ['@Miyu 在吗', 'her', 'heard:1', '@Miyu 我也问一下', 'her', 'heard:1', 'her']);
  assert.equal(blocks[1].items.length, 3, '她的一轮还是一块');
});

test('并进她正在答的这一轮的话照旧把这一轮切成两块，叫她的那一句不因此算成一批', () => {
  const [g, thought, reply, end] = herTurn(6);
  const blocks = group(itemsOf([asked(5, 'qq:20017', '@Miyu 在吗', 6), g, thought, asked(8, 'qq:20017', '补一句', 6), reply, end], null).items);
  assert.deepEqual(shape(blocks), ['@Miyu 在吗', 'her', '补一句', 'her']);
  assert.equal(blocks[3].cont, true);
});

test('这一轮刚开、她的第一步还没来：带着这一轮的话照常画气泡', () => {
  const entries = [said(2, 'qq:20001', '闲聊'), asked(5, 'qq:20017', '@Miyu 在吗', 6)];
  assert.deepEqual(shape(group(itemsOf(entries, null).items)), ['heard:1', '@Miyu 在吗']);
});

test('叫她的那一句后面、她的第一步以前来的旁听不隔在那一句和她的回答中间：这一轮已经开了，挪到这一轮后面', () => {
  const entries = [said(2, 'qq:20001', '早'), asked(5, 'qq:20017', '@Miyu 在吗', 6), said(7, 'qq:20001', '闲聊', 30), ...herTurn(6), said(20, 'qq:20033', '闲聊二', 30), ...herTurn(30)];
  assert.deepEqual(shape(group(itemsOf(entries, null).items)), ['heard:1', '@Miyu 在吗', 'her', 'heard:2', 'her']);
});

test('一轮开头只收了一条、却不是叫她的（没带 trigger）：照旧收起，不再照「一轮只收一条」猜成叫她的（FX-16）', () => {
  const entries = [said(2, 'qq:20001', '闲聊', 9), asked(5, 'qq:20017', '@Miyu 在吗', 6), ...herTurn(6), ...herTurn(9)];
  assert.deepEqual(shape(group(itemsOf(entries, null).items)), ['heard:1', '@Miyu 在吗', 'her', 'her']);
});

test('没下载进来的图片表情写成「[图片]」「[表情：狗头]」（FX-16 `media`）：表情、文件带名字，图片视频的文件名不写，认不得的照文件写', () => {
  const media = [{ kind: 'image', name: 'A1B2C3.jpg', size: 2048 }, { kind: 'sticker', name: '狗头' }, { kind: 'video' }, { kind: 'file', name: '<b>a.pdf</b>' }, { kind: 'card' }];
  const entries = [{ ...asked(5, 'qq:20017', '看这个', 6), media }, ...herTurn(6)];
  const [item] = itemsOf(entries, null).items;
  assert.deepEqual(item.media, ['[图片]', '[表情：狗头]', '[视频]', '[文件：<b>a.pdf</b>]', '[文件]']);
  assert.equal(item.trigger, true);
  const bare = itemsOf([said(2, 'qq:1', '')], null).items[0];
  assert.deepEqual([bare.media, bare.trigger], [[], false], '什么都没带时是空的');
});
