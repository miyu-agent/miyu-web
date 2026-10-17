// @ts-check
//! 装、卸软件包的确认卡片写什么（软件包 `asking` 的 `package-plan.js`；核心 F-10 下上的 `detail.preview`，照命令行 `miyu pkg install` 排）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { packagePlan } from '../../packages/asking/package-plan.js';

const zh = JSON.parse(readFileSync(new URL('../../packages/asking/manifest.json', import.meta.url), 'utf8')).text.zh;
/** 照包里的中文填字；没有的键交回键本身（同 `ctx.text`） */
const t = (path, fields = {}) => {
  const got = path.split('.').reduce((o, k) => o?.[k], zh);
  return typeof got === 'string' ? got.replace(/\{(\w+)\}/g, (_, k) => String(fields[k])) : path;
};
const flat = (plan) => plan && [plan.title, plan.path, ...plan.rows.map((r) => `${r.label}：${r.items.join('、')}`)];

test('装：标题带版本和替换的版本，包文件夹写 ~，包含、无法加载、所需权限、大小照命令行的先后', () => {
  const detail = {
    tool: 'package', install: '/home/me/Downloads/weather-kit',
    preview: {
      package: 'weather-kit', version: '0.2.0', replaces: { version: '0.1.0' }, program: 'process', command: 'weather', page: true,
      mcp: ['weather-api'], skills: ['天气报告'], scripts: ['weather'], settings: 2,
      skipped: [{ file: 'scripts/old.sh', why: 'no description line' }],
      capabilities: [{ id: 'network', name: '联网', summary: null }, { id: 'fs.read' }], files: 3, size: 49152,
    },
  };
  assert.deepEqual(flat(packagePlan(detail, '/home/me', t)), [
    '安装软件包 weather-kit 0.2.0（替换 0.1.0）', '~/Downloads/weather-kit',
    '包含：扩展程序、命令 miyu weather、后台页、MCP 服务 weather-api、技能 天气报告、脚本 weather、2 项设置',
    '无法加载：scripts/old.sh（no description line）',
    '所需权限：联网、fs.read',
    '大小：48 KB，3 个文件',
  ]);
});

test('只带技能、脚本、斜杠命令模板的包（核心 X-14 上的 slash）：没有程序那一项；没有的行不写', () => {
  const plan = packagePlan({ tool: 'package', install: '/w/notes', preview: { package: 'notes', skills: ['take-notes'], scripts: ['dice'], slash: ['review', 'todo'], files: 3, size: 713 } }, null, t);
  assert.deepEqual(flat(plan), ['安装软件包 notes', '/w/notes', '包含：技能 take-notes、脚本 dice、斜杠命令 /review、斜杠命令 /todo', '大小：713 B，3 个文件']);
});

test('带人格、预设的包（核心 P-11 下的 personas、presets）：接在斜杠命令后面、设置前面', () => {
  const plan = packagePlan({ tool: 'package', install: '/w/pets', preview: { package: 'pets', slash: ['pat'], personas: ['cat', 'dog'], presets: ['pet-mode'], settings: 1 } }, null, t);
  assert.deepEqual(flat(plan), ['安装软件包 pets', '/w/pets', '包含：斜杠命令 /pat、人格 cat、人格 dog、预设 pet-mode、1 项设置']);
});

test('卸：一并删除写设置的键和状态目录，设置不算进包含；装回出厂的写恢复', () => {
  const plan = packagePlan({ tool: 'package', remove: 'notes', preview: { package: 'notes', layer: 'home', version: '1.0', settings: ['notes.dir', 'notes.style'], state: true, files: 2, size: 2048 } }, null, t);
  assert.deepEqual(flat(plan), ['卸载软件包 notes 1.0', null, '一并删除：设置 notes.dir、notes.style、状态目录', '大小：2 KB，2 个文件']);
  assert.equal(packagePlan({ tool: 'package', install: '/x', preview: { package: 'net', restores: true } }, null, t)?.title, '恢复软件包 net');
  assert.equal(packagePlan({ tool: 'package', enable: 'kit', preview: { package: 'kit' } }, null, t)?.title, '启用扩展 kit');
});

test('不是装卸包的、没有预览的不管', () => {
  assert.equal(packagePlan({ tool: 'shell', command: 'ls' }, null, t), null);
  assert.equal(packagePlan({ tool: 'package', install: '/x' }, null, t), null);
  assert.equal(packagePlan(undefined, null, t), null);
});
