/**
 * Whether a user's subscriptions identify them as an "associate" (as opposed
 * to a candidate, reviewer, SME, etc): true only when `'associate'` is the
 * sole subscription. Pure — no DB access — so it's unit tested directly (see
 * __tests__/is-associate.test.ts) and can be statically imported by
 * src/ai/chat.ts without pulling in `@/db` transitively.
 */
export function isAssociateFrom(subscriptions: string[]): boolean {
  return subscriptions.includes('associate') && subscriptions.length === 1;
}
