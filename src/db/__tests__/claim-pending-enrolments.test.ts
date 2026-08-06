// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', async () => {
  const { integer, pgTable, timestamp, varchar } = await import(
    'drizzle-orm/pg-core'
  );
  return {
    courseSubscriptionsTable: pgTable('course_subscriptions', {
      id: integer('id').primaryKey(),
      userId: varchar('user_id', { length: 255 }),
      courseId: integer('course_id'),
      grantedBy: varchar('granted_by', { length: 255 }),
    }),
    coursesTable: pgTable('courses', {
      id: integer('id').primaryKey(),
      name: varchar('name', { length: 255 }),
    }),
    pendingEnrolmentsTable: pgTable('pending_enrolments', {
      id: integer('id').primaryKey(),
      email: varchar('email', { length: 100 }),
      courseId: integer('course_id'),
      addedBy: varchar('added_by', { length: 255 }),
      claimedAt: timestamp('claimed_at'),
    }),
  };
});

import { claimPendingEnrolments } from '#/db/pending-enrolments';
import { courseSubscriptionsTable } from '#/db/schema';

/** Records what each builder was handed so assertions can read it back. */
function makeTx(pendingRows: unknown[]) {
  const calls = {
    insertedInto: undefined as unknown,
    insertedValues: undefined as unknown,
    updateCalled: false,
  };
  const selectChain = {
    from: () => selectChain,
    where: () => Promise.resolve(pendingRows),
  };
  const insertChain = {
    values: (v: unknown) => {
      calls.insertedValues = v;
      return insertChain;
    },
    onConflictDoNothing: () => Promise.resolve(undefined),
  };
  const updateChain = {
    set: () => updateChain,
    where: () => {
      calls.updateCalled = true;
      return Promise.resolve(undefined);
    },
  };
  const tx = {
    select: () => selectChain,
    insert: (table: unknown) => {
      calls.insertedInto = table;
      return insertChain;
    },
    update: () => updateChain,
  };
  return { tx, calls };
}

beforeEach(() => vi.clearAllMocks());

/**
 * The consumer that matters is `course_subscriptions` — an admin who
 * pre-assigned a course expects the learner to actually have it. Asserting the
 * rows the insert received is the only way to see that; the return value would
 * look identical if the mapping were wrong.
 */
describe('claimPendingEnrolments', () => {
  it('turns each pending row into an entitlement for this user', async () => {
    const { tx, calls } = makeTx([
      { id: 1, courseId: 7, addedBy: 'admin-9' },
      { id: 2, courseId: 8, addedBy: 'admin-9' },
    ]);
    db.transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(tx),
    );

    const claimed = await claimPendingEnrolments({
      userId: 'user-1',
      email: 'Pilot@Example.com',
    });

    expect(claimed).toBe(2);
    expect(calls.insertedInto).toBe(courseSubscriptionsTable);
    expect(calls.insertedValues).toEqual([
      { userId: 'user-1', courseId: 7, grantedBy: 'admin-9' },
      { userId: 'user-1', courseId: 8, grantedBy: 'admin-9' },
    ]);
  });

  it('credits the admin who pre-assigned it, not the sign-in', async () => {
    const { tx, calls } = makeTx([{ id: 1, courseId: 7, addedBy: 'admin-9' }]);
    db.transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(tx),
    );

    await claimPendingEnrolments({ userId: 'user-1', email: 'p@e.com' });

    expect((calls.insertedValues as { grantedBy: string }[])[0].grantedBy).toBe(
      'admin-9',
    );
  });

  it('stamps the pending rows claimed so they cannot be applied twice', async () => {
    const { tx, calls } = makeTx([{ id: 1, courseId: 7, addedBy: 'a' }]);
    db.transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(tx),
    );

    await claimPendingEnrolments({ userId: 'user-1', email: 'p@e.com' });

    expect(calls.updateCalled).toBe(true);
  });

  it('writes nothing when there is nothing pending', async () => {
    const { tx, calls } = makeTx([]);
    db.transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(tx),
    );

    const claimed = await claimPendingEnrolments({
      userId: 'user-1',
      email: 'p@e.com',
    });

    // Every uninvited signup takes this path, so it must not touch the DB.
    expect(claimed).toBe(0);
    expect(calls.insertedInto).toBeUndefined();
    expect(calls.updateCalled).toBe(false);
  });
});
