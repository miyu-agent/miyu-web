// @ts-check
//! 界面块的数（软件包 `widgets`，蓝图 `web.md`「界面块」；核心 `widgets.md`）：订阅时屏上有哪几个位置、推来的一块并进记着的那份、按位置取、
//! 一块超过行数上限时截到哪、右边那段字的几小段。纯的，`render.js` 照它画。

/** 每个位置最多露几块、一块最多露几行（2026-10-15 网页对图时定，写进蓝图） */
export const LIMITS = /** @type {const} */ ({ home: { blocks: 3, rows: 8 }, sidebar: { blocks: 8, rows: 12 }, status: { blocks: 3, rows: 1 }, page: { blocks: 1, rows: Infinity } });

/**
 * @typedef {{package: string, id: string, place: 'home'|'sidebar'|'status'|'page', scope: string, source: string, icon?: string, title?: string,
 *   command?: string, running: boolean, content?: any[]|null}} Block
 */

/**
 * 订阅时屏上有哪几个位置（`showing`）：首页露着有 `home`，面板那一页露着有 `sidebar`，底栏一直有 `status`。
 * @param {{home: boolean, panel: boolean}} on
 * @returns {string[]}
 */
export function showingOf(on) {
  return [...(on.home ? ['home'] : []), ...(on.panel ? ['sidebar'] : []), 'status'];
}

/** 一块的键 @param {{package: string, id: string}} b */
export const keyOf = (b) => `${b.package}/${b.id}`;

/** 记着的那份：订阅回应换掉整份，推来的一块换掉那一块（`null` 是没了），先后照订阅回应的、后来的接在后面。 */
export class Blocks {
  constructor() {
    /** @type {Map<string, Block>} */
    this.map = new Map();
  }

  /** 订阅回应：整份换掉。 @param {Block[]} list */
  reset(list) {
    this.map = new Map(list.map((b) => [keyOf(b), b]));
  }

  /** 推来的一块（`widget.changed`）。 @param {{package: string, id: string, widget: Block|null}} change */
  apply(change) {
    const key = keyOf(change);
    if (!change.widget) this.map.delete(key);
    else this.map.set(key, change.widget);
  }

  /** 这个位置的几块，照先后。 @param {string} place @returns {Block[]} */
  at(place) {
    return [...this.map.values()].filter((b) => b.place === place);
  }

  /** @param {string} pkg @param {string} id */
  get(pkg, id) {
    return this.map.get(`${pkg}/${id}`) ?? null;
  }
}

/** 一段占几行：标题、进度条一行（进度条带字的两行），字照换行数，一对、一条各一行，一排按钮一行。 @param {any} seg */
export function rowsOf(seg) {
  switch (seg?.type) {
    case 'text': return String(seg.text ?? '').split('\n').length;
    case 'pairs': case 'list': return Array.isArray(seg.items) ? seg.items.length : 0;
    case 'progress': return seg.text ? 2 : 1;
    default: return 1;
  }
}

/**
 * 截到 `max` 行：前面的几段整段留着，截在哪一段里的，字截到那几行、一对一条截到那几项（进度条、按钮这种不拆的整段留下）。交回留下的几段、
 * 收起了几行。
 * @param {any[]} content @param {number} max
 * @returns {{shown: any[], hidden: number}}
 */
export function clip(content, max) {
  const shown = [];
  let used = 0;
  let hidden = 0;
  for (const seg of content) {
    const rows = rowsOf(seg);
    if (used >= max) {
      hidden += rows;
      continue;
    }
    const room = max - used;
    if (rows <= room) {
      shown.push(seg);
      used += rows;
    } else if (seg.type === 'text') {
      shown.push({ ...seg, text: String(seg.text).split('\n').slice(0, room).join('\n') });
      used = max;
      hidden += rows - room;
    } else if (seg.type === 'pairs' || seg.type === 'list') {
      shown.push({ ...seg, items: seg.items.slice(0, room) });
      used = max;
      hidden += rows - room;
    } else {
      shown.push(seg);
      used += rows;
    }
  }
  return { shown, hidden };
}

/**
 * 右边那段字：一句字，或者几小段各带语气（核心 X-15 补：最多 4 段）。都交成几小段。
 * @param {any} right
 * @returns {{text: string, tone: string}[]}
 */
export function rightParts(right) {
  if (typeof right === 'string') return right ? [{ text: right, tone: 'normal' }] : [];
  if (!Array.isArray(right)) return [];
  return right.filter((p) => typeof p?.text === 'string').slice(0, 4).map((p) => ({ text: p.text, tone: typeof p.tone === 'string' ? p.tone : 'normal' }));
}

/** 语气只认这几种，别的当普通 @param {any} tone */
export const toneOf = (tone) => (['dim', 'accent', 'good', 'warn', 'bad'].includes(tone) ? tone : 'normal');
