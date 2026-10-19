// @ts-check
//! 全部会话的「项目」那一页和一个项目的页（蓝图 `web.md`「会话整理和项目」第 6、7 条）：
//! - 「项目」那一页：一个项目一张卡片，名字前面项目颜色的文件夹、说明、「N 个会话 · 最近活动」（不画字母方块），最后一张虚线的「新建项目」；搜索照名字、说明筛。
//! - 项目页：顶上一行「全部项目 / 名字」可点回去；大标题前面项目颜色的文件夹；右边「项目设置」「在项目里新建」；说明；「在这个项目里新建的会话照这几样」
//!   一块（`surface_2` 底）：工作区目录、人格、预设、附加提示词、留言；下面它的会话（同全部会话的一行，不带项目标签，`sessions-page.js` 画）。

import { h, icon } from './dom.js';
import { t } from '../util/res.js';
import { ago } from '../model/ago.js';
import { projectStats } from '../model/session-filter.js';

/**
 * 「项目」那一页的卡片。
 * @param {import('./sessions-page.js').SessionsPage} page @param {import('../model/session-filter.js').Row[]} rows
 */
export function projectCards(page, rows) {
  const projects = page.projects();
  const stats = projectStats(rows, projects);
  const q = page.query;
  const shown = q ? projects.filter((p) => `${p.name}\n${p.description ?? ''}`.toLowerCase().includes(q)) : projects;
  const now = Date.now();
  const cards = shown.map((p) => {
    const s = stats.get(p.project) ?? { count: 0, active: null };
    const color = page.on.color(p.color);
    return h('button.project-card', { type: 'button', style: color ? `--project-color: ${color}` : null, onclick: () => page.go('project', p.project) },
      h('span.project-card-name', icon('folder'), h('strong', p.name)),
      p.description ? h('span.project-card-desc', p.description) : null,
      h('span.project-card-meta', s.count
        ? t('sessions_page.project_meta', { count: s.count, when: s.active != null ? ago(s.active, now) : '' })
        : t('sessions_page.project_none')));
  });
  return h('div.project-cards', cards,
    q && !cards.length ? h('div.sessions-empty', t('sessions_page.no_match')) : null,
    q ? null : h('button.project-card.is-new', { type: 'button', onclick: () => page.on.editProject(null) }, icon('plus'), h('span', t('sidebar.new_project'))));
}

/**
 * 项目页的上半截：路径、标题和两个按钮、说明、新建会话照的那几样。
 * @param {import('./sessions-page.js').SessionsPage} page @param {import('../core/projects.js').Project} p
 */
export function projectView(page, p) {
  const color = page.on.color(p.color);
  const persona = !('persona' in p) ? t('project_page.default') : p.persona === null ? t('project_page.no_persona') : page.on.personaName(p.persona ?? '');
  const line = (/** @type {string} */ name, /** @type {Node|string} */ value, /** @type {boolean} */ faint = false) =>
    h('div.project-default', h('span.project-default-name', name), h(`span.project-default-value${faint ? '.is-faint' : ''}`, value));
  return h('div.project-page', { style: color ? `--project-color: ${color}` : null },
    h('nav.project-crumbs',
      h('button.project-crumb', { type: 'button', onclick: () => page.go('projects') }, t('project_page.all')),
      h('span.project-crumb-sep', '/'),
      h('span.project-crumb.is-here', p.name)),
    h('header.project-head',
      h('h1.project-title', icon('folder'), h('span', p.name)),
      h('div.sessions-tools',
        h('button.sessions-button', { type: 'button', onclick: () => page.on.editProject(p.project) }, icon('settings'), t('project_page.settings')),
        h('button.sessions-button.is-primary', { type: 'button', onclick: () => { page.close(); page.on.newIn(p.project); } }, icon('plus'), t('project_page.new_session')))),
    p.description ? h('p.project-desc', p.description) : null,
    h('section.project-defaults',
      h('h2.project-defaults-title', t('project_page.defaults')),
      line(t('project_page.workspace'), p.workspace ?? t('project_page.default_workspace'), !p.workspace),
      line(t('project_page.persona'), persona, !('persona' in p)),
      line(t('project_page.preset'), p.preset ? page.on.presetName(p.preset) : t('project_page.default'), !p.preset),
      line(t('project_page.prompt'), p.prompt ? h('span.project-prompt', p.prompt) : t('project_page.none'), !p.prompt),
      line(t('project_page.messages'), t(p.open ? 'project_page.messages_open' : 'project_page.messages_inside'))));
}
