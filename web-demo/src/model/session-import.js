// @ts-check
//! 导入会话（蓝图 `web.md`「全部会话」的「导入会话…」，核心 SE-1 下 `session.import`，设计 58 第二节，W-1094）：回应、拒绝换成
//! 界面要做的事。纯函数，字由界面照 `key` 取（`sessions_page.import_*`）。

/** 认得、另写了一句人话的拒绝（别的照核心给的话写） */
const KNOWN = ['bad_bundle', 'bundle_mismatch', 'bundle_too_new', 'unknown_attachment'];

/**
 * 导入成了以后：打开包的主会话（`main`）；`present` 是早就在的那几个编号（重导同一个包什么都不变，主会话就在里面），那样的多提示一句。
 * @param {any} reply `session.import` 的回应 `{main, sessions, present}`
 * @returns {{open: string|null, present: boolean}}
 */
export function importDone(reply) {
  const main = typeof reply?.main === 'string' && reply.main ? reply.main : null;
  const present = !!main && Array.isArray(reply?.present) && reply.present.includes(main);
  return { open: main, present };
}

/**
 * 导入被拒了怎么说：认得的原因码一种一句（`key`）；`session_exists`（已有同编号、内容不一样的）带上撞的那个编号（`data.session`），
 * 界面打开它；别的（上传时就被拒的、`internal_error` 这类）照核心给的话写（`key` 是 `other`，`reason` 是那一句）。
 * @param {any} err 核心的拒绝（`Refusal`）或别的错
 * @returns {{key: string, session?: string|null, reason?: string}}
 */
export function importRefusal(err) {
  const reason = err?.reason;
  if (reason === 'session_exists') {
    const session = err?.data?.session;
    return { key: 'session_exists', session: typeof session === 'string' && session ? session : null };
  }
  if (KNOWN.includes(reason)) return { key: reason };
  const message = typeof err?.message === 'string' && err.message ? err.message : String(err);
  return { key: 'other', reason: message };
}
