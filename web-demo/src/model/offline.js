// @ts-check
//! 连不上桥时写什么（蓝图 `web.md`「连核心」第 9 条）：为什么、怎么办。为什么照桥的 `/key` 分：口令用不了（桥每次重启都换
//! 口令）、地址里没带口令、桥没在跑；口令对、桥连不上核心的照桥的原话。连上了、核心太旧（握手没报视图投影，核心 9-8 前）的写
//! 「核心版本过旧」。纯函数。

import { t } from '../util/res.js';

/**
 * @param {'bad'|'none'|'down'|'core'|'old'|'web'} kind
 * @param {string} [message] 桥的原话（`core` 时）
 * @returns {{title: string, why: string, how: string}}
 */
export function offline(kind, message = '') {
  if (kind === 'old') return { title: t('boot.old_title'), why: t('boot.old_why'), how: t('boot.old_how') };
  // 直接连网页软件的（`miyu web` 打开的）：连不上就是网页软件没在跑
  if (kind === 'web') return { title: t('boot.web_title'), why: t('boot.web_why'), how: t('boot.web_how') };
  const title = t('boot.title');
  if (kind === 'core') return { title, why: message, how: t('boot.core_how') };
  if (kind === 'down') return { title, why: t('boot.down_why'), how: t('boot.down_how') };
  return { title, why: t(kind === 'none' ? 'boot.none_why' : 'boot.bad_why'), how: t('boot.key_how') };
}
