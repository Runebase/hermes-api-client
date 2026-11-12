// src/errors.mjs

/**
 * What every client method throws when a Hermes call fails (since 0.3.4).
 *
 * The message is what it always was: Hermes' `error` text, or the method's
 * own fallback ("Failed to post guild tip") when the answer has none or there
 * was no answer. Besides it:
 * - `status`: the HTTP status Hermes answered (400, 409, 504, …), or `null`
 *   when there was no answer (a timeout, a refused or reset connection).
 * - `noResponse`: `true` exactly when `status` is `null`. A call without an
 *   answer may or may not have reached Hermes and run.
 * - `code`: with an answer, Hermes' own `code` from its body
 *   (`job_timeout`, `duplicate_idempotency_key`, …), or `null` when it sent
 *   none; without an answer, the network error's code (`ECONNREFUSED`,
 *   `ECONNRESET`, `ECONNABORTED` for the client's own `timeout`, …), or `null`.
 * - `body`: the answer's body as Hermes sent it (usually `{ error, … }`), or
 *   `null` without an answer.
 * - `cause`: the underlying error (axios'), for logs.
 */
export class HermesApiError extends Error {
  constructor(message, { status = null, code = null, body = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'HermesApiError';
    this.status = status;
    this.noResponse = status === null;
    this.code = code;
    this.body = body;
  }
}

/**
 * Turn what a client method caught into the HermesApiError it throws, with
 * the same message as before 0.3.4 (`error.response?.data?.error || fallback`).
 * @param {unknown} error - an axios error, or a HermesApiError from a call the
 *   method made first (a guild session refresh after a 401: its answer is kept)
 * @param {string} fallback - the method's message when Hermes sent none
 * @returns {HermesApiError}
 */
export function toHermesApiError(error, fallback) {
  const response = error?.response;
  if (response) {
    const body = response.data ?? null;
    const code = typeof body?.code === 'string' ? body.code : null;
    return new HermesApiError(body?.error || fallback, { status: response.status, code, body, cause: error });
  }
  if (error instanceof HermesApiError) {
    return new HermesApiError(fallback, { status: error.status, code: error.code, body: error.body, cause: error });
  }
  const code = typeof error?.code === 'string' ? error.code : null;
  return new HermesApiError(fallback, { status: null, code, body: null, cause: error });
}
