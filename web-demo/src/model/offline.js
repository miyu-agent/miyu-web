// @ts-check
//! 连不上桥时写什么（蓝图 `web.md`「连核心」第 9 条）：为什么、怎么办。为什么照桥的 `/key` 分：口令用不了（桥每次重启都换
//! 口令）、地址里没带口令、桥没在跑。桥、网页软件连不上核心的（`core`、`served`）标题「连不上核心」，为什么照它给的那一整句
//! （核心 EN-1、EN-2 起照那台机器的语言说，W-1204）。连上了、核心太旧（握手没报视图投影，核心 9-8 前）的写「核心版本过旧」。纯函数。

import { t } from '../util/res.js';

/**
 * @param {'bad'|'none'|'down'|'core'|'served'|'old'|'web'} kind
 * @param {string} [message] 桥、网页软件给的原因（`core`、`served` 时）
 * @returns {{title: string, why: string, how: string}}
 */
export function offline(kind, message = '') {
  if (kind === 'old') return { title: t('boot.old_title'), why: t('boot.old_why'), how: t('boot.old_how') };
  // 直接连网页软件的（`miyu web` 打开的）：连不上就是网页软件没在跑
  if (kind === 'web') return { title: t('boot.web_title'), why: t('boot.web_why'), how: t('boot.web_how') };
  // 那一头连不上、拉不起核心：走桥的看起桥的终端，网页软件的处理好了刷新（它每次都重新去连、去拉起核心）
  if (kind === 'core') return { title: t('boot.core_title'), why: message, how: t('boot.core_how') };
  if (kind === 'served') return { title: t('boot.core_title'), why: message, how: t('boot.served_how') };
  const title = t('boot.title');
  if (kind === 'down') return { title, why: t('boot.down_why'), how: t('boot.down_how') };
  return { title, why: t(kind === 'none' ? 'boot.none_why' : 'boot.bad_why'), how: t('boot.key_how') };
}
