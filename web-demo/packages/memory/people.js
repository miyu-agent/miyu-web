// @ts-check
//! 记忆页的「认识的人」一页（蓝图 `web.md`「记忆页」第 14 条；核心 E-1 下的人卡，`memory.md`「人卡」）：她认识的人一人一张卡，
//! 排成网格；点开一张在小窗里改叫法、内容，作废、找回；「加一个人」写一张新的。卡跟着记忆一起读（`page.js` 的 `reload`），这里只画、只改。

import { h, icon } from '../../src/lib/dom.js';
import { keywordBox } from './keywords.js';
import { filterButton, filterChips } from './filter.js';
import { CARD_MAX, NAMES_MAX, NAME_MAX, chars, agoText, isRetired, cardMatches, cardChange, cardProblem, cardLimit, splitKeywords } from './model.js';

/**
 * @typedef {{who: string, text: string, names?: string[], at?: string, by?: string, retired?: string|null}} Card
 */

/** 页头两个标签「记忆」「认识的人 N」（旧核心没有人卡的不画）。 @param {import('./page.js').MemoryPage} page */
export function tabsRow(page) {
  if (!page.cards) return null;
  const t = page.t;
  const live = page.cards.filter((c) => !isRetired(c)).length;
  const tab = (/** @type {'memory'|'people'} */ k, /** @type {any[]} */ ...kids) => h(`button.mem-chip.mem-tab${page.tab === k ? '.is-on' : ''}`, {
    type: 'button', onclick: () => { if (page.tab !== k) { page.tab = k; page.filterOpen = false; page.draw(); } },
  }, ...kids);
  return h('div.mem-tabs', tab('memory', t('tabs.memory')), tab('people', t('tabs.people'), h('span.mem-n', String(live))));
}

/** 「认识的人」那一页。 @param {import('./page.js').MemoryPage} page */
export function peoplePage(page) {
  const t = page.t;
  const all = page.cards ?? [];
  const name = page.personas.find((p) => p.persona === page.persona)?.name ?? '';
  const q = page.peopleQuery.trim();
  const shown = all.filter((c) => (page.cardsRetired || !isRetired(c)) && cardMatches(c, q));
  const find = /** @type {HTMLInputElement} */ (h('input.mem-find-input', { type: 'search', value: page.peopleQuery, placeholder: t('people.search'), spellcheck: 'false', autocomplete: 'off' }));
  find.addEventListener('input', (e) => {
    if (/** @type {InputEvent} */ (e).isComposing) return;
    page.peopleQuery = find.value;
    page.draw();
    page.refocus();
  });
  find.addEventListener('compositionend', () => find.dispatchEvent(new Event('input')));
  const add = h('button.set-btn.is-primary', { type: 'button', disabled: !page.persona, onclick: () => { page.person = ''; page.draw(); page.el.querySelector('.mem-card-form .mem-who-input')?.focus(); } },
    icon('plus'), t('people.add'));
  const live = all.filter((c) => !isRetired(c)).length;
  const retired = all.length - live;
  const cards = shown.length
    ? h('div.mem-cards', shown.map((c) => cardNode(page, c, q)))
    : h('p.mem-empty', all.some((c) => !isRetired(c)) || q ? t('people.no_match') : t('people.empty', { name }));
  return h('div.mem-list-page',
    tabsRow(page),
    h('div.mem-tools', page.picker(), h('label.mem-find', icon('search'), find), filterButton(page), add),
    filterChips(page),
    page.tidyingLine(),
    h('div.mem-list', cards),
    h('div.mem-foot.set-pinned', h('span', page.cardsRetired && retired ? t('people.foot_retired', { live, retired }) : t('people.foot', { live }))));
}

