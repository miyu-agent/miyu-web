// @ts-check
//! 重画时留着没变的块（蓝图 `web.md`「点开思考」，W-1075）：拖着选字时选区的起点不被换走。DOM 换成只认这几个方法的假节点。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patch } from '../src/markdown/patch.js';

/** 假的一块：内容一样就算一样；`remove` 从所在的容器里拿掉。 */
class Node {
  /** @param {string} text */
  constructor(text) {
    this.text = text;
    /** @type {Box|null} */
    this.parent = null;
  }
  /** @param {Node} other */
  isEqualNode(other) {
    return other.text === this.text;
  }
  remove() {
    if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1);
    this.parent = null;
  }
}

class Box {
  /** @param {string[]} texts */
  constructor(texts = []) {
    /** @type {Node[]} */
    this.childNodes = [];
    this.append(...texts.map((t) => new Node(t)));
  }
  /** @param {Node[]} nodes */
  append(...nodes) {
    for (const n of nodes) {
      n.remove();
      n.parent = this;
      this.childNodes.push(n);
    }
  }
  texts() {
    return this.childNodes.map((n) => n.text);
  }
}

test('后面接着长：开头没变的几块还是原来的节点，只换最后那块、接上新的', () => {
  const box = new Box(['a', 'b', 'c半']);
  const [a, b] = box.childNodes;
  patch(box, new Box(['a', 'b', 'c全', 'd']));
  assert.deepEqual(box.texts(), ['a', 'b', 'c全', 'd']);
  assert.equal(box.childNodes[0], a, '拖选起点所在的那一块没被换掉');
  assert.equal(box.childNodes[1], b);
});

test('滚动预览往后挪了开头：先去掉挪走的那几块，后面一样的照旧留着', () => {
  const box = new Box(['a', 'b', 'c', 'd']);
  const c = box.childNodes[2];
  patch(box, new Box(['c', 'd', 'e']));
  assert.deepEqual(box.texts(), ['c', 'd', 'e']);
  assert.equal(box.childNodes[0], c);
});

test('中间变了：从变了的那块起往后全换', () => {
  const box = new Box(['a', 'b', 'c']);
  const a = box.childNodes[0];
  const c = box.childNodes[2];
  patch(box, new Box(['a', 'x', 'c']));
  assert.deepEqual(box.texts(), ['a', 'x', 'c']);
  assert.equal(box.childNodes[0], a);
  assert.notEqual(box.childNodes[2], c, '变了的后面不再比，照新的');
});

test('变短、清空、头一次画都和整个换掉一样', () => {
  const box = new Box(['a', 'b', 'c']);
  patch(box, new Box(['a']));
  assert.deepEqual(box.texts(), ['a']);
  patch(box, new Box([]));
  assert.deepEqual(box.texts(), []);
  patch(box, new Box(['x', 'y']));
  assert.deepEqual(box.texts(), ['x', 'y']);
});

test('完全不一样的：全换', () => {
  const box = new Box(['a', 'b']);
  patch(box, new Box(['x', 'y', 'z']));
  assert.deepEqual(box.texts(), ['x', 'y', 'z']);
});
