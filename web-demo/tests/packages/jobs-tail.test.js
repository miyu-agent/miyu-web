// @ts-check
//! 后台命令预览接着读（核心 V-6 上 `job.output` 带 `after`）：一共几行页面自己数，露着的只留最后几行。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tail } from '../../packages/jobs/tail.js';

test('第一次照核心的 lines；接上的段数换行；上一段末尾没有换行的那一行不再加一', () => {
  const tail = new Tail(200);
  tail.first('a\nb\nhal', 3);
  assert.equal(tail.total, 3);
  tail.add('f\nc\n');
  assert.equal(tail.total, 4, 'hal + f 还是那一行，接着 c');
  assert.equal(tail.text, 'a\nb\nhalf\nc\n');
  tail.add('d');
  assert.equal(tail.total, 5);
  tail.add('');
  assert.equal(tail.total, 5, '空的一段不变');
});

test('第一次被截了的（lines 比交的多）：一共几行照核心的，接着往上加', () => {
  const tail = new Tail(2);
  tail.first('y\nz\n', 1000);
  tail.add('n1\nn2\n');
  assert.equal(tail.total, 1002);
  assert.equal(tail.text, 'n1\nn2\n', '只留最后 2 行');
  assert.equal(tail.shown, 2);
});

test('只留最后几行：末尾没换行的那一行也算一行', () => {
  const tail = new Tail(2);
  tail.first('', 0);
  assert.equal(tail.total, 0);
  tail.add('1\n2\n3');
  assert.equal(tail.text, '2\n3');
  assert.equal(tail.total, 3);
  tail.add('4\n');
  assert.equal(tail.text, '2\n34\n');
  assert.equal(tail.total, 3);
});
