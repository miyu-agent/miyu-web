// @ts-check
//! 选文件夹（蓝图 `web.md`「人格、预设、工作区」第 4 条）：先照宿主的 `files.pickDir()` 开系统的选目录对话框（2026-10-08 项目主人：
//! 选择文件夹应该打开目录选择器；浏览器经桥开，桌面端自己开），点了取消就算了；开不了的（交 `null`：页面开在别的机器上、那台机器上
//! 没有对话框程序）在菜单里画一个文件夹浏览器，列核心那台机器上的目录（`fs.list`，路径都照核心给的，
//! 哪个系统都一样）：顶上是现在的目录，一行一个子目录，点进去；「上一级」照 `fs.realpath` 的 `..`；「选这个目录」交出去。点开的点
//! 文件夹不收起菜单。以点开头的隐藏目录不列（要用的直接写路径）。
//! 等系统的对话框回来时菜单里写「正在打开…」，下面「取消」「在这里选」（对话框开在别的窗口后面、看不见的时候照样能选，W-1134），等的时候
//! 再点不另发；网页软件说已经开着一个的菜单里写那一句（2026-10-30 桌面端：Windows 上框开在后面看不见，点了十几次）。

import { h } from '../../src/lib/dom.js';
import { plainPath } from './model.js';

/** 正在等系统的选目录对话框回来 */
let waiting = false;

/**
 * 在菜单里浏览文件夹，从 `start` 开始。
 * @param {any} ctx
 * @param {import('./menu.js').Menu} menu
 * @param {HTMLElement} anchor
 * @param {boolean} below
 * @param {string} from 从哪个目录开始
 * @param {(path: string) => void} done 选定了
 * @param {(path: string) => string} show 路径写给人看的样子（家目录写 `~`）
 */
export async function browse(ctx, menu, anchor, below, from, done, show) {
  const t = (key, fields) => ctx.text(key, fields);
  // Windows 的原样路径（`\\?\C:\…`）先换成平常的写法：对话框、浏览器都认不了它
  const start = plainPath(from);
  const button = (label, primary, onclick, off = false) => h(`button.setup-menu-btn${primary ? '.is-primary' : ''}`, { type: 'button', onclick, disabled: off }, label);
  const go = async (/** @type {string} */ dir, /** @type {string} */ why = '') => {
    let items = [];
    let note = '';
    let bad = false;
    try {
      const got = await ctx.core.request('fs.list', { cwd: dir, dir: '' });
      items = (got?.items ?? []).filter((x) => x.dir && !x.path.startsWith('.'));
      if (got?.partial) note = t('folders.partial');
    } catch (err) {
      note = err?.reason === 'path_forbidden' ? t('forbidden') : t('not_dir');
      bad = true;
    }
    const parent = await ctx.core.request('fs.realpath', { path: '..', cwd: dir }).then((r) => r?.path ?? null, () => null);
    const up = parent && parent !== dir ? () => go(parent) : undefined;
    const name = (x) => x.path.replace(/[\\/]+$/, '');
    menu.show(anchor, {
      title: show(dir),
      below,
      back: up,
      note: why || note || (items.length ? '' : t('folders.empty')),
      rows: [
        ...(up ? [{ title: t('folders.up'), icon: 'arrow-up', pick: up }] : []),
        ...items.sort((a, b) => name(a).localeCompare(name(b))).map((x) => ({ title: name(x), icon: 'folder', pick: () => go(x.full) })),
      ],
      foot: [button(t('folders.cancel'), false, () => menu.close()), button(t('folders.choose'), true, () => { menu.close(); done(dir); }, bad)],
    });
  };
  // 系统的选目录对话框：等它回来时菜单里写「正在打开…」，下面一个「在这里选」（2026-11-10 项目主人：Mac 上会话标题菜单、新建项目里点了
  // 什么都没有——对话框开在浏览器后面，原来那句提示写在输入框上面，项目框盖着看不见；W-1134）。选了交出去；取消了（`false`）收起菜单；
  // 已经开着一个的照旧在菜单里等；开不了（`null`）的画浏览器、写一句为什么。点了「在这里选」的以后对话框回来什么都不做。
  let here = false;
  const browseHere = () => { here = true; void go(start); };
  const wait = (/** @type {string} */ note) => menu.show(anchor, {
    title: t('folders.title'),
    below,
    note,
    rows: [],
    foot: [button(t('folders.cancel'), false, () => { here = true; menu.close(); }), button(t('folders.here'), true, browseHere)],
  });
  if (waiting) return void wait(t('folders.busy'));
  const asking = ctx.host?.files?.pickDir?.({ title: t('folders.title'), start });
  if (!asking) return void (await go(start));
  waiting = true;
  wait(t('folders.opening'));
  /** @type {any} */
  let picked = null;
  try {
    picked = await asking;
  } catch {
    picked = null;
  } finally {
    waiting = false;
  }
  if (here) return;
  if (typeof picked === 'string') {
    menu.close();
    return done(plainPath(picked));
  }
  if (picked === false) return void menu.close();
  if (picked?.busy) return void wait(t('folders.busy'));
  // 这台电脑上对话框起不来的：画浏览器，下面写一句
  await go(start, t('folders.fallback'));
}
