// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('#/db', () => ({ db }));

// `#/db/schema` is fully stubbed rather than imported: its `@/types` value
// import can't resolve under vitest (see the repo's other db tests). The table
// is built *inside* the factory — a module-scope const would be referenced
// before initialisation, because vi.mock factories are hoisted above it — and
// then imported back below so assertions can name the same object.
vi.mock('#/db/schema', async () => {
  const { integer, pgTable, varchar } = await import('drizzle-orm/pg-core');
  return {
    userProfileTable: pgTable('user_profiles', {
      id: integer('id').primaryKey(),
      userId: varchar('user_id', { length: 255 }),
      email: varchar('email', { length: 100 }),
    }),
  };
});

import { userProfileTable } from '#/db/schema';
import { ensureUserProfile } from '#/db/user-profile';

/** Chainable drizzle stub that records what `.values()` was handed. */
function makeChain(result: unknown) {
  const chain = {
    valuesArg: undefined as unknown,
    onConflictCalled: false,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
    values: (v: unknown) => {
      chain.valuesArg = v;
      return chain;
    },
    onConflictDoNothing: () => {
      chain.onConflictCalled = true;
      return Promise.resolve(result);
    },
  };
  return chain;
}

beforeEach(() => vi.clearAllMocks());

describe('ensureUserProfile', () => {
  it('inserts the row the FK-dependent tables need', async () => {
    db.select.mockReturnValueOnce(makeChain([])); // no existing profile
    const insertChain = makeChain(undefined);
    db.insert.mockReturnValueOnce(insertChain);

    await ensureUserProfile('user-1', 'pilot@example.com');

    // Asserted on what the insert actually received, not on the call count:
    // a row created without the userId is exactly as broken as no row at all,
    // and thirteen tables key off that column.
    expect(db.insert).toHaveBeenCalledWith(userProfileTable);
    expect(insertChain.valuesArg).toEqual({
      userId: 'user-1',
      email: 'pilot@example.com',
    });
  });

  it('does not write when the profile already exists', async () => {
    db.select.mockReturnValueOnce(makeChain([{ id: 7 }]));

    await ensureUserProfile('user-1', 'pilot@example.com');

    // The repair runs on every authenticated request, so the common path must
    // stay a single read — an unconditional upsert would write on every load.
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('tolerates a concurrent insert rather than throwing', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const insertChain = makeChain(undefined);
    db.insert.mockReturnValueOnce(insertChain);

    await ensureUserProfile('user-1', 'pilot@example.com');

    // Two first requests can race between the read and the write; without
    // this the loser throws a unique violation on a path that runs for every
    // page load.
    expect(insertChain.onConflictCalled).toBe(true);
  });
});
