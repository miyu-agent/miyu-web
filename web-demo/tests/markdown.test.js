// @ts-check
//! 她的回答的 Markdown（蓝图 `web.md`「她的回答：Markdown」，照旧版 `app.js:4246-5083`、`8059-8128`、`highlight.js`）：
//! 块和行内照先后认出来的树、在收的时候怎么补齐、代码上色的保险。只测纯的那一半（解析、补齐、分词），DOM 在浏览器里看。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadRes } from './support.js';
import { parse } from '../src/markdown/parse.js';
import { inline, filePath } from '../src/markdown/inline.js';
import { stabilize, liveBlocks } from '../src/markdown/stream.js';
import { tokens } from '../src/markdown/highlight.js';

loadRes();

const BR = { type: 'br' };
const para = (...kids) => ({ type: 'para', kids });
const auto = (text, href = text) => ({ type: 'autolink', href, text });

// ── 块 ──

test('段落：空行分段，软换行照换行；\\r\\n 当 \\n', () => {
  assert.deepEqual(parse('a\nb\n\n\nc'), [para('a', BR, 'b'), para('c')]);
  assert.deepEqual(parse('a\r\nb'), [para('a', BR, 'b')]);
  assert.deepEqual(parse('  \n\n'), []);
});

test('围起来的代码：语言照 [\\w.+-]{1,40}，没写的空着；收齐了的 closed，没收齐的到末尾', () => {
  assert.deepEqual(parse('```rust\nfn main() {}\n\n  x\n```'), [{ type: 'code', lang: 'rust', text: 'fn main() {}\n\n  x', closed: true }]);
  assert.deepEqual(parse('```\n# 不是标题\n```'), [{ type: 'code', lang: '', text: '# 不是标题', closed: true }]);
  assert.deepEqual(parse('``` c++ \nint a;'), [{ type: 'code', lang: 'c++', text: 'int a;', closed: false }]);
  assert.equal(parse(`\`\`\`${'a'.repeat(41)}\nx\n\`\`\``)[0].lang, '', '超过 40 个字的语言不认，还是代码');
  // 带别的字的收尾不算收尾
  assert.deepEqual(parse('```\na\n```js\nb\n```'), [{ type: 'code', lang: '', text: 'a\n```js\nb', closed: true }]);
});

test('~~~ 不算围栏；``` 后面跟着别的字的也不算', () => {
  assert.deepEqual(parse('~~~\nx\n~~~').map((b) => b.type), ['para']);
  assert.deepEqual(parse('```js title\nx'), [para('```js title', BR, 'x')]);
});

test('独占几行的公式：$$…$$、\\[…\\]，一行里的也认；没收齐的照段落写', () => {
  assert.deepEqual(parse('$$\nx^2\n+ 1\n$$'), [{ type: 'math', tex: 'x^2\n+ 1', raw: '$$\nx^2\n+ 1\n$$' }]);
  assert.deepEqual(parse('$$e=mc^2$$'), [{ type: 'math', tex: 'e=mc^2', raw: '$$e=mc^2$$' }]);
  assert.deepEqual(parse('\\[\na\n\\]\n后面'), [{ type: 'math', tex: 'a', raw: '\\[\na\n\\]' }, para('后面')]);
  assert.deepEqual(parse('```math\nx^2 + 1\n```'), [{ type: 'math', tex: 'x^2 + 1', raw: '```math\nx^2 + 1\n```' }], '```math 是公式（2026-10-19）');
  assert.equal(parse('```math\nx^2')[0].type, 'code', '还没收完的照代码');
  assert.equal(parse('```latex\nx^2\n```')[0].type, 'code', 'latex 照源码');
  assert.deepEqual(parse('$$\nx^2'), [para('$$', BR, 'x^2')]);
});

test('表格：表头加分隔行，:---: 定对齐；少的格补空，多的丢掉；\\| 和代码里的 | 不分格', () => {
  const [table] = parse('| 名 | 左 | 中 | 右 |\n| --- | :--- | :---: | ---: |\n| a | `x|y` | c\\|d |\n| 1 | 2 | 3 | 4 | 5 |');
  assert.deepEqual(table, {
    type: 'table',
    align: ['', 'left', 'center', 'right'],
    head: [['名'], ['左'], ['中'], ['右']],
    rows: [
      [['a'], [{ type: 'code', text: 'x|y' }], ['c|d'], []],
      [['1'], ['2'], ['3'], ['4']],
    ],
  });
});

