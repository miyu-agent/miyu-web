// @ts-check
//! 输入框跟着字长高、最多 `composer_max_rows` 行（蓝图 `web.md`「输入框」的「写字的地方」）：这一次打字要不要重新量高度。纯函数。
//!
//! 量一次要把框放开成 `auto` 再定回去，浏览器得把框里的字同步排两三遍；粘了一大段以后每打一个字都这样，几十万字时一个字要卡
//! 上百毫秒（W-1237）。框已经到最高、在框里滚的时候，只往里加字不会变矮，就不用量。

/**
 * 上一次量完（`last`：那时的字、超没超过最高、行高）以后字变成 `text`、光标在 `caret`：还是最高、不用量的交 `true`。只认只加不删：
 * 加的那一段停在光标前面（打字、粘贴、输入法上字都是这样），前后两截和原来的一样；删了字、选中一段换成别的（字数没少也算，换行可能
 * 少了）、没到最高、行高变了（字号、主题变了）的都要量。
 * @param {{text: string, full: boolean, line: number}|null} last
 * @param {string} text
 * @param {number} caret
 * @param {number} line
 */
export function keepsHeight(last, text, caret, line) {
  if (!last || !last.full || last.line !== line) return false;
  const was = last.text;
  const added = text.length - was.length;
  if (added < 0) return false;
  const at = caret - added;
  if (at < 0 || at > was.length) return false;
  return text.startsWith(was.slice(0, at)) && text.endsWith(was.slice(at));
}
