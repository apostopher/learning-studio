/**
 * The org this deployment administers, from `ACTIVE_ORG_ID`.
 *
 * Personas are org-level, so nearly every persona read and write needs an org
 * to scope against. There is no org on the session (`requireAdmin` returns
 * `{ userId, roles }`) and a user can belong to several orgs, so the active org
 * is deployment configuration rather than something derived per request.
 *
 * Deliberately throws rather than falling back to "the first org": org ids are
 * `generatedAlwaysAsIdentity` and differ between databases, so a silent
 * fallback would quietly attach personas to whichever org happened to exist —
 * a wrong answer with no signal. A missing variable should stop the request.
 */

class MissingActiveOrgError extends Error {
  constructor(detail: string) {
    super(
      `ACTIVE_ORG_ID ${detail}. Set it to the id of the org this deployment administers (see docs/superpowers/specs/2026-08-06-org-personas.md).`,
    );
    this.name = 'MissingActiveOrgError';
  }
}

/**
 * Read once per call rather than caching at module scope: `process.env` is
 * populated by different mechanisms across dev, build and test, and a
 * module-level constant would freeze whatever was set at import time.
 */
export function getActiveOrgId(): number {
  const raw = process.env.ACTIVE_ORG_ID;
  if (raw === undefined || raw.trim() === '') {
    throw new MissingActiveOrgError('is not set');
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new MissingActiveOrgError(`is not a positive integer (got "${raw}")`);
  }
  return id;
}
