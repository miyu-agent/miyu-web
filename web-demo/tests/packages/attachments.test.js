// @ts-check
//! 附件（软件包 `attachments`，蓝图 `web.md`「附件」）：收哪些、框里那一排的状态、发的时候交出什么、拒了放回来。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Tray, admit, mediaType, extOf, attachable, sourcePath, findable } from '../../packages/attachments/model.js';
import { tipOf } from '../../packages/attachments/tray.js';

/** 这个包的设置项的出厂值 */
const config = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('../../packages/attachments/manifest.json', import.meta.url), 'utf8')).settings).map(([k, s]) => [k, s.default]));

/** 一个假文件：只要名字、大小、类型。 */
const file = (name, size = 10, type = '') => ({ name, size, type });

test('收哪些：超过上限大小的不收，放满了多的不收，别的照先后收（第 1、2 条）', () => {
  const big = file('大.mp4', config.max_mib * 1024 * 1024 + 1);
  const edge = file('正好.bin', config.max_mib * 1024 * 1024);
  const r = admit(0, [file('a.txt'), big, edge], config);
  assert.deepEqual(r.accepted.map((f) => f.name), ['a.txt', '正好.bin']);
  assert.deepEqual(r.tooBig.map((f) => f.name), ['大.mp4']);
  assert.equal(r.tooMany, 0);
  const full = admit(config.max_files - 1, [file('a'), file('b'), file('c')], config);
  assert.deepEqual(full.accepted.map((f) => f.name), ['a']);
  assert.equal(full.tooMany, 2);
});