test('表格：列数对不上、分隔行不够三个 - 的不是表格；表格到没有 | 的一行为止', () => {
  assert.equal(parse('| a | b |\n| --- |')[0].type, 'para');
  assert.equal(parse('| a |\n| -- |')[0].type, 'para');
  const blocks = parse('a | b\n--- | ---\n1 | 2\n后面的字');
  assert.deepEqual(blocks.map((b) => b.type), ['table', 'para']);
  assert.equal(blocks[0].rows.length, 1);
});

test('分隔线：三个以上的 *、-、_，中间可以有空格；段落碰到它断开', () => {
  assert.deepEqual(parse('***\n- - -\n_____'), [{ type: 'hr' }, { type: 'hr' }, { type: 'hr' }]);
  assert.deepEqual(parse('字\n---'), [para('字'), { type: 'hr' }]);
  assert.equal(parse('--')[0].type, 'para');
});

test('标题：# 是 h2，往下顺延，最多 h6；# 后面要空格', () => {
  assert.deepEqual(parse('# 一\n## 二\n##### 五\n###### 六'), [
    { type: 'heading', level: 2, kids: ['一'] },
    { type: 'heading', level: 3, kids: ['二'] },
    { type: 'heading', level: 6, kids: ['五'] },
    { type: 'heading', level: 6, kids: ['六'] },
  ]);
  assert.equal(parse('#不是')[0].type, 'para');
  assert.equal(parse('####### 七个')[0].type, 'para');
  assert.deepEqual(parse('字\n# 标题'), [para('字'), { type: 'heading', level: 2, kids: ['标题'] }]);
});

test('无序列表：-、*、+ 混着写算一张；缩进到内容那一列的是子列表（2026-10-23 起能套）；没缩进又不是项的一行就结束', () => {
  const ul = (...items) => ({ type: 'list', ordered: false, task: false, items });
  assert.deepEqual(parse('- a\n* **b**\n  + c\n后面'), [
    ul({ check: null, kids: ['a'] }, { check: null, kids: [{ type: 'strong', kids: ['b'] }], blocks: [ul({ check: null, kids: ['c'] })] }),
    para('后面'),
  ]);
});

test('列表能套：三层、有序套无序、任务列表套；续行接在字后面；空行以后还缩进着的是第二段；子项的代码块', () => {
  const ul = (...items) => ({ type: 'list', ordered: false, task: false, items });
  const it = (kids, blocks) => (blocks ? { check: null, kids, blocks } : { check: null, kids });
  assert.deepEqual(parse('- 一\n  - 二\n    - 三\n- 四'), [
    ul(it(['一'], [ul(it(['二'], [ul(it(['三']))]))]), it(['四'])),
  ]);
  assert.deepEqual(parse('1. 安装\n   - 下载\n   - 解压\n2. 使用'), [
    { type: 'list', ordered: true, task: false, items: [it(['安装'], [ul(it(['下载']), it(['解压']))]), it(['使用'])] },
  ]);
  assert.deepEqual(parse('- [x] 写\n  - [ ] 改'), [
    { type: 'list', ordered: false, task: true, items: [{ check: true, kids: ['写'], blocks: [{ type: 'list', ordered: false, task: true, items: [{ check: false, kids: ['改'] }] }] }] },
  ]);
  // 续行：缩进到内容那一列、缩进不够但比记号深的都接在字后面
  assert.deepEqual(parse('- 第一行\n  第二行\n - 第三行'), [ul(it(['第一行', BR, '第二行']), it(['第三行']))]);
  assert.deepEqual(parse('- 第一段\n\n  第二段\n- 下一项'), [ul(it(['第一段'], [para('第二段')]), it(['下一项']))]);
  assert.deepEqual(parse('- 代码：\n  ```js\n  a()\n  ```'), [ul(it(['代码：'], [{ type: 'code', lang: 'js', text: 'a()', closed: true }]))]);
  // 项之间空一行还是同一张；有序、无序换了是两张
  assert.equal(parse('- a\n\n- b').length, 1);
  assert.deepEqual(parse('- a\n1. b').map((b) => b.ordered), [false, true]);
  // 空行以后没缩进的段落不吃进去
  assert.deepEqual(parse('- a\n\n后面'), [ul(it(['a'])), para('后面')]);
});

