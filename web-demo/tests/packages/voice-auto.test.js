// @ts-check
//! 自动朗读（软件包 `voice`，蓝图 `web.md`「语音」第 3、4 条，todolist 第 14 条，W-1205）：答完一轮只念最新那一轮，末尾的参考链接、
//! 网址不念。整个包在一个假的页面里跑：总线上有 `tts`，`tts.synthesize` 记下交来的字，播放器记下放了哪一句。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../../packages/voice/index.js';
import { replyOf, latestReply } from '../../src/model/reply.js';
import { readable } from '../../packages/voice/readable.js';

/** 够 `lib/dom.js` 的 `h`、`icon` 用的假节点 */
class FakeNode {
  constructor() {
    /** @type {any[]} */
    this.children = [];
    this.attrs = new Map();
    this.style = { setProperty() {}, removeProperty() {} };
    this.dataset = {};
    this.className = '';
    this.classList = { toggle() {}, add() {}, remove() {} };
    this.isConnected = true;
    this.click = () => {};
  }
  setAttribute(/** @type {string} */ k, /** @type {string} */ v) { this.attrs.set(k, v); }
  addEventListener(/** @type {string} */ type, /** @type {() => void} */ fn) { if (type === 'click') this.click = fn; }
  append(/** @type {any[]} */ ...kids) { this.children.push(...kids); }
  replaceChildren(/** @type {any[]} */ ...kids) { this.children = kids; }
}

/** 装上假的页面、假的播放器，跑完还原。 @param {() => Promise<void>} body */
async function withPage(body) {
  /** @type {Record<string, any>} */
  const fakes = {
    Node: FakeNode,
    document: {
      createElement: () => new FakeNode(),
      createElementNS: () => new FakeNode(),
      createTextNode: (/** @type {string} */ text) => Object.assign(new FakeNode(), { text }),
      querySelectorAll: () => [],
    },
    Audio: class {
      constructor(/** @type {string} */ url) { this.url = url; this.paused = true; /** @type {any} */ this.onended = null; /** @type {any} */ this.onerror = null; }
      play() { this.paused = false; played.push(this.url); setTimeout(() => this.onended?.(), 0); return Promise.resolve(); }
      pause() { this.paused = true; }
    },
  };
  /** @type {string[]} */
  const played = [];
  const keep = Object.fromEntries(Object.keys(fakes).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, v] of Object.entries(fakes)) Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });
  try {
    await body.call({ played });
  } finally {
    for (const [k, d] of Object.entries(keep)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[/** @type {any} */ (k)];
    }
  }
}

/** 一个会话的正文条目（`itemsOf` 交的样子） */
function session() {
  /** @type {any[]} */
  const items = [];
  let n = 0;
  return {
    items,
    user: (/** @type {number} */ turn, /** @type {string} */ text) => items.push({ type: 'user', key: `e${++n}`, turn, text }),
    reply: (/** @type {number} */ turn, /** @type {string} */ text) => items.push({ type: 'reply', key: `e${++n}`, turn, text, streaming: false }),
    tool: (/** @type {number} */ turn) => items.push({ type: 'tool', key: `e${++n}`, turn }),
  };
}

