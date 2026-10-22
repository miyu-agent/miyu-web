// @ts-check
//! 整页（蓝图 `web/architecture.md`「怎么搬」第 2 步）：拆成软件包之前的整个页面，先当一个基础系统的包跑起来；以后一件件
//! 拆出去，拆完这个包就没了。它是搬的过程里唯一还直接 `import` 旧代码（`src/ui/`、`src/core/`）的包。

import { App } from '../../src/ui/app.js';
import { NestedList } from '../../src/ui/nested.js';
import { withdrawQueued } from '../../src/ui/commands.js';
import { useConnection as linkCardsUse } from '../../src/ui/linkcards.js';
import { codeBlock, copy } from '../../src/markdown/build.js';
import { drawMarkdown, useRenderers } from '../../src/ui/render.js';
import { PALETTE, colorOf } from '../../src/model/project.js';
import { t } from '../../src/util/res.js';

/** @param {any} ctx */
export function apply(ctx) {
  // 链接卡片经这条连接问桥
  linkCardsUse(ctx.core);
  // 时间线、回答的排版照选中的提供者画（蓝图 web.md「换画法」）：用的时候再找，换了整个重画
  useRenderers(ctx);
  // 图片点开找灯箱：用的时候再找（`lightbox~`），灯箱装上、停了整页不重来
  const app = new App(ctx.sessions, ctx.core, ctx.host, ctx, () => ctx.lightbox);
  app.mount(ctx.page.root);
  ctx.seams.watch((/** @type {string} */ name) => { if (name.startsWith('render.')) app.chat.redraw(); });
  // 对话区：别的包经它拿滚的那一层、正文那一列、你说的话
  // Markdown 的代码块、复制：mermaid 这类包经它用；整段画（知识库页的片段、原文）：`render(容器, 原文)`
  ctx.provide('markdown', { codeBlock, copy, render: (/** @type {HTMLElement} */ el, /** @type {string} */ text) => drawMarkdown(el, text, { streaming: false }) });
  // 斜杠命令：别的包登记自己的（`/settings`、`/pkg` 这类）
  ctx.provide('commands', app.commands);
  // 皮肤样张（蓝图 web.md「皮肤」第 7 条）：设置页「皮肤」那一行的「样张」也开它
  ctx.effect(() => app.commands.register({ name: 'gallery', summary: t('gallery.command') }, () => { app.openGallery().catch((err) => app.composer.say(err.message)); }));
  ctx.provide('chat', {
    /** 正在看的会话（还没开的新会话是 `null`） */
    current: () => app.current,
    scroller: app.chat.el,
    list: app.chat.list,
    onPrompts: (fn) => app.chat.onPrompts(fn),
    /**
     * 看另一个会话（子代理的会话也行，第一次看时才读）。整理会话照打开前正在看的记着「← 返回」回哪；`back` 是另给的去处
     * （记忆页：回到原来看的会话、再打开那一份的记忆页），`title` 写在悬停提示里
     */
    open: (id, opts) => app.open(id, false, opts),
    /** 后台命令里脚本调用的工具那一段（核心 M-5 上，`view.detail {session, job}`）：后台任务浮层的预览接在后面；条目上那一格变了交给 `sync` */
    nestedList: (/** @type {string} */ session, /** @type {string} */ job) => {
      const list = new NestedList((after) => app.nestedDetail(session, { job }, after));
      return { el: list.el, sync: (/** @type {any} */ nested) => list.sync(nested) };
    },
    /** 还没开的新会话先开出来（照说第一句话一样，带上选的人格、预设、工作区），交回会话编号：空会话里打 `/dream` */
    ensure: async () => { await app.ensureSession(); return app.current; },
    /** 正在看的会话在不在回答；打断它（照两下 `Esc`） */
    running: () => !!app.composer.running,
    /** 家目录（握手回应的 `host.home`）：路径写成 `~` 用 */
    home: () => app.home,
    interrupt: () => app.interrupt(),
    /** 开皮肤样张（只在这一页、不连核心的会话） */
    gallery: () => app.openGallery(),
    /** 正文末尾（挂载位 `chat.tail`）来了新的：回到跟着最新的、露出它 */
    reveal: () => app.chat.reveal(),
    /** 钉一个节点在这时正文里最后一块的后面，交回钉在哪；照交回的位置再钉（换了会话回来） */
    anchor: (node) => app.chat.anchor(node),
    place: (where, node) => app.chat.place(where, node),
    /** 正在看的会话在哪个目录干活；账号的工作区（握手回应的 `host.workspace`，新会话默认在这里） */
    workdir: () => app.workdir(),
    defaultWorkdir: () => app.cwd,
    /** 一个会话自己的默认工作区（核心 5-14 中；旧核心是 `null`） */
    defaultWorkdirOf: (/** @type {string|null} */ id) => app.defaultWorkdirOf(id),
    /** 这个会话这时压缩有没有东西可压（核心 86097c26 的 `compactable`：视图流推来的先，订阅回应的后；旧核心没有是 `null`） */
    compactable: (/** @type {string} */ id) => {
      const s = app.store.sessions.get(id);
      const v = s?.view.status?.compactable ?? s?.base?.compactable;
      return typeof v === 'boolean' ? v : null;
    },
    /** 还没开的新会话选的人格、预设、工作区：开会话时带上（事件 `draft.changed`） */
    draft: () => ({ ...app.draft }),
    setDraft: (patch) => app.setDraft(patch),
    /** 换这个会话在哪干活（核心 9-7 的 `session.set_workspace`）：交回实际的目录，拒了的抛出来；太宽退回工作区的来事件 `workdir.adjusted` */
    setWorkdir: (session, cwd) => app.setWorkdir(session, cwd),
    /** 会话用的人格（核心 P-1 下：会话状态的 `persona`，没读进来的照会话表那一项的；以前的会话没有，是 `null`） */
    persona: (id) => app.store.sessions.get(id)?.view.status?.persona ?? app.store.index.get(id)?.persona ?? null,
    /** 会话用的人格画成什么样：交一个函数（会话 → `{name, avatar}`；无人格 `null`；还不知道 `undefined`），软件包 `setup` 给 */
    look: (fn) => app.setLooker(fn),
    /** 一个人格画成什么样：交一个函数（人格编号 → `{name, avatar}`；没有这个人格 `null`；还不知道 `undefined`），软件包 `setup` 给；中途换过人格的会话，以前那几轮的头照它画 */
    lookFor: (fn) => { app.chat.setLookFor(fn); app.schedule(); },
    /** 一个会话用的人格画成什么样（照 `look` 登记的那个函数：`{name, avatar}`；无人格 `null`；还不知道 `undefined`）：系统通知的图标照它 */
    lookOf: (id) => (app.looker ? app.looker(id) : undefined),
    /** 人格列表、新会话选的人格变了：照 `look` 重新取一次 */
    refreshLook: () => app.syncLook(),
    /** 会话用的预设（核心 P-2：会话状态的 `preset`，没读进来的照会话表；以前的会话没有，是 `null`） */
    preset: (id) => app.store.sessions.get(id)?.view.status?.preset ?? app.store.index.get(id)?.preset ?? null,
    /** 项目（核心 H-1）：现在的一张表、一个项目；没有的是 `null` */
    projects: () => app.store.projects.list,
    project: (id) => app.store.projects.get(id),
    /** 一个会话在哪个项目（子代理的照它的主会话；`null` 是还没开的新会话，照选的）；不在的是 `null`：在项目里的不画人格、预设、工作区（项目定好了） */
    projectOf: (session) => app.projectOfSession(session),
    /** 删项目，连里面的会话一起删（项目设置那一个窗口的「删除项目」） */
    deleteProject: (id) => app.deleteProject(id),
    /** 打开一个项目的页（左上角的项目名） */
    openProject: (id) => app.sessionsPage.openProject(id),
    /** 会话的标题（左上角）：改过的、照第一句话的；都没有是 `null` */
    title: (id) => app.titleOf(id),
    /** 派它的会话（子代理的会话有，主会话是 `null`） */
    parentOf: (id) => app.parentOf(id),
    /** 整理会话的 `dream`（核心 D-1 下：`{persona | session, manual, from?}`），别的会话是 `null` */
    dream: (id) => app.dreamOf(id),
    /** 撤回一条排着的话（核心 `session.withdraw`；运行状态行下面那几行点了撤回），字放回输入框 @param {number} seq */
    withdraw: (seq) => (app.current ? withdrawQueued(app, app.current, seq) : Promise.resolve()),
    /** 同输入框上面的「← 返回」（整理会话左上角标题左边那个「←」）：交回回去了没有；`backHint` 是它的悬停提示，没有去处的是 `null` */
    back: () => app.back?.go() ?? false,
    backHint: () => app.back?.hint() ?? null,
    /** 整理会话的会话表那一项（`last_active`、`tokens`、`busy`……）：记忆页的「整理记录」 */
    dreams: () => [...(app.store.index.dreams?.values() ?? [])],
    /** 项目的十二种颜色（存的是浅色那一种）、一种颜色照现在的深浅画成什么（新建项目、项目设置那一个窗口，软件包 setup） */
    projectPalette: () => PALETTE,
    projectColor: (color) => colorOf(color, !!ctx.theme?.dark()),
  });
  // 输入框：提示、跟着发的东西变了、写字的那个框（附件这类包经它粘贴、提示）
  ctx.provide('composer', {
    say: (text, good) => app.composer.say(text, good),
    changed: () => app.composer.syncButton(),
    input: app.composer.input,
    /** 整个框：附件照它收拖进来的文件 */
    box: app.composer.box,
    focus: () => app.composer.focus(),
    /** 挂载位 `composer.takeover` 占不占着框（确认和提问的抽屉） */
    takeover: (open) => app.composer.takeover(open),
    /** 锁住输入框（`text` 是占位字，`null` 解锁）：默认的人格没了、还没选的时候（软件包 `setup`） */
    lock: (text) => app.composer.lock(text),
    /** 输入框上面的列表选一样（同 `/language`：标题、按键提示、一行一样、现在的写「当前」）：`/persona`、`/preset` */
    pick: (ask) => app.composer.picker.show(ask),
    /** 认领没在回答、框里没字时的两下 `Esc`（`{hint, run}`：第一下提示 `hint`，第二下 `run`；`null` 放开）：整理记忆时叫停整理 */
    claimEscape: (claim) => { app.composer.escapeClaim = claim; },
  });
  ctx.effect(() => () => ctx.page.root.replaceChildren());
}
