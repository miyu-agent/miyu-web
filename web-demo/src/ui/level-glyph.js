// @ts-check
//! 权限级别的记号画成自带的图标（蓝图 `web.md`「手机上」）：一句打头是 `⏵⏵`、`⏸` 的字，照 `model/footer.js` 的 `levelParts` 拆开，
//! 前面画一个 SVG（`.level-glyph`，跟着字的颜色、字号），后面接字。打头不是记号的原样交回那句字。

import { icon } from './dom.js';
import { levelParts } from '../model/footer.js';

/** @param {string} text @returns {(Node|string)[]} */
export function levelNodes(text) {
  const got = levelParts(text);
  if (!got.icon) return [text];
  const glyph = icon(got.icon);
  glyph.classList.add('level-glyph');
  return [glyph, got.text];
}
