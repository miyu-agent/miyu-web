// @ts-check
//! 人格、预设、工作区（软件包 `setup`，蓝图 `web.md`「人格、预设、工作区」）：
//! - 空会话：输入框正上方「选择人格」「选择预设」「设置工作区」三个按钮（挂载位 `composer.above`），选了以后按钮上的字换成选中的；没选的照默认
//!   的用，开会话时由整页带上（服务 `chat` 的 `draft`、`setDraft`）。默认的预设、（照预设算出来的）默认人格用不了，锁住输入框，选了才能打字。
//! - 开着的会话：对话区左上角一小条（挂载位 `stage.info`）：人格名 · 预设名 · 工作目录，点目录那一截换工作区。
//! - `/workspace [路径]`：换这个会话在哪干活（服务 `chat` 的 `setWorkdir`，核心 9-7 的 `session.set_workspace`）；不带路径的开工作区的菜单。
//! - 设置页：「人格」「预设」两页（`settings.section`），通用页的默认人格、默认预设给下拉的选项（`settings.editor`）。
//! - 左栏左上角的头像点了（事件 `persona.open`）：直接在页面上开这个会话用的人格的编辑卡片（`quick-edit.js`）。

import { h, icon, replace } from '../../src/lib/dom.js';
import { Menu } from './menu.js';
import { personaName, presetName, defaultUsable, presetInUse, personaInUse, dirName, readPath, remember, tilde, lastChoice } from './model.js';
import { Catalog } from './catalog.js';
import { ListPage, problemText } from './page.js';
import { browse } from './folders.js';
import { PersonaStep, PresetStep } from './welcome.js';
import { ThemeStep } from './theme-step.js';
import { editPersona } from './quick-edit.js';
import { editProject } from './project-dialog.js';

const RECENT = 'setup.recent';