test('任务列表：[ ]、[x]、[X]；混着普通项的整张还是任务列表', () => {
  assert.deepEqual(parse('- [ ] 买菜\n- [x] 做饭\n- [X] 洗碗\n- 普通'), [
    { type: 'list', ordered: false, task: true, items: [
      { check: false, kids: ['买菜'] },
      { check: true, kids: ['做饭'] },
      { check: true, kids: ['洗碗'] },
      { check: null, kids: ['普通'] },
    ] },
  ]);
});

test('有序列表：. 和 ) 都算，第一项的号照原样起（中间隔了段落的接着数），从 1 起的不写', () => {
  assert.deepEqual(parse('3. a\n4) b'), [
    { type: 'list', ordered: true, start: 3, task: false, items: [{ check: null, kids: ['a'] }, { check: null, kids: ['b'] }] },
  ]);
  assert.deepEqual(parse('1. a').map((b) => b.start), [undefined]);
  assert.deepEqual(parse('1. a\n\n- x\n\n2. b').filter((b) => b.ordered).map((b) => b.start ?? 1), [1, 2]);
});

test('引用：连着的 > 行合成一块，去掉 > 以后照整条回答认块（2026-10-23）', () => {
  assert.deepEqual(parse('> a\n>**b**\n> # 标题\n\n> c'), [
    { type: 'quote', blocks: [para('a', BR, { type: 'strong', kids: ['b'] }), { type: 'heading', level: 2, kids: ['标题'] }] },
    { type: 'quote', blocks: [para('c')] },
  ]);
  // 套着的引用、引用里的列表、代码块
  assert.deepEqual(parse('> 外\n> > 里\n>\n> - 一项\n>\n> ```bash\n> echo 1\n> ```'), [
    { type: 'quote', blocks: [
      para('外'),
      { type: 'quote', blocks: [para('里')] },
      { type: 'list', ordered: false, task: false, items: [{ check: null, kids: ['一项'] }] },
      { type: 'code', lang: 'bash', text: 'echo 1', closed: true },
    ] },
  ]);
  // 套太深的整段照行内
  const deep = parse('>'.repeat(12) + ' x');
  let b = deep[0], n = 0;
  while (b?.type === 'quote') { n += 1; b = b.blocks[0]; }
  assert.equal(n, 9);
  assert.equal(b.type, 'para');
});

test('独占一行的认领（以后的音视频卡片）：认领了的单独一块，段落在那里断开；每行只问一次', () => {
  const asked = [];
  const line = (l) => { asked.push(l); return l.endsWith('.mp4') ? `卡片:${l}` : null; };
  assert.deepEqual(parse('看这个\nhttps://a.com/v.mp4\n好看吧', { line }), [
    para('看这个'),
    { type: 'line', text: 'https://a.com/v.mp4', value: '卡片:https://a.com/v.mp4' },
    para('好看吧'),
  ]);
  assert.deepEqual(asked, ['看这个', 'https://a.com/v.mp4', '好看吧']);
});

// ── 行内 ──

test('<br>：不带属性的才换行，大小写、斜杠都行；带属性的、别的标签照字写', () => {
  assert.deepEqual(inline('a<br>b<BR/>c<br />d'), ['a', BR, 'b', BR, 'c', BR, 'd']);
  assert.deepEqual(inline('a<br class=x>b'), ['a<br class=x>b']);
  assert.deepEqual(inline('<script>alert(1)</script>'), ['<script>alert(1)</script>']);
  assert.deepEqual(inline('`<br>`'), [{ type: 'code', text: '<br>' }], '代码里的 <br> 照字');
});

test('反斜杠转义：\\`*_[]|~$ 照字写，别的反斜杠留着', () => {
  assert.deepEqual(inline('\\*a\\* \\_b\\_ \\$5 \\n'), ['*a* _b_ $5 \\n']);
});

test('公式：\\(…\\)、$$…$$、$…$；$ 两边是空格、后面跟数字的不算（价钱）', () => {
  assert.deepEqual(inline('\\(a+b\\) 和 $$c$$ 和 $d$'), [
    { type: 'math', tex: 'a+b', raw: '\\(a+b\\)' }, ' 和 ',
    { type: 'math', tex: 'c', raw: '$$c$$' }, ' 和 ',
    { type: 'math', tex: 'd', raw: '$d$' },
  ]);
  assert.deepEqual(inline('从 $5 涨到 $10'), ['从 $5 涨到 $10']);
  assert.deepEqual(inline('$5$10'), ['$5$10']);
  assert.deepEqual(inline('$ x$ 和 $x $'), ['$ x$ 和 $x $']);
  assert.deepEqual(inline('$a\nb$'), ['$a', BR, 'b$'], '不跨行');
});

