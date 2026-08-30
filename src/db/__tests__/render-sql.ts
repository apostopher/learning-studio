import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * Render a captured drizzle condition/expression (an `eq`/`and`/`inArray`
 * tree, or a raw `sql\`...\`` fragment) to its exact parameterized SQL text —
 * no database needed. This is the house pattern for proving what a query
 * builder call actually referenced, as opposed to `collectSqlTokens`
 * (`sql-tokens.ts`), which only proves PRESENCE of a column/value somewhere
 * in the tree.
 *
 * Presence is not proof of pairing: `collectSqlTokens` would pass a WHERE
 * that pairs `moduleId` with the wrong value, or a join that references the
 * right two columns but on the wrong side of `=`, as long as every token
 * appears *somewhere*. Exact SQL text pins the pairing, the boolean shape
 * (`and` vs `or`, `is null` vs `is not null`), and — for a join condition
 * specifically — the join order (a reordered join renders a different string
 * at the position under test, since each side names its own table).
 *
 * Assert with `toBe` on the FULL rendered string, per join/condition,
 * located by index or position — never `toContain`, never a search over a
 * flattened bag of conditions.
 *
 * Originally duplicated inline across `library-placement-scoping.test.ts`,
 * `learner-read-placements.test.ts` and `admin-course-cache-invalidation
 * .test.ts` (Task 5b/5c/5d). Promoted to one shared copy here (Task 5e, Part
 * 1): this build has already shipped one token extractor
 * (`collectSqlTokens`) that silently stringified an object to
 * `"[object Object]"` and passed anyway — a single shared copy means a fix to
 * that class of bug only has to happen once. Verified against this repo's
 * installed `drizzle-orm` (`^0.45.1`).
 */
const dialect = new PgDialect();

export function renderSql(condition: SQL): string {
  return dialect.sqlToQuery(condition).sql;
}

/** The bound parameter values for a captured condition, in positional order. */
export function renderSqlParams(condition: SQL): unknown[] {
  return dialect.sqlToQuery(condition).params;
}
