// @ts-check
//! 第一次引导的整页（软件包 `welcome`，蓝图 `web.md`「第一次引导」第 2、10、11 条）：盖着整页的一层，一屏一屏地走：欢迎 → 界面语言 →
//! 模型（`settings` 包的 `providers`）→ 人格、预设（`setup` 包的 `personas`）→ 完成。每一屏只交标题、内容和主按钮，这里画顶上一行
//! （步骤条）、上一步、下一步，管 `Enter`、`↑` `↓`、换屏的动画和吉祥物站哪。

import { h, icon, replace } from '../../src/lib/dom.js';
import { helloScreen, languageScreen, profileScreen, embedScreen, embedState, doneScreen, STEP_KEY, DONE_KEY } from './screens.js';

/** 步子的先后；`back` 是上一步回到哪 */
const BACK = /** @type {Record<string, string|null>} */ ({ hello: null, language: 'hello', model: 'language', persona: 'model', theme: 'persona', profile: 'theme', preset: 'profile', embed: 'preset', done: 'embed' });
/** 进步骤条的几步（`embed` 只在那一屏出的时候列，`Guide.numbered`；沙盒那一步 2026-10-19 项目主人去掉了） */
export const NUMBERED = ['language', 'model', 'persona', 'theme', 'profile', 'preset', 'embed'];
/** 从头到尾的先后 */
const ORDER = ['hello', 'language', 'model', 'persona', 'theme', 'profile', 'preset', 'embed', 'done'];
/** 老核心上的成员走的几步（Y-2下下上：界面语言、模型、关于你、预设、语义模型那几步写配置，成员写不了；蓝图「连核心」第 1 条「成员」那一款） */
export const MEMBER_STEPS = ['hello', 'persona', 'theme', 'done'];

/**
 * 成员走到的那一步：要去的这一步成员走不了的，照走的方向找下一个走得了的（往前到「完成」，往回到「欢迎」）。
 * @param {string} step @param {1|-1} dir @returns {string}
 */
export function memberStep(step, dir) {
  let i = ORDER.indexOf(step);
  if (i < 0) return step;
  while (i > 0 && i < ORDER.length - 1 && !MEMBER_STEPS.includes(ORDER[i])) i += dir;
  return ORDER[i];
}
/** 换一屏要选中的选项（`↑` `↓` 换着选的：选了就是它；别的只挪焦点） */
const CHOICES = '.ob-row:not([disabled]), .wl-lang, .setup-choice, .ob-model';
const SELECTS = new Set(['wl-lang', 'setup-choice', 'ob-model']);
/** 吉祥物站的那一块：这一屏内容里第一块看得见的（第一行选项、第一个框），站在它上沿靠右（2026-10-10 项目主人选的，同对话页站在输入框上） */
// 一家一行的列表在自己的框里滚：站在框上（站在第一行上的，往下划会跟着那一行被弹上去，2026-10-19 项目主人）
/** 能站的几块（2026-10-23 项目主人：吉祥物要能站在列表上） */
const STANDABLE = '.wl-title, .ob-row, .ob-model, .wl-lang, .setup-choice';
/** 能站的最多几块 */
const ROW_ANCHORS = 12;
/** 能站的那几块各自的编号（同一块一直是同一个） */
const ROW_KEYS = new WeakMap();
let rowSeq = 0;
/** @param {Element} el */
const rowKey = (el) => {
  if (!ROW_KEYS.has(el)) ROW_KEYS.set(el, ++rowSeq);
  return ROW_KEYS.get(el);
};
const SURFACES = '.ob-list > .ob-rows:first-child, .ob-row, .wl-lang, .setup-choice, .ob-input, .set-input, .setup-area, .set-select';
/** 平常站的地方离那一块右边多远 */
const HOME_RIGHT = 40;