test('行内代码：一对 ` 之间照字，里面的写法都不认；空的不算', () => {
  assert.deepEqual(inline('用 `**x** [a](http://b)` 吧'), ['用 ', { type: 'code', text: '**x** [a](http://b)' }, ' 吧']);
  assert.deepEqual(inline('``'), ['``']);
});

test('链接：只认 http、https、file；地址规范化；file 的路径解开转义', () => {
  assert.deepEqual(inline('[文档](https://a.com)'), [{ type: 'link', href: 'https://a.com/', kids: ['文档'] }]);
  assert.deepEqual(inline('[x](javascript:alert(1))'), ['[x](javascript:alert(1))']);
  assert.deepEqual(inline('[本机](file:///tmp/a b.md)'), [{ type: 'link', href: 'file:///tmp/a%20b.md', kids: ['本机'] }]);
  assert.equal(filePath('file:///tmp/a%20b.md'), '/tmp/a b.md');
  assert.equal(filePath('file:///tmp/100%'), '/tmp/100%', '解不开的照原样');
});

test('<地址>：认成链接；不是地址的照字', () => {
  assert.deepEqual(inline('见 <https://a.com/x>'), ['见 ', auto('https://a.com/x')]);
  assert.deepEqual(inline('<not a url>'), ['<not a url>']);
});

test('裸地址：句尾标点吐回去（连中文标点）；括号成对才留；前面粘着字母数字的不认', () => {
  assert.deepEqual(inline('见 https://a.com。'), ['见 ', auto('https://a.com', 'https://a.com/'), '。']);
  assert.deepEqual(inline('see https://a.com/x.'), ['see ', auto('https://a.com/x'), '.']);
  assert.deepEqual(inline('看 https://a.com/x）！'), ['看 ', auto('https://a.com/x'), '）！']);
  assert.deepEqual(inline('(https://en.wikipedia.org/wiki/Foo_(bar))'), ['(', auto('https://en.wikipedia.org/wiki/Foo_(bar)'), ')']);
  assert.deepEqual(inline('https://archlinux.org、AUR'), [auto('https://archlinux.org', 'https://archlinux.org/'), '、AUR']);
  assert.deepEqual(inline('xhttps://a.com'), ['xhttps://a.com']);
  assert.deepEqual(inline('**https://a.com/x**'), [{ type: 'strong', kids: [auto('https://a.com/x')] }]);
});

test('链接的字里不再套链接：裸地址、<地址> 照字', () => {
  assert.deepEqual(inline('[看 https://a.com 和 **<https://b.com>**](https://c.com)'), [
    { type: 'link', href: 'https://c.com/', kids: ['看 https://a.com 和 ', { type: 'strong', kids: ['<https://b.com>'] }] },
  ]);
});

test('「标题（地址）」独占一行：整行一个链接；标题像一句话的只让地址成链', () => {
  assert.deepEqual(inline('Rust 程序设计 (https://doc.rust-lang.org/book/)'), [{
    type: 'titled', href: 'https://doc.rust-lang.org/book/', indent: '', title: ['Rust 程序设计'],
    gap: ' ', open: '(', url: 'https://doc.rust-lang.org/book/', close: ')',
  }]);
  assert.deepEqual(inline('前面\n  **官网**（https://a.com）'), ['前面', BR, {
    type: 'titled', href: 'https://a.com/', indent: '  ', title: [{ type: 'strong', kids: ['官网'] }],
    gap: '', open: '（', url: 'https://a.com', close: '）',
  }]);
  assert.deepEqual(inline('先看文档。再试试 (https://a.com)'), ['先看文档。再试试 (', auto('https://a.com', 'https://a.com/'), ')']);
  assert.equal(inline('[a](https://a.com) (https://b.com)')[0].type, 'link', '结尾是 ] 的是 [字](地址)');
});