/** 跑起语音包：交回「答完了一轮」和记下的合成、放过的字。 @param {ReturnType<typeof session>} s @param {string[]} played */
async function boot(s, played) {
  /** @type {string[]} */
  const synthesized = [];
  /** @type {Map<string, string>} */
  const blobs = new Map();
  /** @type {((id: string, what: string) => void)[]} */
  const listeners = [];
  /** @type {string[]} */
  const said = [];
  /** @type {Record<string, any>} */
  const mounts = {};
  const ctx = {
    text: (/** @type {string} */ p) => p,
    config: {},
    core: {
      request: async (/** @type {string} */ method, /** @type {any} */ p) => {
        if (method === 'subscribe') return { names: [{ name: 'tts', kind: 'provides', ready: true }] };
        if (method === 'bus.call' && p.method === 'synthesize') {
          synthesized.push(p.params.text);
          return { audio: `blob-${synthesized.length}`, media_type: 'audio/mpeg' };
        }
        return {};
      },
      onPush() {},
      pushes: new Set(),
    },
    host: { blobUrl: async (/** @type {string} */ blob) => { blobs.set(`url:${blob}`, synthesized[Number(blob.slice(5)) - 1]); return `url:${blob}`; } },
    composer: { say: (/** @type {string} */ text) => said.push(text) },
    slots: { mount: (/** @type {string} */ _slot, /** @type {any} */ spec) => { mounts[spec.id] = spec; return () => {}; } },
    effect: (/** @type {() => any} */ fn) => fn(),
    sessions: { onAttention: (/** @type {any} */ fn) => { listeners.push(fn); return () => {}; } },
    chat: {
      current: () => 's1',
      persona: () => null,
      turnText: (/** @type {number|undefined} */ turn) => replyOf(s.items, turn)?.text ?? '',
      latestReply: () => latestReply(s.items),
    },
  };
  apply(ctx);
  await new Promise((r) => setTimeout(r, 0));
  /** 答完一轮，等念完 */
  const done = async () => {
    for (const fn of listeners) fn('s1', 'done');
    for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const heard = () => played.map((u) => blobs.get(u) ?? u);
  // 点一下右上角（`stage.tools`）的自动朗读开关
  mounts['voice-auto'].render().click();
  return { done, synthesized, heard, said };
}

test('自动朗读：第二轮答完只念第二轮，不从第一轮念起；最新一轮没开口的不退回去念上一轮（todolist 第 14 条，W-1205）', async () => {
  await withPage(async function () {
    const s = session();
    const page = await boot(s, this.played);
    s.user(1, '你好');
    s.reply(1, '第一轮的回答写在这里，有点长。这是第一轮说的第二句话，也够长。');
    await page.done();
    assert.deepEqual(page.heard(), ['第一轮的回答写在这里，有点长。', '这是第一轮说的第二句话，也够长。']);
    s.user(2, '再说点');
    s.reply(2, '第二轮说的是另外一件别的事情。这是第二轮的最后那一句话，完了。');
    await page.done();
    assert.deepEqual(page.heard().slice(2), ['第二轮说的是另外一件别的事情。', '这是第二轮的最后那一句话，完了。']);
    // 第三轮只调了工具、没开口就停了：什么都不念
    s.user(3, '查一下');
    s.tool(3);
    await page.done();
    assert.equal(page.heard().length, 4, JSON.stringify(page.heard()));
    // 同一轮又报一次答完：不再从头念
    await page.done();
    assert.equal(page.heard().length, 4);
  });
});

test('自动朗读：末尾的参考链接那一段不念，网址不念原文（todolist 第 14 条，W-1205）', async () => {
  await withPage(async function () {
    const s = session();
    const page = await boot(s, this.played);
    s.user(1, '搜一下');
    s.tool(1);
    s.reply(1, [
      '今天北京晴，最高气温二十度。详见 https://weather.example.com/beijing?day=1&unit=c 的预报。',
      '',
      '**参考链接：**',
      '- [北京天气预报 - 中国天气网](https://www.weather.com.cn/weather/101010100.shtml?from=a)',
      '- [Beijing weather](https://example.org/w?q=beijing;x=1)',
    ].join('\n'));
    await page.done();
    const all = page.synthesized.join('|');
    assert.ok(!/https?:|\?day|参考链接|中国天气网|Beijing weather/.test(all), all);
    assert.ok(all.includes('今天北京晴') && all.includes('weather.example.com'), all);
    assert.deepEqual(page.said, []);
  });
});

test('整理回答：各种写法的参考链接段去掉，正文里的链接留字（W-1205）', () => {
  // 小标题 + 带说明的链接行
  assert.equal(readable('正文一句。\n\n## 参考资料\n1. [甲](https://a.com/x) — 甲的报道\n2. [乙](https://b.com) 乙的说明'), '正文一句。');
  // 没有小标题、只有链接的几行
  assert.equal(readable('正文一句。\n\n- https://a.com/x?y=1\n- <https://b.com>\n[1]: https://c.com'), '正文一句。');
  // 一行里的小标题加几个链接；英文的 Sources
  assert.equal(readable('正文。\n来源：[甲](https://a.com)、[乙](https://b.com)'), '正文。');
  assert.equal(readable('Answer here.\n\n---\n\nSources:\n- [A](https://a.com)\n- [B](https://b.com)'), 'Answer here.');
  // 正文里的链接留字，引用角标、脚注角标不念，图片念替代文字，裸网址念域名
  assert.equal(readable('看[官网](https://x.com/a?b)的说明[1](https://y.com)[^2]，![一张图](https://i.com/p.png)，还有 https://www.z.com/q?x=1。'),
    '看官网的说明，一张图，还有 z.com。');
  // 结尾是说明带链接的列表、没有小标题：是正文，照念（只换掉网址）
  assert.equal(readable('推荐两个：\n- [甲](https://a.com)：好用，适合新手\n- [乙](https://b.com)：快'), '推荐两个：\n- 甲：好用，适合新手\n- 乙：快');
  // 整段都是链接：照念链接的字
  assert.equal(readable('- [甲](https://a.com)\n- [乙](https://b.com)'), '- 甲\n- 乙');
  // 代码块里的不动
  assert.equal(readable('看代码：\n```\ncurl https://a.com/x?y\n```'), '看代码：\n```\ncurl https://a.com/x?y\n```');
});

test('挑这一轮的正文：没轮号的只算它自己；最新一轮没开口是 null（W-1205）', () => {
  const items = [
    { type: 'reply', key: 'a', turn: null, text: '老的一段' },
    { type: 'reply', key: 'b', turn: null, text: '老的另一段' },
  ];
  assert.deepEqual(replyOf(items), { turn: null, text: '老的另一段' });
  assert.deepEqual(latestReply([...items, { type: 'user', key: 'c', turn: 4, text: '问' }]), null);
  const turns = [
    { type: 'reply', key: 'a', turn: 1, text: '一' },
    { type: 'reply', key: 'b', turn: 2, text: '二上' },
    { type: 'tool', key: 'c', turn: 2 },
    { type: 'reply', key: 'd', turn: 2, text: '二下', streaming: true },
  ];
  assert.deepEqual(latestReply(turns), { turn: 2, text: '二上\n\n二下', last: 'd' });
  assert.deepEqual(replyOf(turns, 1), { turn: 1, text: '一' });
});
