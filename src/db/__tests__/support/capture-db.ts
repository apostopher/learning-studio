/**
 * A Drizzle-shaped chain that records what it was given and resolves to the
 * next queued result (then `[]` forever).
 *
 * Every builder method returns the same object, so `.select().from().where()`
 * chains without a database. `then` makes it awaitable, so a caller that does
 * `await db.select()...` gets a result rather than hanging. The optional
 * `results` queue exists because a read path usually has a guard before the
 * query under test — `getCourseBoard` returns `null` when the course lookup
 * resolves `[]` — so the first awaited chain(s) must resolve something for
 * control flow to reach the query being asserted on. The live queue is
 * returned too, so a file whose `#/db` mock is shared by several tests can
 * seed it per test (`results.push(...)`) rather than once for the file.
 *
 * `joins` holds the joined TABLE (by identity); `joinOn` holds the matching
 * ON condition at the same index, so a test can render it (`render-sql.ts`)
 * and pin the pairing, not just the table. `groupBy` holds the columns
 * handed to `.groupBy()`, flattened in call order, so a grouped query that
 * orders by a column it forgot to group by (a Postgres runtime error no
 * join/where/order assertion can see) is pinnable too.
 */
export type Captured = {
  select: unknown[];
  from: unknown[];
  joins: unknown[];
  joinOn: unknown[];
  where: unknown[];
  orderBy: unknown[];
  groupBy: unknown[];
};

const CHAIN_METHODS = [
  'select',
  'selectDistinct',
  'from',
  'innerJoin',
  'leftJoin',
  'where',
  'orderBy',
  'groupBy',
  'having',
  'limit',
  'offset',
] as const;

export function captureDb(initialResults: unknown[][] = []) {
  const captured: Captured = {
    select: [],
    from: [],
    joins: [],
    joinOn: [],
    where: [],
    orderBy: [],
    groupBy: [],
  };
  const results = [...initialResults];
  // biome-ignore lint/suspicious/noExplicitAny: a stand-in for a builder whose real type is internal to Drizzle
  const chain: any = {};
  for (const name of CHAIN_METHODS) {
    chain[name] = (...args: unknown[]) => {
      if (name === 'select' || name === 'selectDistinct') {
        captured.select.push(args[0]);
      }
      if (name === 'from') captured.from.push(args[0]);
      if (name === 'innerJoin' || name === 'leftJoin') {
        captured.joins.push(args[0]);
        captured.joinOn.push(args[1]);
      }
      if (name === 'where') captured.where.push(args[0]);
      if (name === 'orderBy') captured.orderBy.push(...args);
      if (name === 'groupBy') captured.groupBy.push(...args);
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders (awaitable without a terminal call)
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(results.shift() ?? []).then(resolve, reject);
  return { db: chain, captured, results };
}