test('删除、粗、斜：~~、**、__、*、_；空的、只有空白的不算', () => {
  assert.deepEqual(inline('~~a~~ **b** __c__ *d* _e_'), [
    { type: 'del', kids: ['a'] }, ' ', { type: 'strong', kids: ['b'] }, ' ', { type: 'strong', kids: ['c'] }, ' ',
    { type: 'em', kids: ['d'] }, ' ', { type: 'em', kids: ['e'] },
  ]);
  assert.deepEqual(inline('** ** ~~ ~~'), ['** ** ~~ ~~']);
});

test('下划线照词内规矩：挨着字母数字的 _ 不开也不关', () => {
  assert.deepEqual(inline('snake_case_name'), ['snake_case_name']);
  assert.deepEqual(inline('_a_b'), ['_a_b']);
  assert.deepEqual(inline('变量_x_名'), ['变量_x_名']);
  assert.deepEqual(inline('_a_b_'), [{ type: 'em', kids: ['a_b'] }]);
  assert.deepEqual(inline('a __b__'), ['a ', { type: 'strong', kids: ['b'] }]);
  assert.deepEqual(inline('a__b__'), ['a__b__']);
});

test('嵌套：粗里的斜、链接里的粗', () => {
  assert.deepEqual(inline('**粗 *斜* 粗**'), [{ type: 'strong', kids: ['粗 ', { type: 'em', kids: ['斜'] }, ' 粗'] }]);
  assert.deepEqual(inline('[**a**](https://a.com)'), [{ type: 'link', href: 'https://a.com/', kids: [{ type: 'strong', kids: ['a'] }] }]);
  assert.deepEqual(inline('~~**_x_**~~'), [{ type: 'del', kids: [{ type: 'strong', kids: [{ type: 'em', kids: ['x'] }] }] }]);
});

test('嵌套最多 8 层：再深的整段照字', () => {
  assert.deepEqual(inline('**a**', 8), [{ type: 'strong', kids: ['a'] }]);
  assert.deepEqual(inline('**a**', 9), ['**a**']);
  assert.deepEqual(inline('**a**', 8)[0].kids, ['a'], '第 9 层的字照写');
  assert.deepEqual(inline('**a*b*c**', 8), [{ type: 'strong', kids: ['a*b*c'] }], '第 9 层里的写法不再认');
});

// ── 在收的时候 ──

test('补齐：没收齐的围栏补上结尾，最后一段里单数的 `、** 补齐', () => {
  assert.equal(stabilize('```js\nlet a'), '```js\nlet a\n```');
  assert.equal(stabilize('用 `sudo pac'), '用 `sudo pac`');
  assert.equal(stabilize('这是 **很重'), '这是 **很重**');
  assert.equal(stabilize('**a `b'), '**a `b`**');
  assert.equal(stabilize('完整的 `a` 和 **b**'), '完整的 `a` 和 **b**');
  assert.equal(stabilize(''), '');
});

test('补齐只看最后一段：前面段落、收齐了的围栏里的 ` 不算', () => {
  assert.equal(stabilize('单个 ` 在前面\n\n后面'), '单个 ` 在前面\n\n后面');
  assert.equal(stabilize('```\n` ` `\n```\n后面'), '```\n` ` `\n```\n后面');
  assert.equal(stabilize('```\n` ` `\n```\n后面 `x'), '```\n` ` `\n```\n后面 `x`');
});

test('补齐认的围栏和解析的一样：~~~ 不算开头，``` 后面跟着语言的不算收尾', () => {
  assert.equal(stabilize('~~~\nx'), '~~~\nx');
  assert.equal(stabilize('```\na\n```js\nb'), '```\na\n```js\nb\n```');
});

test('在收的回答：最后一块是代码的还在写（不算收齐）；前面收齐了的照旧', () => {
  const blocks = liveBlocks('```py\na\n```\n\n```js\nlet');
  assert.deepEqual(blocks.map((b) => [b.lang, b.text, b.closed]), [['py', 'a', true], ['js', 'let', false]]);
  assert.equal(liveBlocks('```py\na\n```').at(-1).closed, false, '收齐了但还在最后，也许还有字要来');
  assert.deepEqual(liveBlocks('**半截'), [para({ type: 'strong', kids: ['半截'] })]);
});

// ── 代码上色 ──

const require = createRequire(import.meta.url);
const Prism = require('../vendor/prism/prism.min.js');

/** 上色的树写成「颜色:字」一串，好比对；没上色的字照写。 */
const colors = (tree) => tree.flatMap((n) => (typeof n === 'string' ? [] : [`${n.role}:${plain(n.kids)}`]));
const plain = (nodes) => nodes.map((n) => (typeof n === 'string' ? n : plain(n.kids))).join('');

