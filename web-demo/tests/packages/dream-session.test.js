// @ts-check
//! 整理会话里的一批（核心 D-2 上）：请求数几段、回答读成一条条决定。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestOf, answerOf, decisionsOf } from '../../packages/memory/dream-session-model.js';

const REQUEST = `Below are your memories. Tidy them up.

Reply with only a JSON object: {"revised": [], "retired": [], "summary": "..."}.

Current summary: 用户喜欢猫。

Saved since the summary:
m38 user 2026-10-22: 喜欢猫

m39 user 2026-10-22: 喜欢猫，尤其是橘猫

m40 user 2026-10-22: 住在大阪


Older related memories:
m13 user 2026-10-13: 我喜欢猫

Other older memories to look over again:
m2 feedback 2026-10-01: 回答要短
m3 episode 2026-10-02: 修了 CI
`;

test('请求：照段头数新记的、相关的、重看的，编号对上正文；一行记忆都没有的不数', () => {
  const got = requestOf(REQUEST);
  assert.deepEqual(got.counts, { fresh: 3, related: 1, review: 2 });
  assert.equal(got.texts.get('m39'), '喜欢猫，尤其是橘猫');
  assert.equal(got.texts.get('m13'), '我喜欢猫');
  assert.deepEqual(requestOf('随便一段字').counts, null);
});

test('回答：读成改写、删、摘要（代码块包着的也认）；还在写、写坏的是 null；原来的正文照请求，查不到写编号', () => {
  const text = '```json\n{"revised":[{"id":"m40","text":"住在东京"}],"retired":[{"id":"m38","kind":"repeat","by":"m39","why":"重复"},{"id":"m99","kind":"worthless","why":"一次性"}],"summary":"喜欢橘猫。"}\n```';
  const a = answerOf(text);
  assert.ok(a);
  assert.deepEqual(decisionsOf(/** @type {any} */ (a), requestOf(REQUEST).texts), [
    { kind: 'revised', from: '住在大阪', to: '住在东京' },
    { kind: 'retired', what: '喜欢猫', why: '重复', retire: 'repeat' },
    { kind: 'retired', what: 'm99', why: '一次性', retire: 'worthless' },
    { kind: 'summary', text: '喜欢橘猫。' },
  ]);
  assert.equal(answerOf('{"revised":[{"id":"m1"'), null);
  assert.equal(answerOf('[]'), null);
  assert.deepEqual(answerOf('{"revised":[],"retired":[],"summary":""}'), { revised: [], retired: [], summary: null });
});
