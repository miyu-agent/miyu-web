// @ts-check
//! 数的写法：和 TUI 演示的 `meter.rs` 一字不差（同几个例子），两个头写出来一样。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { short, hitRate, percentTenths, clock, seconds } from '../src/model/format.js';
import { bytes, noStop, contextPercent } from '../src/lib/format.js';

test('token 写短：一千以下照写，一千以上 k、一百万以上 M，一位小数，整的不写小数', () => {
  assert.equal(short(950), '950');
  assert.equal(short(1_000), '1k');
  assert.equal(short(12_345), '12.3k');
  assert.equal(short(1_000_000), '1M');
  assert.equal(short(1_400_000), '1.4M');
});

test('命中率：99 以下写整数，99 以上一位小数，正好 99.0 写 99，四舍五入到 100.0 写 100', () => {
  assert.equal(hitRate(94, 100), '94');
  assert.equal(hitRate(9_860, 10_000), '99', '98.6 还不到 99，照整数写');
  assert.equal(hitRate(9_900, 10_000), '99');
  assert.equal(hitRate(9_963, 10_000), '99.6');
  assert.equal(hitRate(9_990, 10_000), '99.9');
  assert.equal(hitRate(9_996, 10_000), '100');
  assert.equal(hitRate(0, 0), '0');
});

test('上下文的百分比：一位小数，整的不写小数', () => {
  assert.equal(percentTenths(2_283, 1_000_000), '0.2');
  assert.equal(percentTenths(500_000, 1_000_000), '50');
  assert.equal(percentTenths(1, 0), '0');
});

test('读秒：12s、1m 05s、1h 02m 05s', () => {
  assert.equal(clock(12), '12s');
  assert.equal(clock(65), '1m 05s');
  assert.equal(clock(3_725), '1h 02m 05s');
});

test('一轮的用时：一分钟以内带一位小数，再长照读秒', () => {
  assert.equal(seconds(11_840), '11.8s');
  assert.equal(seconds(24_100), '24.1s');
  assert.equal(seconds(65_000), '1m 05s');
});

test('文件大小：1024 进一级，一位小数，整的不写小数；一千零二十四以下写字节', () => {
  assert.equal(bytes(0), '0 B');
  assert.equal(bytes(812), '812 B');
  assert.equal(bytes(1024), '1 KB');
  assert.equal(bytes(1536), '1.5 KB');
  assert.equal(bytes(1024 * 1024 * 3.25), '3.3 MB');
  assert.equal(bytes(1024 ** 3 * 2), '2 GB');
});

test('提示不要句末的句号：去掉一个「。」「.」，省略号留着', () => {
  assert.equal(noStop('已全部停下。'), '已全部停下');
  assert.equal(noStop('All stopped.'), 'All stopped');
  assert.equal(noStop('正在回顾…'), '正在回顾…');
  assert.equal(noStop('Loading...'), 'Loading...');
  assert.equal(noStop('已复制 3 个字'), '已复制 3 个字');
});

test('上下文占窗口几成：整数百分比，不到 1% 的写 <1%', () => {
  assert.equal(contextPercent(50_000, 1_000_000), '5%');
  assert.equal(contextPercent(4_800, 1_000_000), '<1%');
  assert.equal(contextPercent(199_000, 200_000), '100%');
  assert.equal(contextPercent(0, 200_000), '0%');
});

test('核心在 Windows 上的路径照 Windows 的写法给人看（家目录写真的路径），写的换回核心认的（蓝图「设置页」私密目录）', async () => {
  const { shownPath, corePath } = await import('../src/lib/format.js');
  const home = 'C:\\Users\\shorin';
  assert.equal(shownPath('~/AppData/Local/Microsoft/Vault', home, 'windows'), 'C:\\Users\\shorin\\AppData\\Local\\Microsoft\\Vault');
  assert.equal(shownPath('~', home, 'windows'), 'C:\\Users\\shorin');
  assert.equal(shownPath('~/NTUSER.DAT', null, 'windows'), '~\\NTUSER.DAT', '不知道家目录的留着 ~');
  assert.equal(shownPath('.git/hooks', home, 'windows'), '.git\\hooks', '工作区里的相对路径也用 \\');
  assert.equal(shownPath('C:/Windows/System32', home, 'windows'), 'C:\\Windows\\System32');
  assert.equal(shownPath('~/.ssh', '/home/me', 'linux'), '~/.ssh', '别的系统照原样');
  assert.equal(shownPath('/home/me/.ssh', '/home/me', 'linux'), '~/.ssh');
  assert.equal(corePath('C:\\Users\\shorin\\.ssh', home, 'windows'), '~/.ssh', '家目录下的真路径换成 ~/…');
  assert.equal(corePath('c:\\users\\SHORIN\\AppData\\Local', home, 'windows'), '~/AppData/Local', '不分大小写');
  assert.equal(corePath('C:\\Users\\shorinx\\a', home, 'windows'), 'C:\\Users\\shorinx\\a', '只是开头像的不算');
  assert.equal(corePath('%USERPROFILE%\\.ssh', home, 'windows'), '~/.ssh');
  assert.equal(corePath('%userprofile%', home, 'windows'), '~');
  assert.equal(corePath('~\\.config\\gh', home, 'windows'), '~/.config/gh');
  assert.equal(corePath('.git\\hooks', home, 'windows'), '.git/hooks');
  assert.equal(corePath('C:\\Windows\\System32\\drivers\\etc\\hosts', home, 'windows'), 'C:\\Windows\\System32\\drivers\\etc\\hosts', '别的盘符开头的照原样');
  assert.equal(corePath('\\\\server\\share', home, 'windows'), '\\\\server\\share');
  assert.equal(corePath('~/x\\y', home, 'linux'), '~/x\\y', '别的系统照原样');
});