/** 换一个假的 Prism 跑一段，跑完换回来。 */
function withPrism(fake, fn) {
  const saved = globalThis.Prism;
  globalThis.Prism = fake;
  try { return fn(); } finally { globalThis.Prism = saved; }
}

test('上色：只调 Prism.tokenize，token 对到九种颜色；字一个不少', () => {
  withPrism(Prism, () => {
    const src = 'const x = f(1); // hi';
    const tree = tokens(src, 'js');
    assert.ok(tree);
    assert.equal(plain(tree), src);
    assert.deepEqual(colors(tree), ['k:const', 'o:=', 'f:f', 'p:(', 'n:1', 'p:)', 'p:;', 'c:// hi']);
  });
});

test('上色：别名照 markdown.json 找语法；大小写不论', () => {
  withPrism(Prism, () => {
    assert.ok(colors(tokens('fn main() {}', 'rs')).includes('k:fn'));
    assert.ok(colors(tokens('echo "a"', 'SH')).includes('s:"a"'));
  });
});

test('不上色：没写语言、text 这类、不认识的语言、超过 24000 字、没有 Prism', () => {
  withPrism(Prism, () => {
    assert.equal(tokens('let a', ''), null);
    assert.equal(tokens('let a', 'text'), null);
    assert.equal(tokens('let a', 'brainfuck'), null);
    assert.equal(tokens('let a', 'constructor'), null, '名单里的键照自己的，不走原型');
    // 一行一个字的代码分得快；一整行 24000 个字母 js 要分两秒多，别拿它测
    assert.equal(tokens(`${'a\n'.repeat(12000)}a`, 'js'), null);
    assert.ok(tokens('a\n'.repeat(12000), 'js'));
  });
  withPrism(undefined, () => assert.equal(tokens('let b', 'js'), null));
});

test('不上色：分词抛错、分出来的字和原文对不上的整块不上色', () => {
  const grammar = {};
  withPrism({ languages: { x: grammar }, tokenize: () => { throw new Error('坏了'); } }, () => {
    assert.equal(tokens('abc', 'x'), null);
  });
  const token = (type, content) => ({ type, content, alias: undefined });
  withPrism({ languages: { x: grammar }, tokenize: () => [token('keyword', 'ab'), 'X'] }, () => {
    assert.equal(tokens('abd', 'x'), null, '吞了、换了字');
  });
  withPrism({ languages: { x: grammar }, tokenize: () => [token('keyword', 'ab'), token('mystery', 'c'), 'd'] }, () => {
    assert.deepEqual(tokens('abcd', 'x'), [{ role: 'k', kids: ['ab'] }, 'c', 'd'], '不认识的 token 不包一层');
  });
});

test('上色：token 自己的种类对不上的看 alias（差异的增删行）', () => {
  withPrism(Prism, () => {
    assert.deepEqual(colors(tokens('-a\n+b', 'diff')), ['del:-a\n', 'ins:+b']);
  });
});

test('图片：![说明](地址)，地址照写（本机的由扩展点换成桥的地址）；缺了一截的照字', () => {
  assert.deepEqual(inline('看 ![图一](out/a.png) 这张'), ['看 ', { type: 'image', src: 'out/a.png', alt: '图一' }, ' 这张']);
  assert.deepEqual(inline('![](https://x.com/a.png)'), [{ type: 'image', src: 'https://x.com/a.png', alt: '' }]);
  assert.deepEqual(inline('![没收齐](a.png'), ['![没收齐](a.png']);
  assert.deepEqual(inline('![](有 空格.png)'), ['![](有 空格.png)']);
});

// ── 放行的标签、折叠块、脚注（第 1、2、3 条，2026-10-23 项目主人看到 <kbd>、<details> 原样写着） ──