test('媒体类型：合规矩的照写（小写），空的、不合的不写，交给核心照内容认（第 2 条）', () => {
  assert.equal(mediaType('image/png'), 'image/png');
  assert.equal(mediaType('Application/PDF'), 'application/pdf');
  assert.equal(mediaType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(mediaType(''), null);
  assert.equal(mediaType('text/plain; charset=utf-8'), null);
  assert.equal(mediaType('image/png/x'), null);
  assert.equal(mediaType(`a/${'b'.repeat(130)}`), null);
});

test('卡左下角的标签：扩展名大写；没有扩展名的不写（第 3 条）', () => {
  assert.equal(extOf('报告.pdf'), 'PDF');
  assert.equal(extOf('archive.tar.gz'), 'GZ');
  assert.equal(extOf('Makefile'), '');
  assert.equal(extOf('.bashrc'), '');
});

test('框里那一排：传的时候算在准备，不能发；传完了能发；拿掉的传完了也不算（第 3、4 条）', () => {
  const tray = new Tray();
  assert.equal(tray.has(), false);
  const a = tray.add(file('a.png', 10, 'image/png'));
  const b = tray.add(file('b.txt'));
  assert.deepEqual(tray.items.map((it) => it.state), ['uploading', 'uploading']);
  assert.equal(tray.has(), true);
  assert.equal(tray.busy(), true);
  assert.equal(tray.ready(a.id, { blob: 'sha256:a', name: 'a.png', media_type: 'image/png', kind: 'image' }), true);
  assert.equal(tray.busy(), true);
  tray.remove(b.id);
  assert.equal(tray.ready(b.id, { blob: 'sha256:b', name: 'b.txt', media_type: 'text/plain', kind: 'file' }), false, '拿掉以后才传完的不收');
  assert.equal(tray.busy(), false);
  assert.deepEqual(tray.items.map((it) => it.name), ['a.png']);
});

test('发：交出传完的几个（只要 blob、名字、媒体类型），框里清空；拒了放回来，照原来的先后（第 4 条）', () => {
  const tray = new Tray();
  const a = tray.add(file('a.png'));
  const b = tray.add(file('b.pdf'));
  tray.ready(a.id, { blob: 'sha256:a', name: 'a.png', media_type: 'image/png', kind: 'image', width: 2, height: 1 });
  tray.ready(b.id, { blob: 'sha256:b', name: 'b.pdf', media_type: 'application/pdf', kind: 'file' });
  const taken = tray.take();
  assert.deepEqual(taken, { attachments: [
    { blob: 'sha256:a', name: 'a.png', media_type: 'image/png' },
    { blob: 'sha256:b', name: 'b.pdf', media_type: 'application/pdf' },
  ] });
  assert.equal(tray.has(), false);
  const c = tray.add(file('c.txt'));
  tray.ready(c.id, { blob: 'sha256:c', name: 'c.txt', media_type: 'text/plain', kind: 'file' });
  assert.ok(taken);
  tray.putBack(taken);
  assert.deepEqual(tray.items.map((it) => it.name), ['a.png', 'b.pdf', 'c.txt'], '放回来的在前面');
  assert.equal(tray.items[0].state, 'ready');
});

test('没有东西、还在传的时候不交；不是自己交出去的不收回', () => {
  const tray = new Tray();
  assert.equal(tray.take(), null);
  tray.add(file('a'));
  assert.equal(tray.take(), null);
  tray.putBack({ attachments: [{ blob: 'sha256:x', name: 'x', media_type: 'text/plain' }] });
  assert.equal(tray.items.length, 1);
});

test('变了告诉看着的：加、传完、拿掉、交出、放回都算', () => {
  const tray = new Tray();
  let n = 0;
  tray.watch(() => n++);
  const a = tray.add(file('a'));
  tray.ready(a.id, { blob: 'sha256:a', name: 'a', media_type: 'text/plain', kind: 'file' });
  const taken = tray.take();
  if (taken) tray.putBack(taken);
  tray.remove(a.id);
  assert.equal(n, 5);
});

test('按种类选小卡的图标、要不要缩略图：图片、视频有缩略图；音频、PDF、文字、别的各一个图标', async () => {
  const { kindOf } = await import('../../packages/attachments/model.js');
  assert.equal(kindOf({ name: 'a.png', type: 'image/png' }), 'image');
  assert.equal(kindOf({ name: 'a.mp4', type: 'video/mp4' }), 'video');
  assert.equal(kindOf({ name: 'a.mp3', type: 'audio/mpeg' }), 'audio');
  assert.equal(kindOf({ name: 'a.pdf', type: 'application/pdf' }), 'pdf');
  assert.equal(kindOf({ name: 'notes.txt', type: 'text/plain' }), 'text');
  assert.equal(kindOf({ name: 'x.bin', type: '' }), 'file');
});

test('文字文件有几行：最后一行没有换行也算一行；空的是 0 行', async () => {
  const { lineCount } = await import('../../packages/attachments/model.js');
  assert.equal(lineCount('a\nb\nc'), 3);
  assert.equal(lineCount('a\nb\n'), 2);
  assert.equal(lineCount(''), 0);
});

test('输入历史：交出去的记成核心存好的那一份（编号、名字、媒体类型、大小），浏览器里的文件不记', () => {
  const tray = new Tray();
  const a = tray.add({ name: 'a.png', size: 3, type: 'image/png', file: new Blob(['abc']) });
  tray.ready(a.id, { blob: 'sha256:aa', name: 'a.png', media_type: 'image/png' });
  const taken = /** @type {any} */ (tray.take());
  assert.deepEqual(tray.keep(taken), [{ blob: 'sha256:aa', name: 'a.png', media_type: 'image/png', size: 3 }]);
  assert.equal(tray.keep(/** @type {any} */ ({ attachments: [] })), null, '不是这里交出去的不认');
});

test('输入历史翻出来的：换掉上一次跟着翻出来的，自己放的不动；传好了的直接能发；文件带着核心存好的那一份（缩略图照它取）；留下以后不再换', () => {
  const tray = new Tray();
  const own = tray.add({ name: 'mine.txt', size: 1, type: 'text/plain' });
  tray.ready(own.id, { blob: 'sha256:00', name: 'mine.txt', media_type: 'text/plain' });
  const kept = [{ blob: 'sha256:aa', name: 'a.png', media_type: 'image/png', size: 3 }];
  tray.recall(kept, 's1');
  assert.deepEqual(tray.items.map((it) => it.name), ['mine.txt', 'a.png']);
  assert.equal(tray.busy(), false);
  assert.deepEqual(tray.items[1].file, { name: 'a.png', size: 3, type: 'image/png', stored: { session: 's1', hash: 'sha256:aa' } });
  tray.recall([{ blob: 'sha256:bb', name: 'b.pdf', media_type: 'application/pdf', size: 9 }], 's2');
  assert.deepEqual(tray.items.map((it) => it.name), ['mine.txt', 'b.pdf'], '换掉上一次跟着翻出来的');
  tray.recall(null, null);
  assert.deepEqual(tray.items.map((it) => it.name), ['mine.txt'], '走回没发的那句：拿掉');
  tray.recall(kept, 's1');
  tray.settle();
  tray.recall(null, null);
  assert.deepEqual(tray.items.map((it) => it.name), ['mine.txt', 'a.png'], '留下的不再拿掉');
  assert.deepEqual(/** @type {any} */ (tray.take()).attachments.map((x) => x.blob), ['sha256:00', 'sha256:aa']);
});

test('@ 选文件交过来的：图片、PDF、音频、视频收成附件，别的（文字、代码、目录）不收，照路径写进话里', () => {
  const ref = (name, type) => ({ name, size: 1, type, path: `/p/${name}` });
  assert.equal(attachable(ref('a.png', 'image/png')), true);
  assert.equal(attachable(ref('b.pdf', 'application/pdf')), true);
  assert.equal(attachable(ref('c.mp3', 'audio/mpeg')), true);
  assert.equal(attachable(ref('d.mp4', 'video/mp4')), true);
  assert.equal(attachable(ref('e.rs', 'text/plain; charset=utf-8')), false);
  assert.equal(attachable(ref('f.zip', 'application/zip')), false);
});

test('键盘拿掉：光标在最前面按退格，拿掉最后一张（在传的也能拿）；一张都没有的交回 false，退格照常', () => {
  const tray = new Tray();
  const a = tray.add({ name: 'a.png', size: 1, type: 'image/png' });
  tray.ready(a.id, { blob: 'sha256:aa', name: 'a.png', media_type: 'image/png' });
  tray.add({ name: 'b.pdf', size: 1, type: 'application/pdf' });
  assert.equal(tray.dropLast(), true);
  assert.deepEqual(tray.items.map((it) => it.name), ['a.png']);
  assert.equal(tray.dropLast(), true);
  assert.equal(tray.dropLast(), false);
});

test('切会话（W-1137）：框里这一排收起来、框空了；传到一半的传完了记在收起来的那一排上；切回来放回去', () => {
  const tray = new Tray();
  const a = tray.add({ name: 'a.png', size: 3, type: 'image/png' });
  tray.ready(a.id, { blob: 'h1', name: 'a.png', media_type: 'image/png' });
  const b = tray.add({ name: 'b.pdf', size: 5, type: 'application/pdf' });
  const row = tray.stow();
  assert.ok(row);
  assert.equal(tray.items.length, 0);
  assert.equal(tray.stow(), null, '空的不收');
  assert.ok(tray.ready(b.id, { blob: 'h2', name: 'b.pdf', media_type: 'application/pdf' }), '收起来的照样传完');
  const c = tray.add({ name: 'c.txt', size: 1, type: 'text/plain' });
  tray.remove(c.id);
  tray.unstow(/** @type {any} */ (row));
  assert.deepEqual(tray.items.map((it) => [it.name, it.state]), [['a.png', 'ready'], ['b.pdf', 'ready']]);
  tray.unstow(/** @type {any} */ (row));
  assert.equal(tray.items.length, 2, '放回过的不再放一遍');
  const d = tray.add({ name: 'd.png', size: 1, type: 'image/png' });
  tray.stow();
  assert.ok(tray.remove(d.id), '收起来的传坏了照样拿掉');
});

test('原来的路径（第 2 条的子条目）：找到了记在这一块上，发的时候带 path；没找到的、写法核心不收的不带；宿主给了路径的照带', () => {
  const tray = new Tray();
  const a = tray.add({ name: '报告.md', size: 3, type: 'text/markdown', file: new Blob(['abc']), modified: 1 });
  const b = tray.add({ name: 'b.png', size: 3, type: 'image/png', file: new Blob(['abc']), modified: 1 });
  const c = tray.add({ name: 'c.pdf', size: 3, type: 'application/pdf', path: '/home/a/c.pdf' });
  for (const [it, type] of [[a, 'text/markdown'], [b, 'image/png'], [c, 'application/pdf']]) tray.ready(it.id, { blob: `sha256:${it.name}`, name: it.name, media_type: type });
  let seen = 0;
  tray.watch(() => { seen += 1; });
  assert.equal(tray.located(a.id, '/home/a/文档/报告.md'), true);
  assert.equal(seen, 1, '变了要重画（悬停的字）');
  assert.equal(tray.located(b.id, 'relative/b.png'), false, '不是绝对路径：核心会拒，不记');
  assert.equal(tray.located(b.id, null), false);
  assert.equal(tray.located(999, '/x'), false, '已经拿掉的不管');
  assert.equal(tipOf(tray.items[0]), '报告.md\n/home/a/文档/报告.md');
  assert.equal(tipOf(tray.items[1]), 'b.png');
  const taken = /** @type {any} */ (tray.take());
  assert.deepEqual(taken.attachments, [
    { blob: 'sha256:报告.md', name: '报告.md', media_type: 'text/markdown', path: '/home/a/文档/报告.md' },
    { blob: 'sha256:b.png', name: 'b.png', media_type: 'image/png' },
    { blob: 'sha256:c.pdf', name: 'c.pdf', media_type: 'application/pdf', path: '/home/a/c.pdf' },
  ]);
  // 输入历史里也带着，翻出来再发照带；记着的写法不对的不带
  const kept = /** @type {any} */ (tray.keep(taken));
  assert.deepEqual(kept.map((k) => k.path), ['/home/a/文档/报告.md', undefined, '/home/a/c.pdf']);
  assert.equal('path' in kept[1], false);
  tray.recall([...kept, { blob: 'sha256:x', name: 'x', media_type: 'text/plain', size: 1, path: 'bad' }], 's1');
  assert.deepEqual(/** @type {any} */ (tray.take()).attachments.map((x) => x.path), ['/home/a/文档/报告.md', undefined, '/home/a/c.pdf', undefined]);
});

test('原来的路径写法：绝对路径（/、~/、盘符、\\\\ 开头）、没有控制字符、最多 4096 字节（核心 protocol.md 的 session.send）', () => {
  for (const ok of ['/a/b.txt', '~/文档/a b.txt', 'C:\\Users\\a\\b.txt', 'D:/x/y', '\\\\server\\share\\f']) assert.equal(sourcePath(ok), ok, ok);
  for (const bad of ['', 'a/b', './a', '~', '~user/a', 'C:', '/a\nb', '/a\u0000', '/a\u0085b', null, undefined, 7]) assert.equal(sourcePath(bad), null, String(bad));
  assert.equal(sourcePath(`/${'a'.repeat(4095)}`)?.length, 4096);
  assert.equal(sourcePath(`/${'a'.repeat(4096)}`), null);
  assert.equal(sourcePath(`/${'字'.repeat(1365)}`)?.length, 1366, '照字节算：4096 以内');
  assert.equal(sourcePath(`/${'字'.repeat(1366)}`), null);
});

test('值不值得找它原来在哪：浏览器给的只有内容的文件才找；宿主给了路径的、输入历史翻出来的、刚刚才有的（粘贴的截图、字转成的附件）不找', () => {
  const now = 1_800_000_000_000;
  const blob = new Blob(['x']);
  assert.equal(findable({ name: 'a', size: 1, type: '', file: blob, modified: now - 60_000 }, now), true);
  assert.equal(findable({ name: 'a', size: 1, type: '', file: blob, modified: now - 100 }, now), false, '刚刚才有的');
  assert.equal(findable({ name: 'a', size: 1, type: '', file: blob }, now), false, '不知道改的时刻');
  assert.equal(findable({ name: 'a', size: 1, type: '', path: '/a', modified: 1 }, now), false, '已经有路径');
  assert.equal(findable({ name: 'a', size: 1, type: '', file: blob, path: '/a', modified: 1 }, now), false);
  assert.equal(findable({ name: 'a', size: 1, type: '', stored: { session: 's', hash: 'h' }, modified: 1 }, now), false, '核心存好的那一份');
});
