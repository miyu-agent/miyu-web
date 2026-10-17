// @ts-check
//! 系统通知写什么（软件包 `notify`，蓝图 `web.md`「系统通知」）：纯的。标题是会话的标题（没有的写「Miyu」）；正文照哪一种：
//! 一轮做完了写她最后那一段回答的第一行，她在问写第一个问题，要人确认写要用哪件工具。

/** 正文最长几个字（多的截掉加 `…`） */
export const BODY_MAX = 120;

/** 截成一行。 @param {string} text */
export const oneLine = (text) => {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line.length > BODY_MAX ? `${line.slice(0, BODY_MAX - 1)}…` : line;
};

/**
 * 一条通知的字；不该弹的（子会话、一次性的会话）是 `null`。
 * @param {'done'|'ask'|'approve'} what
 * @param {any} entry 会话表里这一项（`title`、`preview`、`parent`、`oneshot`）
 * @param {any[]} list 这个会话视图里的条目
 * @param {any} detail 在等的那一格（`{what, call, entry}`）
 * @param {(path: string, fields?: Record<string, any>) => string} t 这个包的字
 * @returns {{title: string, body: string}|null}
 */
export function noteOf(what, entry, list, detail, t) {
  if (entry?.parent || entry?.oneshot) return null;
  const title = (entry?.title || entry?.preview || '').trim() || 'Miyu';
  if (what === 'done') {
    const reply = [...(list ?? [])].reverse().find((e) => e.kind === 'reply' && !e.hidden && (e.text ?? '').trim());
    return { title, body: reply ? t('done', { text: oneLine(reply.text) }) : t('done_plain') };
  }
  const e = (list ?? []).find((x) => x.id === detail?.entry);
  if (what === 'ask') {
    let question = '';
    try {
      question = JSON.parse(e?.args ?? '{}').questions?.[0]?.question ?? '';
    } catch {
      // 参数读不懂的只写她在问
    }
    return { title, body: question ? t('ask', { text: oneLine(question) }) : t('ask_plain') };
  }
  return { title, body: e?.name ? t('approve', { tool: e.name }) : t('approve_plain') };
}