/** @param {any} ctx */
export function apply(ctx) {
  const t = (key, fields) => ctx.text(key, fields);
  const chat = ctx.chat;
  /** 有哪些人格、预设，默认是哪个；读不到（旧核心）的那一样的按钮不出 */
  const catalog = new Catalog(ctx.core, () => ctx.icons.more());

  const menu = new Menu();
  const personaBtn = h('button.setup-btn', { type: 'button', onclick: () => openPersonas() });
  const presetBtn = h('button.setup-btn', { type: 'button', onclick: () => openPresets() });
  const workBtn = h('button.setup-btn', { type: 'button', onclick: () => openWorkspaces(workBtn, false) });
  const row = h('div.setup-row', { hidden: true }, personaBtn, presetBtn, workBtn, menu.el);
  const infoMenu = new Menu();
  const info = h('div.setup-info', { hidden: true });
  const infoWrap = h('div.setup-info-wrap', info, infoMenu.el);
  /** 左上角那一条里的路径：工作区的菜单开在它下面、和它左边对齐（2026-10-09 项目主人指出原来开在整条的左边，错位了） @type {HTMLElement|null} */
  let pathBtn = null;

  const home = () => chat.home() ?? null;
  const recent = () => /** @type {string[]} */ (ctx.storage.get(RECENT, []));
  const nameOf = (id) => {
    const p = catalog.personas?.find((x) => x.persona === id);
    return p ? personaName(p) : id;
  };
  const presetNameOf = (id) => {
    const p = catalog.presets?.find((x) => x.preset === id);
    return p ? presetName(p) : id;
  };
  /**
   * 空会话的选择：还什么都没选的（新开的、刚打开页面的）照上一次的会话先算上（`draw` 随后真的选上）。头像、主题照它画，不先照默认人格画一帧
   * （2026-10-19 项目主人：上一个会话是「无人格」，打开页面那一瞬间还闪一下默认人格的头像；终端同一个毛病，#171）。
   */
  const draftNow = () => {
    const d = chat.draft();
    if (chat.current() || d.project || d.persona != null || d.preset != null || d.cwd != null || !catalog.personas || !catalog.presets) return d;
    return { ...d, ...(lastChoice(ctx.sessions.index.all(), catalog.personas, catalog.presets) ?? {}) };
  };
  /** 空会话里实际会用的预设、人格（没选的照默认算；预设不再带默认人格，2026-10-08 项目主人） */
  const inUse = () => {
    const draft = draftNow();
    return { preset: presetInUse(draft.preset, catalog.presetDefault), persona: personaInUse(draft.persona, catalog.personaDefault, catalog.personas ?? []) };
  };

  /**
   * 会话用的人格画成什么样（对话区她那一轮的头、输入框的占位字，经 `chat.look`）：名字照人格列表，头像照 `persona.avatar`（核心 P-5，缓存在
   * `catalog.avatars`，读到以前画名字的第一个字）。
   * 人格列表还没读到的交 `undefined`（照旧不动）；无人格、人格已经删了的交 `null`：不画头像和名字（2026-10-10 项目主人）。空会话照选的、默认的算。
   * @param {string|null} session
   */
  const lookOf = (session) => {
    if (!catalog.personas) return undefined;
    return lookFor(session ? chat.persona(session) : inUse().persona);
  };
  /**
   * 一个人格画成什么样：自选的主题色、头像的候选色（核心算好给的 `seeds`）、背景图（核心 P-6）和背景图的透明度、焦点（P-7）跟着交出去，跟着人格的外观（软件包 `theme-persona`）
   * 照它们画。没有这个人格的是 `null`。
   * @param {string|null} id
   */
  const lookFor = (id) => {
    const p = id ? catalog.personas?.find((x) => x.persona === id) : null;
    return p ? {
      persona: p.persona, name: personaName(p), avatar: catalog.avatars.url(p.persona, p.avatar), seed: p.seed ?? null, seeds: p.seeds ?? [],
      background: catalog.backgrounds.url(p.persona, p.background), opacity: p.background_opacity ?? null, focus: p.background_focus ?? null,
      blur: p.background_blur ?? null,
    } : null;
  };
  chat.look(lookOf);
  // 第一次引导里人格、预设那两屏（蓝图「第一次引导」第 8、9 条）：控件照引导交来的 `kit`（设置页那一套）
  ctx.provide('personas', {
    /** 一个人格、预设的名字（全部会话里的项目页照它写；没读到的写编号） @param {string} id */
    personaName: (id) => nameOf(id),
    /** @param {string} id */
    presetName: (id) => presetNameOf(id),
    /** @param {import('./form.js').Kit} kit @param {import('./welcome.js').Host} host */
    persona: (kit, host) => new PersonaStep(ctx, kit, catalog, host),
    /** @param {import('./form.js').Kit} kit @param {import('./welcome.js').Host} host */
    preset: (kit, host) => new PresetStep(ctx, kit, catalog, host),
    /** 主题那一屏（2026-10-13）：人格那一步存好的人格 @param {import('./form.js').Kit} kit @param {import('./welcome.js').Host} host @param {string} id */
    // 引导盖着的时候整页照这个人格的样子画（空会话照上一次会话选的人格算，不一定是它）；走完进的新会话就是它，对话区照常接着发
    theme: (kit, host, id) => new ThemeStep(ctx, kit, catalog, host, id, () => ctx.publish('look.changed', lookFor(id))),
    /**
     * 换一个人格的主题色（设置页「主题」那一组的「主色」，2026-10-14 项目主人：和编辑卡片那一格是同一份）：`null` 回到自动。存了重读列表，
     * 整页照新的样子画。
     * @param {string} id @param {string|null} seed
     */
    setSeed: async (id, seed) => {
      await ctx.core.request('persona.set', { persona: id, seed: seed ?? { unset: true } });
      // 重读完叫一声，对话区照新的列表发 `look.changed`
      await catalog.load();
    },
  });
  // 头像读到了：她那一轮的头换成图
  catalog.listeners.add(() => chat.refreshLook());

  /** 读人格、预设的列表和默认的（进空会话时读一次，读完重画）。 */
  const load = async () => {
    await catalog.load();
    draw(true);
  };

  /** 照现在的会话画：空会话画按钮、管锁；开着的会话画左上角那一条。没变的不动（对话区每画一次都会来）。 */
  let drawn = '';
  const draw = (force = false) => {
    const session = chat.current();
    // 新的空会话（三样都还空着：人选过的哪怕是「无人格」「默认工作区」也不是空的）：人格、预设的列表读到了，照上一次的会话先选上；
    // 在项目里新建的不照上一次（项目没写的照默认，蓝图「会话整理和项目」第 9 条）
    const fresh = chat.draft();
    if (!session && !fresh.project && fresh.persona == null && fresh.preset == null && fresh.cwd == null && catalog.personas && catalog.presets) {
      const pick = lastChoice(ctx.sessions.index.all(), catalog.personas, catalog.presets);
      if (pick && Object.keys(pick).length) chat.setDraft(pick);
    }
    // 先选上再画头像（`inUse` 照上一次的算，这里只是跟着选上的换）
    chat.refreshLook();
    const draft = chat.draft();
    const cwd = chat.workdir();
    const used = session ? null : inUse();
    // 项目里的会话（在项目里新建的空会话也算）：人格、预设、工作区建项目时定好了，不画这三样（2026-10-19 项目主人：只要左上角项目的小标），用不了要选的照旧露出来
    const project = chat.projectOf?.(session) ?? null;
    const inProject = !!project;
    const title = session ? chat.title?.(session) ?? null : null;
    const sig = JSON.stringify([session, draft, cwd, catalog.personas?.length ?? -1, catalog.presets?.length ?? -1, catalog.personaDefault, catalog.presetDefault,
      used, session ? [chat.persona(session), chat.preset(session), chat.defaultWorkdirOf?.(session) ?? null] : null, project && [project.project, project.name, chat.projectColor?.(project.color)], title]);
    if (!force && sig === drawn) return;
    drawn = sig;
    if (!session) {
      // 在项目里新建的空会话：左上角「项目名 / 新会话」；别的空会话不画那一条
      infoMenu.close();
      if (project) replace(info, projectPart(project), h('span.setup-info-slash', '/'), h('span.setup-info-part.is-title.is-new', h('span', t('info.new_session'))));
      info.hidden = !project;
      row.hidden = false;
      personaBtn.hidden = !catalog.personas;
      replace(personaBtn, icon('user-round'), h('span', draft.persona === false ? t('no_persona') : draft.persona ? nameOf(draft.persona) : t('choose_persona')));
      personaBtn.classList.toggle('is-set', draft.persona != null);
      presetBtn.hidden = !catalog.presets;
      replace(presetBtn, icon('toggle-right'), h('span', draft.preset ? presetNameOf(draft.preset) : t('choose_preset')));
      presetBtn.classList.toggle('is-set', !!draft.preset);
      // 选了默认工作区的写「默认工作区」：它的目录名是数据目录里的 `workspace`，写出来像没翻译的字（2026-10-08 项目主人）
      const workLabel = !draft.cwd ? t('set_workspace') : draft.cwd === chat.defaultWorkdir() ? t('default_workspace') : dirName(tilde(draft.cwd, home()));
      replace(workBtn, icon('folder'), h('span', workLabel));
      workBtn.classList.toggle('is-set', !!draft.cwd);
      workBtn.title = tilde(draft.cwd ?? chat.defaultWorkdir(), home());
      // 没选、默认的又用不了：锁住输入框（第 2 条）。预设一定要有（Y12）；人格可以没有，只有算出来的默认人格文件写错了才锁
      const needPreset = !!catalog.presets && !draft.preset && !defaultUsable(catalog.presets, used?.preset ?? null, 'preset');
      const needPersona = !!catalog.personas && draft.persona == null && !!used?.persona && !defaultUsable(catalog.personas, used.persona);
      presetBtn.classList.toggle('is-need', needPreset);
      personaBtn.classList.toggle('is-need', needPersona);
      ctx.composer.lock(needPreset ? t('locked_preset') : needPersona ? t('locked') : null);
      if (inProject && !needPreset && !needPersona) {
        row.hidden = true;
        menu.close();
      }
      return;
    }
    row.hidden = true;
    menu.close();
    ctx.composer.lock(null);
    const persona = chat.persona(session);
    const preset = chat.preset(session);
    // 在这个会话自己的默认工作区里的写「默认工作区」，悬停看完整的（2026-10-20 项目主人：一个会话一个子目录，那串路径看不出意思）
    const own = chat.defaultWorkdirOf?.(session) ?? null;
    const path = own && cwd === own ? t('default_workspace') : tilde(cwd, home());
    // 主会话（2026-10-19 项目主人第三版）：左上角写标题（项目里的前面多「项目名 /」，点项目名进项目页），点标题出菜单：人格、预设、工作区（原来平铺在这一条上）
    if (!chat.parentOf?.(session)) {
      const titleBtn = h('button.setup-info-part.is-title', { type: 'button', title: title ?? '', 'aria-haspopup': 'menu', onclick: () => openInfo(titleBtn, persona, preset, path) },
        h('span', title ?? t('info.untitled')), icon('chevron-right'));
      pathBtn = titleBtn;
      replace(info, project ? [projectPart(project), h('span.setup-info-slash', '/')] : null, titleBtn);
      info.hidden = false;
      return;
    }
    // 子代理的会话（顶上有路径那一条写着标题）：照旧平铺人格 · 预设 · 工作目录
    const sep = () => h('span.setup-info-sep', '·');
    replace(info,
      persona ? [h('span.setup-info-part', icon('user-round'), h('b', nameOf(persona))), sep()] : null,
      preset ? [h('span.setup-info-part', icon('toggle-right'), h('b', presetNameOf(preset))), sep()] : null,
      pathBtn = h('button.setup-info-part.is-path', { type: 'button', title: tilde(cwd, home()), onclick: () => openWorkspaces(pathBtn ?? info, true) }, icon('folder'), h('span', path)));
    info.hidden = false;
  };

  /** 左上角的项目名：项目颜色的文件夹加名字，点了进项目页 @param {any} p */
  const projectPart = (p) => h('button.setup-info-part.is-project', {
    type: 'button', title: t('info.open_project'), style: `--project-color: ${chat.projectColor?.(p.color) ?? 'var(--text-faint)'}`,
    onclick: () => chat.openProject?.(p.project),
  }, icon('folder'), h('span', p.name));

  /**
   * 点标题出的卡片「会话信息」（2026-10-19 项目主人：只要信息、不要图标，原来那几个会话的操作去掉）：三行一样高，左边暗字、右边值——人格（点了开
   * 它的编辑卡片）、预设（只看）、工作区（完整路径，长的换行写全；行末一个文件夹图标，点了直接开系统的选目录对话框换工作区，不再翻到另一个菜单）。
   * @param {HTMLElement} anchor @param {string|null} persona @param {string|null} preset @param {string} path
   */
  const openInfo = (anchor, persona, preset, path) => {
    if (infoMenu.open) return infoMenu.close();
    infoMenu.show(anchor, {
      title: '',
      below: true,
      rows: [
        { label: t('info.persona'), title: persona ? nameOf(persona) : t('no_persona'), more: !!persona, still: !persona, pick: () => { if (persona && ctx.settings) editPersona(ctx, catalog, persona, ctx.settings.kit); } },
        ...(preset ? [{ label: t('info.preset'), title: presetNameOf(preset), still: true, pick: () => {} }] : []),
        {
          label: t('info.workspace'), title: path, still: true, wrap: true, pick: () => {},
          action: { icon: 'folder-open', title: ctx.text('folders.open_short'), run: () => browse(ctx, infoMenu, anchor, true, chat.workdir(), pickDir, (p) => tilde(p, home())) },
        },
      ],
    });
  };

  const openPersonas = () => {
    if (!catalog.personas) return;
    const chosen = inUse().persona;
    menu.show(personaBtn, {
      title: t('choose_persona'),
      rows: [
        // 第一行「无人格」：不带人格（2026-10-08 项目主人：人格可以留空，这一项叫「无人格」；没有人格的会话记忆单独一份（核心 P-12，原来不生效），知识库照样能查）
        { title: t('no_persona'), desc: t('no_persona_desc'), current: chosen == null, pick: () => chat.setDraft({ persona: false }) },
        ...catalog.personas.map((p) => ({
        title: personaName(p),
        desc: p.problem ? t('persona_bad') : p.summary ?? '',
        tip: p.problem ? catalog.problemOf('persona', p).map((x) => problemText(ctx, x)).join('\n') : undefined,
        current: p.persona === chosen && !p.problem,
        off: !!p.problem,
        pick: () => chat.setDraft({ persona: p.persona }),
      })),
      ],
    });
  };

  /** 预设的菜单：照 `preset.list`，一行一个名字（预设不写说明）；写错的暗着。 */
  const openPresets = () => {
    if (!catalog.presets) return;
    const chosen = inUse().preset;
    menu.show(presetBtn, {
      title: t('choose_preset'),
      rows: catalog.presets.map((p) => ({
        title: presetName(p),
        desc: p.problem ? t('preset_bad') : '',
        tip: p.problem ? catalog.problemOf('preset', p).map((x) => problemText(ctx, x)).join('\n') : undefined,
        current: p.preset === chosen && !p.problem,
        off: !!p.problem,
        pick: () => chat.setDraft({ preset: p.preset }),
      })),
    });
  };

  /** 核心拒了换目录的原因写给人看的一句（`fs.list`、`session.set_workspace` 同一套原因码）。 @param {any} err */
  const refused = (err) => err?.reason === 'path_forbidden' ? t('forbidden') : err?.reason === 'not_a_directory' ? t('not_a_dir')
    : err?.reason === 'path_unreadable' ? t('not_dir') : err?.message ?? String(err);

  /**
   * 换到这个目录：空会话改选的工作区（选了默认的也记着，按钮上换成它的目录名，2026-10-08 项目主人；开会话时核心才判，这里先问
   * `fs.list` 能不能用）；开着的会话交给核心换
   * （`session.set_workspace`，核心 9-7：会话记着、别的头跟着换，不在、不是目录、在数据根里的当场拒）。成了记进最近用过的。
   * 交回一句错，成了是 `null`。
   * @param {string} path
   */
  const use = async (path) => {
    const session = chat.current();
    const def = chat.defaultWorkdir();
    try {
      if (!session) {
        await ctx.core.request('fs.list', { cwd: path, dir: '' });
        chat.setDraft({ cwd: path });
      } else {
        // 换成了的正文里多一行「工作区：路径」（照核心推来的 `session.workspace_changed`），这里不再另提示；太宽退回了工作区的，
        // `workdir.adjusted` 那边提示
        await chat.setWorkdir(session, path);
      }
    } catch (err) {
      return refused(err);
    }
    ctx.storage.set(RECENT, remember(recent(), path, def, 5));
    return null;
  };
  /** 菜单里点一项：错了写进提示。 @param {string} path */
  const pickDir = (path) => use(path).then((why) => { if (why) ctx.composer.say(why); });

  /** `/workspace 路径` 写的路径：先认写法，再换；交回一句错，成了是 `null`。 @param {string} text */
  const check = async (text) => {
    const path = readPath(text);
    return path ? use(path) : t('relative');
  };

  /** 工作区的菜单：默认工作区、最近用过的、「选择文件夹…」（2026-10-08 项目主人：不要手写路径的框；要写路径用 `/workspace 路径`）。 @param {HTMLElement} anchor @param {boolean} below */
  const openWorkspaces = (anchor, below) => {
    const def = chat.defaultWorkdir();
    // 开着的会话的「默认」是它自己的那一个（核心 5-14 中）；点了照旧交账号的工作区，核心换成这个会话自己的
    const own = chat.current() ? chat.defaultWorkdirOf?.(chat.current()) ?? null : null;
    const now = chat.current() ? chat.workdir() : chat.draft().cwd ?? def;
    const others = recent().filter((p) => p !== def && p !== own);
    const which = below ? infoMenu : menu;
    which.show(anchor, {
      title: t('set_workspace'),
      // 选文件夹：标题右边一个图标（2026-10-09 项目主人：做成右上角的一个图标，不占一行）
      action: { icon: 'folder-open', title: t('folders.open_short'), run: () => browse(ctx, which, anchor, below, now, pickDir, (p) => tilde(p, home())) },
      below,
      rows: [
        { title: t('default_workspace'), desc: tilde(own ?? def, home()), current: now === def || (!!own && now === own), pick: () => pickDir(def) },
        ...(others.length ? [{ section: t('recent') }] : []),
        ...others.map((p) => ({ title: dirName(tilde(p, home())), desc: tilde(p, home()), current: now === p, pick: () => pickDir(p) })),
      ],
    });
  };

  ctx.slots.mount('composer.above', { id: 'setup', order: 90, render: () => row });
  // 设置页：「人格」「预设」两页；通用页的「默认人格」「默认预设」照列表给下拉的选项（只有一个也列，2026-10-07 项目主人）
  const personaPage = new ListPage(ctx, catalog, 'persona');
  const presetPage = new ListPage(ctx, catalog, 'preset');
  ctx.slots.mount('settings.section', { id: 'personas', name: t('page.title'), render: (kit) => personaPage.render(kit) });
  ctx.slots.mount('settings.section', { id: 'presets', name: t('presets.title'), render: (kit) => presetPage.render(kit) });
  // 左上角的头像（事件 `persona.open`，2026-10-10 项目主人）：直接在页面上开这个会话用的人格（空会话照选的、默认的）的编辑卡片，不先开设置页；
  // 无人格的左上角不画头像、点不了
  ctx.on('persona.open', async () => {
    const session = chat.current();
    const id = session ? chat.persona(session) ?? null : inUse().persona ?? null;
    if (!id || !ctx.settings) return;
    if (!catalog.personas) await catalog.load().catch(() => {});
    editPersona(ctx, catalog, id, ctx.settings.kit);
  });
  // 新建项目、项目设置（整页的左栏、项目页发来，蓝图「会话整理和项目」第 8 条）：人格、预设、工作区的选法和新会话的一样
  ctx.on('project.edit', (/** @type {any} */ what) => editProject(ctx, catalog, what, { recent, recentKey: RECENT }));
  ctx.slots.mount('settings.editor', {
    id: 'setup-persona',
    key: 'persona.default',
    // 「无人格」：新会话默认不带人格（写成删掉这一项）
    options: () => [{ value: null, name: t('default_none') }, ...(catalog.personas ?? []).filter((p) => !p.problem).map((p) => ({ value: p.persona, name: personaName(p) }))],
  });
  ctx.slots.mount('settings.editor', {
    id: 'setup-preset',
    key: 'preset.default',
    options: () => (catalog.presets ?? []).filter((p) => !p.problem).map((p) => ({ value: p.preset, name: presetName(p) })),
  });
  // 终端会话（核心 8-33，给 shellhook 开的会话）用哪个人格、预设：不写是跟随默认人格、默认预设（没有单独的无人格）
  ctx.slots.mount('settings.editor', {
    id: 'setup-terminal-persona',
    key: 'terminal.persona',
    options: () => [{ value: null, name: t('follow_default') }, ...(catalog.personas ?? []).filter((p) => !p.problem).map((p) => ({ value: p.persona, name: personaName(p) }))],
  });
  ctx.slots.mount('settings.editor', {
    id: 'setup-terminal-preset',
    key: 'terminal.preset',
    options: () => [{ value: null, name: t('follow_default') }, ...(catalog.presets ?? []).filter((p) => !p.problem).map((p) => ({ value: p.preset, name: presetName(p) }))],
  });
  ctx.slots.mount('stage.info', { id: 'setup', order: 10, render: () => infoWrap });
  ctx.on('view.changed', () => draw());
  ctx.on('draft.changed', () => draw());
  ctx.on('session.opened', (id) => { if (id === null) load(); else draw(); });
  ctx.on('session.created', () => draw());
  // 核心照「工作目录太宽」退回了工作区：照实际的提示一句，用不了的那个不留在最近用过里
  // 工作区设成了很大的目录（家目录、根目录…）：照人选的用着，提醒一句工作区级别下她改里面的文件不先问（核心 9-7 补）
  ctx.on('workdir.wide', ({ cwd }) => ctx.composer.say(t('workspace_wide', { path: tilde(cwd ?? '', home()) })));
  ctx.on('workdir.adjusted', ({ asked, cwd }) => {
    ctx.storage.set(RECENT, recent().filter((p) => p !== asked));
    ctx.composer.say(t('workspace_adjusted', { path: tilde(cwd, home()) }));
    draw(true);
  });
  ctx.commands.register({ name: 'workspace', summary: t('command'), args: true }, async (words) => {
    const text = (words ?? '').trim();
    if (!text) return openWorkspaces(chat.current() ? pathBtn ?? info : workBtn, !!chat.current());
    const why = await check(text);
    if (why) ctx.composer.say(why);
  });
  ctx.effect(() => () => {
    menu.close();
    infoMenu.close();
    ctx.composer.lock(null);
  });
  load();
}