test('成对、不带属性的 <kbd> 这几个画成标签，里面照行内；带属性的、不放行的、没配对的照字', () => {
  assert.deepEqual(inline('按 <kbd>Ctrl</kbd> + <KBD>S</KBD>'), ['按 ', { type: 'tag', tag: 'kbd', kids: ['Ctrl'] }, ' + ', { type: 'tag', tag: 'kbd', kids: ['S'] }]);
  assert.deepEqual(inline('H<sub>2</sub>O <mark>**重**</mark>'), ['H', { type: 'tag', tag: 'sub', kids: ['2'] }, 'O ', { type: 'tag', tag: 'mark', kids: [{ type: 'strong', kids: ['重'] }] }]);
  assert.deepEqual(inline('<kbd class="x">a</kbd>'), ['<kbd class="x">a</kbd>']);
  assert.deepEqual(inline('<span>a</span> <kbd>没收尾'), ['<span>a</span> <kbd>没收尾']);
  assert.deepEqual(inline('`<kbd>a</kbd>`'), [{ type: 'code', text: '<kbd>a</kbd>' }]);
  // <s> 和 <sub> 不混
  assert.deepEqual(inline('<s>删</s><sup>1</sup>'), [{ type: 'tag', tag: 's', kids: ['删'] }, { type: 'tag', tag: 'sup', kids: ['1'] }]);
});

test('脚注：[^名字]: 的一行从正文拿走，照定义的先后收在最后一块；缩进的下一行接着算；引用是 fnref', () => {
  const blocks = parse('正文[^a]，再一个[^b]。\n\n[^b]: 第二条\n[^a]: 第一条\n  接着一行\n\n后面的段落');
  assert.deepEqual(blocks, [
    para('正文', { type: 'fnref', id: 'a', raw: '[^a]' }, '，再一个', { type: 'fnref', id: 'b', raw: '[^b]' }, '。'),
    para('后面的段落'),
    { type: 'footnotes', items: [{ id: 'b', kids: ['第二条'] }, { id: 'a', kids: ['第一条', BR, '接着一行'] }] },
  ]);
  // 段落里的定义也断开段落；没有定义的引用照样是 fnref（造 DOM 时照原文写）
  assert.deepEqual(parse('一段\n[^1]: 定义'), [para('一段'), { type: 'footnotes', items: [{ id: '1', kids: ['定义'] }] }]);
  assert.deepEqual(parse('没定义[^x]'), [para('没定义', { type: 'fnref', id: 'x', raw: '[^x]' })]);
  // [^ 后面带空白的不是脚注
  assert.deepEqual(inline('[^a b]'), ['[^a b]']);
});

test('折叠块：<details> 到配对的 </details>，标题在同一行、下一行（隔空行也行）都认，里面照整条认块；能套着；没收尾的到末尾', () => {
  const summary = (s) => [s];
  assert.deepEqual(parse('<details>\n<summary>点开看更多</summary>\n\n藏起来的。\n\n- 一项\n</details>\n\n后面'), [
    { type: 'details', summary: summary('点开看更多'), blocks: [para('藏起来的。'), { type: 'list', ordered: false, task: false, items: [{ check: null, kids: ['一项'] }] }] },
    para('后面'),
  ]);
  assert.deepEqual(parse('<details><summary>外</summary>\n<details>\n\n<summary>里</summary>\n内容\n</details>\n外面的\n</details>'), [
    { type: 'details', summary: summary('外'), blocks: [{ type: 'details', summary: summary('里'), blocks: [para('内容')] }, para('外面的')] },
  ]);
  assert.deepEqual(parse('<details>\n没写标题'), [{ type: 'details', summary: null, blocks: [para('没写标题')] }]);
  // 带属性的、不独占一行的照字
  assert.deepEqual(parse('<details open>\n字\n</details>'), [para('<details open>', BR, '字'), para('</details>')]);
  // 折叠块里的脚注定义也收到最后
  assert.deepEqual(parse('<details>\n看[^n]\n[^n]: 注\n</details>'), [
    { type: 'details', summary: null, blocks: [para('看', { type: 'fnref', id: 'n', raw: '[^n]' })] },
    { type: 'footnotes', items: [{ id: 'n', kids: ['注'] }] },
  ]);
});

test('粗斜：***x***、___x___ 是粗体里套斜体；词内的 ___ 不算；混着粗、斜的照旧（2026-10-23）', () => {
  const bi = (...kids) => ({ type: 'strong', kids: [{ type: 'em', kids }] });
  assert.deepEqual(inline('***粗斜体***、___也是___'), [bi('粗斜体'), '、', bi('也是')]);
  assert.deepEqual(inline('a___b___c'), ['a___b___c']);
  assert.deepEqual(inline('**粗** *斜*'), [{ type: 'strong', kids: ['粗'] }, ' ', { type: 'em', kids: ['斜'] }]);
  assert.deepEqual(inline('***没收尾'), ['***没收尾']);
});
