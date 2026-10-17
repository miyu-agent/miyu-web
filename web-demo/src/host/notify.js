// @ts-check
//! 系统通知（蓝图 `web.md`「系统通知」；2026-10-17 项目主人问网页能不能发通知）：浏览器的 Notification 接口，两份浏览器宿主共用；
//! 桌面端换成系统自己的通知。标签页关了以后的推送（Service Worker / Web Push）先不做。

/** @typedef {{title: string, body?: string, tag?: string, icon?: string, onclick?: () => void}} Note 一条：标题、正文、同一个 `tag` 的换掉上一条、点了做什么 */

export const notify = {
  /** 这台浏览器准不准：`granted`、`denied`、`default`（还没问过），不支持的是 `unsupported`。 @returns {string} */
  permission: () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
  /** 问人要权限（要在人点了、按了键的那一下里叫：Firefox 只认这种）。 @returns {Promise<string>} */
  request: async () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.requestPermission()),
  /** 这个标签页现在是不是不在前台（切到别的标签页、别的窗口）。 */
  away: () => document.visibilityState === 'hidden' || !document.hasFocus(),
  /** 弹一条；点了把这个窗口提到前面、做 `onclick`、收起这一条。准不了的不弹。 @param {Note} note */
  show: (note) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
    const n = new Notification(note.title, { body: note.body ?? '', tag: note.tag, icon: note.icon });
    n.onclick = () => {
      window.focus();
      note.onclick?.();
      n.close();
    };
    return n;
  },
};