/**
 * @typedef {{title: string, sub?: string|null, body: HTMLElement, back?: (() => void)|null, center?: boolean, kind?: string,
 *   next?: {label?: string|(() => string), ready: () => boolean, run: () => Promise<string|null>}|null, focus?: HTMLElement|null,
 *   perch?: HTMLElement|null}} Screen `perch` 是吉祥物站在哪一块的上沿（不写的照内容里第一块看得见的）
 * @typedef {{model: {id: string, model: string|null, name: string}|null, persona: string, preset: string}} Result 走完写的
 */

export class Guide {
  /**
   * @param {any} ctx `welcome` 包的 ctx @param {() => void} uncover 揭掉一打开就盖上的那层底色（收起时）
   * @param {() => void} release 放开藏着的吉祥物（给了它舞台以后）
   */
  constructor(ctx, uncover, release) {
    this.ctx = ctx;
    this.uncover = uncover;
    this.release = release;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.step = 'hello';
    /** @type {Screen|null} */
    this.screen = null;
    /** 画着的那一屏是哪一步的（等待屏之后接着画的照它认） @type {string|null} */
    this.screenStep = null;
    this.running = false;
    /** @type {Result} */
    this.result = { model: null, persona: '', preset: '' };
    /** 存好的人格、预设的编号：走完开的新会话照它选 */
    this.ids = /** @type {{persona?: string|null, preset?: string|null}} */ ({});
    this.slot = h('div.wl-slot');
    this.steps = h('ol.wl-steps');
    /** 标题上面那一行小字：「第 3 步，共 7 步 · 人格」 */
    this.where = h('p.wl-where');
    this.head = h('div.wl-head', this.steps);
    this.page = h('div.wl-page', h('div.wl-col', this.head, this.slot));
    /** 最底下一条像素的地面（像素关卡，2026-10-19）：吉祥物在几步里站在它上面 */
    this.ground = h('div.wl-ground', { 'aria-hidden': 'true' });
    // 右上角整个引导一直在的几个按钮（2026-10-23 项目主人：例如切换明暗，不然太难受）：明暗，同左栏底下那一个（深色时太阳、浅色时月亮）
    this.schemeBtn = /** @type {HTMLButtonElement} */ (h('button.wl-corner-btn', { type: 'button', onclick: () => { ctx.theme?.toggle(); requestAnimationFrame(() => this.drawCorner()); } }));
    this.corner = h('div.wl-corner', { hidden: !ctx.theme }, this.schemeBtn);
    this.layer = h('div.wl-layer', { role: 'dialog', 'aria-modal': 'true' }, sky(ctx.config.stars), this.ground, this.page, this.corner);
    this.takeScheme();
    this.drawCorner();
    /** @type {HTMLButtonElement|null} */
    this.nextBtn = null;
    this.error = h('p.wl-error', { hidden: true });
    /** 吉祥物站的舞台：欢迎页一种、别的几屏一种；撤销的函数 */
    this.stageKind = '';
    this.unstage = /** @type {(() => void)|null} */ (null);
    /** 站的那一段挂进吉祥物的落脚点（挂载位 `mascot.anchors`）；拿下来的函数 */
    this.unmount = /** @type {(() => void)|null} */ (null);
    /** 内容里能站的那几块挂进落脚点；拿下来的函数 @type {(() => void)|null} */
    this.unmountRows = null;
    /** 画了第几屏：台子的编号带着它（换了一屏，旧的台子就没了，吉祥物照新的站） */
    this.shown = 0;
    /** 人格、预设还在读的那一下：台子照上一屏的留着，不让她掉下去 @type {{platforms: any[], home: any}|null} */
    this.held = null;
    this.onKey = (/** @type {KeyboardEvent} */ e) => this.key(e);
    this.onFocus = (/** @type {FocusEvent} */ e) => {
      // 焦点关在引导里：后面的页面点不到、Tab 不过去
      if (!this.layer.contains(/** @type {Node} */ (e.target))) this.focusScreen();
    };
    this.onScroll = () => this.ctx.mascot?.refresh?.();
    // 窗口变了：吉祥物照新的台子站（原来也量步骤条放不放得下，换成小点以后不用量了）
    this.onResize = new ResizeObserver(() => {});
    /** 内置语义模型那一屏出不出（`embedState`：装了的问开不开，没装、软件源里有的问下不下；都不是的跳过、步骤条不列）：打开时问一次，
     *  问到之前当不出；走到那一步再问一次 @type {Awaited<ReturnType<typeof embedState>>} */
    this.embed = null;
  }

