// @ts-check
//! 把一个 `list` 挂载位画进一个节点（蓝图 `web/architecture.md`「挂载位」）：挂的东西变了跟着增删、照先后排；每件的画法交回
//! 一个节点，或者 `{el, dispose}`（拿下来时调 `dispose`）；画的时候抛错的，那一格换成 `failed` 画的「这一块出错了」，别的照常。

/**
 * @typedef {{list: (name: string) => any[], watch: (name: string, fn: () => void) => () => void,
 *   draw: (entry: any, ...args: any[]) => any}} SlotsApi 按包绑的一份挂载位（`ctx.slots`）
 */

/**
 * @param {HTMLElement} host 画在哪
 * @param {SlotsApi} slots
 * @param {string} name 挂载位
 * @param {(owner: string, reason: string) => Node} failed 抛错的那一格画什么
 * @returns {() => void} 不画了：拿下画的，调每件的 `dispose`
 */
export function mountList(host, slots, name, failed) {
  /** @type {Map<any, {el: Node, dispose?: () => void}>} */
  const drawn = new Map();
  const drop = (entry, d) => {
    try {
      d.dispose?.();
    } catch (err) {
      console.error(`${entry.owner} 挂的 ${entry.id} 拿下来时出错了`, err);
    }
    d.el.parentNode?.removeChild(d.el);
    drawn.delete(entry);
  };
  const sync = () => {
    const entries = slots.list(name);
    for (const [entry, d] of [...drawn]) if (!entries.includes(entry)) drop(entry, d);
    /** @type {Node|null} */
    let prev = null;
    for (const entry of entries) {
      let d = drawn.get(entry);
      if (!d) {
        const out = slots.draw(entry);
        d = out instanceof Node ? { el: out } : out?.failed ? { el: failed(out.owner, out.reason) } : out;
        if (!d?.el) d = { el: failed(entry.owner, '画法没有交回节点') };
        drawn.set(entry, d);
      }
      const want = prev ? prev.nextSibling : host.firstChild;
      if (want !== d.el) host.insertBefore(d.el, want);
      prev = d.el;
    }
  };
  const stop = slots.watch(name, sync);
  sync();
  return () => {
    stop();
    for (const [entry, d] of [...drawn]) drop(entry, d);
  };
}

/**
 * 把一个 `single` 挂载位画进一个节点：有挂的照它画（交回节点、`{el, dispose}`；交 `null` 是什么都不画，就是藏掉），没挂的空着、`host` 藏着；
 * `onChange(有没有挂)` 让声明的包把原来那一块藏起来、露出来（左上角的头像、名字，蓝图「左栏」第 1 条）。画的时候抛错的照 `failed` 画。
 * @param {HTMLElement} host @param {SlotsApi & {single: (name: string) => any}} slots @param {string} name
 * @param {(owner: string, reason: string) => Node} failed @param {(on: boolean) => void} onChange
 * @returns {() => void}
 */
export function mountSingle(host, slots, name, failed, onChange) {
  /** @type {{el: Node, dispose?: () => void}|null} */
  let drawn = null;
  /** 画着的那一件（`undefined` 是还没同步过：第一次一定同步一遍） @type {any} */
  let current;
  const drop = () => {
    if (!drawn) return;
    try {
      drawn.dispose?.();
    } catch (err) {
      console.error(`${current?.owner} 挂的 ${current?.id} 拿下来时出错了`, err);
    }
    drawn.el.parentNode?.removeChild(drawn.el);
    drawn = null;
  };
  const sync = () => {
    const entry = slots.single(name) ?? null;
    if (entry === current) return;
    drop();
    current = entry;
    if (entry) {
      const out = slots.draw(entry);
      drawn = out === null ? null : out instanceof Node ? { el: out } : out?.failed ? { el: failed(out.owner, out.reason) } : out?.el ? out : { el: failed(entry.owner, '画法没有交回节点') };
      if (drawn) host.append(drawn.el);
    }
    host.hidden = !drawn;
    onChange(!!entry);
  };
  const stop = slots.watch(name, sync);
  sync();
  return () => {
    stop();
    drop();
    current = null;
    host.hidden = true;
    onChange(false);
  };
}