/** 一张小卡：是谁和关键词一行、正文（两行截掉）、谁写的 · 多久以前；作废的悬停右下换成「找回」。 @param {import('./page.js').MemoryPage} page @param {Card} c @param {string} q */
function cardNode(page, c, q) {
  const t = page.t;
  const at = c.at ? Date.parse(c.at) : NaN;
  const meta = [t(c.by === 'person' ? 'people.by_person' : 'people.by_module'), Number.isFinite(at) ? agoText(at, Date.now(), t) : ''].filter(Boolean).join(' · ');
  const open = () => { page.person = c.who; page.draw(); };
  return h(`div.mem-card${isRetired(c) ? '.is-retired' : ''}`, { role: 'button', tabindex: '0', onclick: open, onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') open(); } },
    // 头一行：是谁，后面接关键词的小块（一行放不下的截掉）
    h('div.mem-card-head', h('strong.mem-card-who', page.marked(c.who, q)),
      c.names?.length ? h('span.mem-card-names', c.names.map((n) => h('span.mem-who', page.marked(n, q)))) : null),
    h('span.mem-card-text', page.marked(c.text, q)),
    h('span.mem-card-foot',
      h('span.mem-card-meta', meta),
      isRetired(c) ? h('button.set-btn.mem-restore', { type: 'button', onclick: (/** @type {Event} */ e) => { e.stopPropagation(); restoreCard(page, c); } }, icon('rotate-ccw'), t('restore')) : null));
}

/**
 * 一张卡的小窗（`page.person` 是谁；空字符串是「加一个人」）。同记忆详情：一行一项，点遮罩（没改着字的）、`Esc`、✕ 收起。
 * @param {import('./page.js').MemoryPage} page
 */
export function cardPop(page) {
  const t = page.t;
  const adding = page.person === '';
  const all = page.cards ?? [];
  const c = adding ? null : all.find((x) => x.who === page.person) ?? (page.seenCard?.who === page.person ? page.seenCard : null);
  if (!adding && !c) {
    page.person = null;
    return null;
  }
  if (c) page.seenCard = c;
  const ro = !!c && isRetired(c);
  const name = page.personas.find((p) => p.persona === page.persona)?.name ?? '';
  const who = adding ? /** @type {HTMLInputElement} */ (h('input.set-input.mem-who-input', { type: 'text', placeholder: t('add_who'), spellcheck: 'false', autocomplete: 'off' })) : null;
  const names = keywordBox((c?.names ?? []).join(', '), t('detail.keywords_hint'), ro);
  const namesCount = h('span.mem-count', `${c?.names?.length ?? 0} / ${NAMES_MAX}`);
  // 最多几个字：核心拒绝时给了 `data.limit` 的照它（记在这一页上，核心 E-2），没拒过的照 400
  const max = () => page.cardMax ?? CARD_MAX;
  const area = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.set-area.mem-area.mem-card-area', { disabled: ro, rows: '6', placeholder: adding ? t('people.text_hint', { n: max() }) : null }, c?.text ?? ''));
  const count = h('span.mem-count', `${chars(c?.text ?? '')} / ${max()}`);
  // 「加一个人」：这个人已经有卡了的，提示一句、点了打开他的
  // （写着的字不要了：去掉记号，不然重画时当成正在改的、不换）
  const taken = h('button.mem-taken', { type: 'button', hidden: true, onclick: () => {
    const w = who?.value.trim();
    if (!w) return;
    for (const el of [who, names, area]) delete el?.dataset.dirty;
    page.person = w;
    page.draw();
  } });
  const save = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'submit', disabled: true }, t('detail.save')));
  const sync = () => {
    const n = chars(area.value.trim());
    count.textContent = `${n} / ${max()}`;
    count.classList.toggle('is-over', n > max());
    const list = splitKeywords(names.value);
    namesCount.textContent = `${list.length} / ${NAMES_MAX}`;
    namesCount.classList.toggle('is-over', list.length > NAMES_MAX || list.some((x) => chars(x) > NAME_MAX));
    const w = adding ? who?.value.trim() ?? '' : c?.who ?? '';
    const dup = adding && !!w && all.some((x) => x.who === w);
    taken.hidden = !dup;
    taken.textContent = dup ? t('people.taken') : '';
    save.disabled = dup || cardProblem(w, area.value, list, max()) != null || (!adding && !cardChange(/** @type {Card} */ (c), area.value, list));
  };
  for (const el of [who, names, area]) el?.addEventListener('input', () => { el.dataset.dirty = '1'; sync(); });
  const at = c?.at ? Date.parse(c.at) : NaN;
  const row = (/** @type {string} */ label, /** @type {any} */ value) => h('div.mem-field', h('span.mem-label', label), h('div.mem-value', value));
  const form = h('form.mem-detail.mem-card-form',
    ro ? h('div.mem-retired-banner', h('span', c?.retired ? t('detail.retired', { why: c.retired }) : t('detail.retired_plain')), h('button.set-btn', { type: 'button', onclick: () => restoreCard(page, /** @type {Card} */ (c)) }, icon('rotate-ccw'), t('restore'))) : null,
    h('p.mem-gone', { hidden: true }, t('detail.gone')),
    row(t('detail.who'), adding ? [who, taken] : h('span.mem-plain', c?.who ?? '')),
    row(t('people.names'), [names, h('div.mem-kw-foot', h('span.mem-hint', t('people.names_note')), namesCount)]),
    row(t('detail.text'), [area, count]),
    c ? row(t('detail.at'), h('span.mem-plain', [Number.isFinite(at) ? new Date(at).toLocaleDateString() : '', t(c.by === 'person' ? 'people.by_person' : 'people.by_module')].filter(Boolean).join(' · '))) : null,
    ro ? null : h('div.mem-actions', h('span.mem-note'),
      adding
        ? h('button.set-btn', { type: 'button', onclick: () => page.closePerson() }, t('cancel'))
        : h('button.set-btn.is-danger', { type: 'button', onclick: () => forgetCard(page, /** @type {Card} */ (c)) }, icon('trash-2'), t('detail.forget')),
      save));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (save.disabled) return;
    const w = adding ? who?.value.trim() ?? '' : c?.who ?? '';
    save.disabled = true;
    try {
      await page.ctx.core.request('memory.card_update', { persona: page.persona, who: w, text: area.value.trim(), names: splitKeywords(names.value) });
      page.kit.toast(t('detail.saved'));
      for (const el of [who, names, area]) if (el) delete el.dataset.dirty;
      await page.reload();
      page.closePerson();
    } catch (err) {
      page.cardMax = cardLimit(err, max());
      sync();
      if (/** @type {any} */ (err)?.data?.reason === 'memory_too_long') count.classList.add('is-over');
      page.say(page.refusal(err, max()));
      if (/** @type {any} */ (err)?.data?.reason === 'unknown_memory') page.reload();
    }
  });
  return h('div.mem-modal', {
    onclick: (/** @type {Event} */ e) => {
      if (e.target !== e.currentTarget || page.el.querySelector('.mem-card-form [data-dirty]')) return;
      page.closePerson();
    },
  }, h('div.mem-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t(adding ? 'people.add' : 'tabs.people') },
    h('div.mem-pop-head', h('strong', t(adding ? 'people.add' : 'tabs.people')), adding ? null : h('span.mem-detail-id', `${name} · ${c?.who ?? ''}`),
      h('button.icon-button.mem-pop-close', { type: 'button', title: t('close'), 'aria-label': t('close'), onclick: () => page.closePerson() }, icon('x'))),
    form));
}

/** 作废一张卡：收起小窗，提示怎么找回。 @param {import('./page.js').MemoryPage} page @param {Card} c */
async function forgetCard(page, c) {
  try {
    await page.ctx.core.request('memory.card_forget', { persona: page.persona, who: c.who });
    page.kit.toast(page.t('forgot'));
    await page.reload();
    page.closePerson();
  } catch (err) {
    page.say(page.refusal(err, page.cardMax ?? CARD_MAX));
    if (/** @type {any} */ (err)?.data?.reason === 'unknown_memory') page.reload();
  }
}

/** 找回一张作废的卡：照原来的正文、叫法再写一张（核心：作废了的也重新算数）。 @param {import('./page.js').MemoryPage} page @param {Card} c */
async function restoreCard(page, c) {
  try {
    await page.ctx.core.request('memory.card_update', { persona: page.persona, who: c.who, text: c.text, names: c.names ?? [] });
    page.kit.toast(page.t('restored'));
    await page.reload();
  } catch (err) {
    page.say(page.refusal(err, page.cardMax ?? CARD_MAX));
  }
}