  /** 步骤条列的几步。 */
  numbered() {
    if (this.ctx.host?.configless) return NUMBERED.filter((s) => MEMBER_STEPS.includes(s));
    // 成员装不了包（内置语义模型），那一屏不出
    return NUMBERED.filter((s) => s !== 'embed' || (this.embed && !this.ctx.host?.member));
  }

  /**
   * 晚加载的服务（`settings`、`personas`：它们比这个包晚起来）：有了当场交出来，还没有的等它登记。换了界面语言重载以后直接回到
   * 「模型」那一步，那时设置包可能还没起来（原来当场去拿，拿到空的，引导整屏空白）。
   * @param {string} name
   */
  service(name) {
    const now = this.ctx[name];
    if (now) return Promise.resolve(now);
    return new Promise((resolve) => {
      const off = this.ctx.on('service.set', (/** @type {string} */ got) => {
        if (got !== name || !this.ctx[name]) return;
        off();
        resolve(this.ctx[name]);
      });
    });
  }

  /** 和设置页一个样子的控件（`settings` 包给的；它比这个包晚加载，先 `await service('settings')` 再用） */
  get kit() {
    this.madeKit ??= this.ctx.settings.kit(this.layer, (/** @type {string} */ text) => this.say(text));
    return this.madeKit;
  }

  /** 盖上，从 `step` 开始。 @param {string} step */
  open(step) {
    document.body.append(this.layer);
    this.layer.addEventListener('keydown', this.onKey);
    document.addEventListener('focusin', this.onFocus);
    this.page.addEventListener('scroll', this.onScroll, { passive: true });
    this.go(step in BACK ? step : 'hello', 1);
    // 内置语义模型那一屏出不出：问到了重画步骤条（「语义模型」那一段）；成员装不了包、不走那一屏，不问
    if (!this.ctx.host?.member) embedState(this.ctx.core).then((got) => {
      this.embed = got;
      if (!this.head.hidden) this.drawSteps();
    });
    // 吉祥物的包比这个包晚加载：来了再让它上舞台
    const wait = (/** @type {number} */ tries) => {
      if (this.stageKind || !this.layer.isConnected) return;
      if (this.ctx.mascot) this.restage();
      else if (tries > 0) setTimeout(() => wait(tries - 1), 100);
      else this.release();
    };
    wait(50);
  }

  /** 收起：淡出，吉祥物跳回输入框上。 */
  close() {
    this.onResize.disconnect();
    this.layer.removeEventListener('keydown', this.onKey);
    document.removeEventListener('focusin', this.onFocus);
    this.page.removeEventListener('scroll', this.onScroll);
    this.unstage?.();
    this.unstage = null;
    this.unmount?.();
    this.unmount = null;
    this.unmountRows?.();
    this.unmountRows = null;
    this.layer.classList.add('is-leaving');
    this.uncover();
    const gone = () => this.layer.remove();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) gone();
    else this.layer.addEventListener('animationend', gone, { once: true });
  }

  /** 走到一步。 @param {string} step @param {1|-1} dir */
  async go(step, dir) {
    if (this.ctx.host?.configless) step = memberStep(step, dir);
    // 成员装不了包：内置语义模型那一屏跳过（往前到完成，往回到预设）
    if (step === 'embed' && this.ctx.host?.member) step = dir > 0 ? 'done' : 'preset';
    this.step = step;
    this.ctx.mascot?.busy?.(false, false);
    const host = { ready: () => this.sync(), mascot: this.ctx.mascot ?? null, panel: this.layer };
    if (step === 'hello') this.show(helloScreen(this), dir);
    else if (step === 'language') this.show(languageScreen(this), dir);
    else if (step === 'model') {
      // 设置包还没起来的先转着等（起来了的直接画，不多闪一下）
      if (!this.ctx.settings) this.show({ title: '', body: h('p.wl-wait', icon('loader-circle')), next: null, kind: 'wait' }, dir);
      const settings = await this.service('settings');
      if (this.step !== step) return;
      const flow = settings.providers({
        ...host,
        show: (/** @type {Screen} */ screen, /** @type {1|-1} */ d) => { if (this.step === 'model') this.show(screen, d); },
        done: (/** @type {Result['model']} */ got) => {
          this.result.model = got;
          this.go('persona', 1);
        },
      });
      flow.start();
    } else if (step === 'persona' || step === 'theme' || step === 'preset') {
      // 主题照人格那一步存好的人格（2026-10-13）；人格跳过了的（2026-10-19）跳过主题，往下是「关于你」
      if (step === 'theme' && !this.ids.persona) return this.go(dir > 0 ? 'profile' : 'persona', dir);
      this.show({ title: '', body: h('p.wl-wait', icon('loader-circle')), next: null, kind: 'wait' }, dir);
      const [personas] = await Promise.all([this.service('personas'), this.service('settings')]);
      if (this.step !== step) return;
      const part = step === 'persona' ? personas.persona(this.kit, host)
        : step === 'theme' ? personas.theme(this.kit, host, this.ids.persona) : personas.preset(this.kit, host);
      await part.load();
      if (this.step !== step) return;
      const screen = part.screen();
      this.show({
        ...screen,
        next: {
          ready: screen.next.ready,
          label: screen.next.label,
          run: async () => {
            const why = await screen.next.run();
            if (why) return why;
            // 人格没填、点了「跳过」的不记（主题那一屏跟着跳过，完成那一屏不写人格；2026-10-19 项目主人）
            if (step !== 'theme' && !part.skipped) {
              this.result[step] = part.label();
              this.ids[step] = part.id;
            }
            this.go(step === 'persona' ? 'theme' : step === 'theme' ? 'profile' : 'embed', 1);
            return null;
          },
        },
      }, dir);
    } else if (step === 'profile') {
      // 这一屏的框是设置包的样子：设置包还没起来的（重开到这一步）先转着等，不然画出来再撑开一回
      if (!this.ctx.settings) {
        this.show({ title: '', body: h('p.wl-wait', icon('loader-circle')), next: null, kind: 'wait' }, dir);
        await this.service('settings');
        if (this.step !== step) return;
      }
      this.show(profileScreen(this), dir);
    } else if (step === 'embed') {
      // 再问一次（装没装、软件源里有没有，打开以后可能变了）：不出的跳过这一屏
      const got = await embedState(this.ctx.core);
      if (this.step !== step) return;
      this.embed = got;
      if (!got) {
        this.drawSteps();
        return this.go(dir > 0 ? 'done' : 'preset', dir);
      }
      this.show(embedScreen(this, got), dir);
    }
    else if (step === 'done') this.show(doneScreen(this), dir);
  }

  /**
   * 画一屏。读完接着等待屏画的（同一步）沿用那个节点、只换里面的：滑进来的动画接着走，不再从头淡入一遍（2026-10-10 项目主人：点下一步
   * 文字那一块闪一下，原来等待屏、读到的那一屏各淡入一遍）。
   * @param {Screen} screen @param {1|-1} dir 往前走的从右边滑进来，往回的从左边
   */
  /** 「账号」那几屏右上角点过明暗的（主题还没起来时记在这台设备上，宿主交 `signinScheme`）：照它换成主题的设置 */
  takeScheme() {
    const want = this.ctx.host?.signinScheme ?? null;
    delete document.documentElement.dataset.siScheme;
    if ((want === 'dark' || want === 'light') && this.ctx.theme && !!this.ctx.theme.dark?.() !== (want === 'dark')) this.ctx.theme.toggle?.();
  }

  /** 右上角的明暗按钮照现在的明暗画（主题那一屏换了明暗、系统换了也跟着：每换一屏重画一次）。 */
  drawCorner() {
    const dark = !!this.ctx.theme?.dark?.();
    replace(this.schemeBtn, icon(dark ? 'sun' : 'moon'));
    const label = this.t(dark ? 'to_light' : 'to_dark');
    this.schemeBtn.title = label;
    this.schemeBtn.setAttribute('aria-label', label);
  }

  show(screen, dir) {
    this.drawCorner();
    const after = this.screen?.kind === 'wait' && this.screenStep === this.step;
    this.screen = screen;
    this.screenStep = this.step;
    this.running = false;
    // 设了账号进来的没有欢迎页：界面语言那一屏没有上一步
    const stepBack = this.step === 'language' && this.ctx.host?.signedUp ? null : BACK[this.step];
    const back = screen.back ?? (stepBack && this.step !== 'done' ? () => this.go(stepBack, -1) : null);
    const next = screen.next ?? null;
    this.nextBtn = next ? /** @type {HTMLButtonElement} */ (h('button.wl-btn.is-primary', { type: 'button', onclick: () => this.run() }, this.labelOf(next))) : null;
    this.error = h('p.wl-error', { hidden: true });
    const foot = back || this.nextBtn
      ? h('div.wl-foot', back ? h('button.wl-link', { type: 'button', onclick: back }, icon('chevron-left'), h('span', this.t('back'))) : h('span'), this.nextBtn)
      : null;
    this.where.textContent = this.whereText();
    const parts = [this.where.textContent ? this.where : null, screen.title ? h('h1.wl-title', screen.title) : null, screen.sub ? h('p.wl-sub', screen.sub) : null, h('div.wl-body', screen.body), this.error, foot];
    const old = /** @type {HTMLElement|null} */ (after ? this.slot.querySelector(':scope > .wl-screen') : null);
    const node = old ?? h(`div.wl-screen.is-${dir > 0 ? 'fwd' : 'back'}`);
    node.classList.toggle('is-center', !!screen.center);
    replace(node, ...parts.filter(Boolean));
    this.layer.classList.toggle('is-hello', this.step === 'hello');
    this.layer.classList.toggle('is-done', this.step === 'done');
    this.layer.classList.toggle('is-center', !!screen.center);
    this.head.hidden = !this.numbered().includes(this.step);
    this.drawSteps();
    // 还在读的那一下：吉祥物照上一屏的台子站着（先记下来再换掉）
    const waiting = screen.kind === 'wait';
    if (waiting && !this.held && this.stageKind) this.held = { platforms: this.platforms(), home: this.home() };
    if (!waiting) this.held = null;
    if (node !== old) replace(this.slot, node);
    if (!waiting) this.shown += 1;
    this.page.scrollTop = 0;
    this.sync();
    queueMicrotask(() => this.focusScreen());
    if (!this.restage() && !waiting) this.ctx.mascot?.home?.();
  }

  /** 焦点放到这一屏要的地方（没有的放到主按钮）。 */
  focusScreen() {
    const target = this.screen?.focus?.isConnected ? this.screen.focus : this.nextBtn ?? this.slot.querySelector('button');
    target?.focus({ preventScroll: true });
  }

  /** 走到哪了：几步的列表（设了账号进来的最前面多一段「账号」，算走过）。 */
  stepList() {
    return this.ctx.host?.signedUp ? ['account', ...this.numbered()] : this.numbered();
  }

  /** 步骤条：一排小点，现在这一步是主色的胶囊（2026-10-19 项目主人：原来一长串名字太素）；悬停一个点写那一步的名字。 */
  drawSteps() {
    const list = this.stepList();
    const at = list.indexOf(this.step);
    replace(this.steps, list.map((s, i) => h(`li${i === at ? '.is-now' : i < at ? '.is-done' : ''}`, { title: this.t(`steps.${s}`), 'aria-current': i === at ? 'step' : null })));
    this.steps.setAttribute('aria-label', this.whereText());
  }

  /** 标题上面那一行：「第 3 步，共 7 步 · 人格」；不在步骤条上的几屏（欢迎、完成）是空的。 */
  whereText() {
    const list = this.stepList();
    const at = list.indexOf(this.step);
    return at < 0 ? '' : this.t('where', { at: at + 1, total: list.length, name: this.t(`steps.${this.step}`) });
  }

  /** 主按钮能不能点、写什么（测试连接那一屏的跟着测的结果变）。 */
  sync() {
    const next = this.screen?.next;
    if (!this.nextBtn || !next) return;
    this.nextBtn.disabled = this.running || !next.ready();
    const label = this.labelOf(next);
    if (this.nextBtn.textContent !== label) this.nextBtn.textContent = label;
  }

  /** 主按钮上的字：没写的是「下一步」。 @param {NonNullable<Screen['next']>} next */
  labelOf(next) {
    return (typeof next.label === 'function' ? next.label() : next.label) ?? this.t('next');
  }

  /** 点主按钮：跑这一屏的 `run`，出错的写在按钮上面。 */
  async run() {
    const screen = this.screen;
    const next = screen?.next;
    if (!next || this.running || !next.ready()) return;
    this.running = true;
    this.error.hidden = true;
    this.sync();
    let why = null;
    try {
      why = await next.run();
    } catch (err) {
      why = /** @type {any} */ (err)?.message ?? String(err);
    }
    if (this.screen !== screen) return;
    this.running = false;
    if (why) this.say(why);
    this.sync();
  }

  /** 一句出错的字（主按钮上面，红字）。 @param {string} text */
  say(text) {
    this.error.hidden = !text;
    this.error.textContent = text;
  }

  /** 按键：`Enter` 是主按钮（多行框里照常换行，焦点在别的按钮上的照按钮自己的），`↑` `↓` 换选项，`Esc` 不关。 @param {KeyboardEvent} e */
  key(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const typing = target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'button');
    e.stopPropagation();
    // `Esc` 不关引导：开着的下拉菜单收起来（同设置页的 `set-dismiss`）
    if (e.key === 'Escape') {
      this.layer.querySelector('.set-menu')?.dispatchEvent(new CustomEvent('set-dismiss'));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      // 选项（语言、预设、模型）选中了就是它：回车照主按钮；别的按钮（一家供应商、上一步）照按钮自己的
      const choice = target instanceof HTMLButtonElement && [...SELECTS].some((c) => target.classList.contains(c));
      if (target instanceof HTMLTextAreaElement || (target instanceof HTMLButtonElement && target !== this.nextBtn && !choice)) return;
      e.preventDefault();
      this.run();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !typing) {
      const all = /** @type {HTMLElement[]} */ ([...this.slot.querySelectorAll(CHOICES)]);
      if (!all.length) return;
      e.preventDefault();
      const at = all.indexOf(target) >= 0 ? all.indexOf(target) : all.findIndex((x) => x.classList.contains('is-on'));
      const to = all[Math.max(0, Math.min(all.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
      if ([...SELECTS].some((c) => to.classList.contains(c))) {
        const cls = [...SELECTS].find((c) => to.classList.contains(c));
        const index = [...this.slot.querySelectorAll(`.${cls}`)].indexOf(to);
        to.click();
        // 选了以后那一列会重画：焦点放到新画的同一个
        /** @type {HTMLElement|undefined} */ ([...this.slot.querySelectorAll(`.${cls}`)][index])?.focus({ preventScroll: false });
      } else to.focus();
    }
  }

  /** 吉祥物站哪（第 11 条）：欢迎页放大、站在标题上面，别的几屏站在内容一列的上沿。交回换没换舞台（没换的由 `show` 叫它回家）。 */
  restage() {
    const mascot = this.ctx.mascot;
    if (!mascot?.stage) return true;
    const kind = this.step === 'hello' ? 'hello' : 'page';
    if (kind === this.stageKind) return false;
    const first = !this.stageKind;
    this.stageKind = kind;
    // 站的那一段挂进吉祥物的落脚点（「吉祥物」第 11 条）：只在引导这个舞台上算（`group`），自己量（`at`）；编号跟着画了第几屏换
    // （`key`：换了一屏，旧的台子就没了）
    this.unmount ??= this.ctx.slots?.mount('mascot.anchors', {
      id: 'welcome.top', kind: 'ground', edge: 'top', inset: 0, group: 'welcome', zh: '第一次引导里站的那一段',
      at: () => {
        const p = this.platforms()[0];
        return p ? { left: p.x1, right: p.x2, top: p.y, bottom: p.y, key: p.id } : null;
      },
    }) ?? null;
    // 内容里的标题、选项、卡片也能站（2026-10-23 项目主人：吉祥物没法站在列表上，拖上去就掉下去）：最多 12 块，照这一屏看得见的先后，
    // 一块一格；回家照旧是地面（`home`），跳回去的时候不往这些上落
    if (!this.unmountRows) {
      const offs = [];
      for (let i = 0; i < ROW_ANCHORS; i += 1) {
        offs.push(this.ctx.slots?.mount('mascot.anchors', {
          id: `welcome.row-${i}`, kind: 'ground', edge: 'top', inset: 0, group: 'welcome', zh: '第一次引导里能站的选项、卡片',
          at: () => {
            const el = this.rows()[i];
            const r = el?.getBoundingClientRect();
            // 编号照那一块自己（列表滚了，第 i 块换成别的一块：编号跟着换，原来站在上面的掉下去，不瞬移到别的一块上）
            return el && r?.width ? { left: r.left, right: r.right, top: r.top, bottom: r.top, key: `${this.shown}-${rowKey(el)}` } : null;
          },
        }));
      }
      this.unmountRows = () => { for (const off of offs) off?.(); };
    }
    // 新的舞台直接换掉旧的（不先撤：撤了它先往输入框跳，新舞台就跳不成了）
    this.unstage = mascot.stage({
      group: 'welcome',
      root: this.layer,
      scale: kind === 'hello' ? this.ctx.config.mascot_scale : 1,
      drop: first,
      home: () => this.home(),
    });
    this.release();
    return true;
  }

  /** 台子：站的那一块（居中的几屏是标题正上方一段，别的几屏是最底下的地面）；挂进吉祥物的落脚点的那一格照它量。 */
  platforms() {
    if (this.held) return this.held.platforms;
    const top = this.top();
    const list = top ? [top] : [];
    // 几步里只有地面一块（像素关卡，2026-10-19）：原来选项、按钮那一排也是台子，跳回家时半路落在选项上下不来
    return list;
  }

  /** 这一屏能站的几块（标题、选项、卡片）：在窗口里露着的，照先后；滚在框外面的不算。 */
  rows() {
    const view = this.page.getBoundingClientRect();
    return /** @type {HTMLElement[]} */ ([...this.slot.querySelectorAll(STANDABLE)]).filter((el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.top >= view.top && r.top <= view.bottom - 56)) return false;
      // 上沿那一点真看得见：滚出了列表自己那一框的（被框裁掉、被淡出那一截盖住的）不算（2026-10-23 项目主人：吉祥物停在半空）
      // 吉祥物自己那一层不算（站在上面的时候脚下那一点是它）
      const hit = document.elementsFromPoint((Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2, r.top + 3).find((x) => !x.closest('.mascot-layer'));
      return !!hit && (el === hit || el.contains(hit));
    }).slice(0, ROW_ANCHORS);
  }

  /** 这一屏吉祥物站的那一块：屏自己指了的照它，不然是内容里第一块看得见的。 */
  first() {
    const perch = this.screen?.perch;
    if (perch?.isConnected) return perch;
    return /** @type {HTMLElement|null} */ (this.slot.querySelector('.wl-body')?.querySelector(SURFACES) ?? null);
  }

  /** 站的那一块：居中的那几屏（欢迎、完成）是标题正上方一段，别的是最底下的地面（没有地面的照旧是内容里第一块看得见的上沿）。 */
  top() {
    const id = `wl-top-${this.shown}`;
    if (this.screen?.center) {
      const title = /** @type {HTMLElement|null} */ (this.slot.querySelector('.wl-title'));
      const r = title?.getBoundingClientRect();
      if (!r?.width) return null;
      const c = r.left + r.width / 2;
      return { id, x1: c - 80, x2: c + 80, y: r.top - 12 };
    }
    // 几步里站在最底下的地面上（像素关卡，2026-10-19 项目主人挑的样子）；地面不在的照旧站在内容里第一块的上沿
    const g = this.ground.getBoundingClientRect();
    if (g.width) return { id, x1: g.left + 16, x2: g.right - 16, y: g.top };
    const r = this.first()?.getBoundingClientRect();
    if (!r?.width) return null;
    return { id, x1: r.left + 8, x2: r.right - 8, y: r.top };
  }

  /** 平常站哪：居中的几屏在标题正上方；别的在地面上、内容一列的右边。 */
  home() {
    if (this.held) return this.held.home;
    const platform = this.top();
    if (!platform) return null;
    if (this.screen?.center) return { x: (platform.x1 + platform.x2) / 2, platform };
    // 站在地面上：内容一列的右边（窄的窗口里靠右边）
    const col = /** @type {HTMLElement|null} */ (this.page.querySelector('.wl-col'))?.getBoundingClientRect();
    const right = col ? Math.min(col.right + 56, platform.x2 - 24) : platform.x2 - HOME_RIGHT;
    return { x: right, platform };
  }

  /**
   * 走完（完成那一屏的「开始聊天」）：写 `ui.welcomed`，先在盖着的底下进一个新的空会话（排版、画好），隔两帧再淡出收起
   * （2026-10-19 项目主人：边淡出边换会话掉帧）。
   */
  async finish() {
    // 老核心上的成员写不了配置（Y-2下下上）：走没走过只记在这台设备上（`welcome.done`，照账号分开）
    if (!this.ctx.host?.configless) await this.ctx.core.request('config.set', { layer: 'personal', changes: [{ key: 'ui.welcomed', value: true }] });
    this.ctx.storage.set(STEP_KEY, null);
    this.ctx.storage.set(DONE_KEY, true);
    this.ctx.chat.open(null);
    // 新会话照刚设的默认人格、预设（不照上一次的会话）
    const pick = Object.fromEntries(Object.entries(this.ids).filter(([, v]) => v));
    if (Object.keys(pick).length) this.ctx.chat.setDraft(pick);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    this.close();
    this.ctx.composer.focus();
    return null;
  }
}

/** 欢迎页后面那一层：两团慢慢飘的光、一些慢慢闪的星点（随机散着）。 @param {number} stars */
function sky(stars) {
  const dots = Array.from({ length: stars }, () => h('i.wl-star', {
    style: `left: ${(Math.random() * 100).toFixed(1)}%; top: ${(Math.random() * 100).toFixed(1)}%; animation-delay: ${(-Math.random() * 6).toFixed(2)}s; --size: ${Math.random() < 0.3 ? 2 : 1}px`,
  }));
  return h('div.wl-sky', { 'aria-hidden': 'true' }, h('i.wl-glow.is-a'), h('i.wl-glow.is-b'), dots);
}
