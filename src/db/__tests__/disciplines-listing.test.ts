// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * Task 15: the discipline listing behind `/admin/disciplines`, and the delete
 * that has to refuse rather than let `lessons.discipline_id`'s
 * `on delete no action` surface as a 500.
 *
 * Real `pgTable` stubs, `#/db` fully mocked, never `importOriginal` — the
 * house pattern from `editor-queries.test.ts`. `#/` not `@/`: vitest cannot
 * resolve the `@/` alias.
 */
const disciplinesTable = pgTable('disciplines', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
  orgId: integer('org_id'),
  updatedAt: text('updated_at'),
});
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  name: text('name'),
  disciplineId: integer('discipline_id'),
  orgId: integer('org_id'),
});

type Capture = {
  projections: unknown[];
  leftJoins: SQL[];
  wheres: SQL[];
};

/**
 * A chainable, thenable stub that records the projection, every join condition
 * and every WHERE, in call order.
 *
 * Recording rather than the argument-discarding `makeChain` because every
 * claim in this file is about WHICH columns were paired: a chain that throws
 * its arguments away would pass a listing that counted the wrong table, joined
 * on the wrong column, or filtered no org at all.
 */
function chainFor(result: unknown, capture: Capture) {
  const chain = {
    from: () => chain,
    leftJoin: (_table: unknown, condition: SQL) => {
      capture.leftJoins.push(condition);
      return chain;
    },
    where: (condition: SQL) => {
      capture.wheres.push(condition);
      return chain;
    },
    groupBy: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const db = vi.hoisted(() => ({ select: vi.fn(), delete: vi.fn() }));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ disciplinesTable, lessonsTable }));

const { deleteDiscipline, findDisciplineInOrg, listDisciplines } = await import(
  '#/db/disciplines'
);

let capture: Capture;

/** Queue one result per `db.select()` call, in order. */
function queueSelects(...results: unknown[]) {
  let call = 0;
  db.select.mockImplementation((projection: unknown) => {
    capture.projections.push(projection);
    const result = results[call] ?? [];
    call += 1;
    return chainFor(result, capture);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capture = { projections: [], leftJoins: [], wheres: [] };
});

describe('listDisciplines — the counts the screen reports', () => {
  it('reports each discipline with its own lesson count', async () => {
    queueSelects(
      [
        { id: 1, name: 'Aerodynamics', slug: 'aerodynamics', lessonCount: 12 },
        { id: 2, name: 'Navigation', slug: 'navigation', lessonCount: 0 },
      ],
      [{ value: 5 }],
    );

    const listing = await listDisciplines(7);

    expect(listing.disciplines).toEqual([
      { id: 1, name: 'Aerodynamics', slug: 'aerodynamics', lessonCount: 12 },
      { id: 2, name: 'Navigation', slug: 'navigation', lessonCount: 0 },
    ]);
  });

  /**
   * The count has to be `count(lessons.id)`, not `count()`.
   *
   * Mutant seen RED: `lessonCount: count()`. Over a LEFT join that is
   * `count(*)`, which counts the synthetic all-null row — so a brand-new
   * discipline holding nothing reports "1 lesson", and its Delete control
   * locks itself the moment it is created. The mutant is correct-shaped
   * (`count` is imported either way, the type is still `number`) and only the
   * rendered SQL tells them apart.
   */
  it('counts the lessons column, so an empty discipline counts zero', async () => {
    queueSelects([], [{ value: 0 }]);

    await listDisciplines(7);

    const projection = capture.projections[0] as { lessonCount: SQL };
    expect(renderSql(projection.lessonCount)).toBe('count("lessons"."id")');
  });

  /**
   * Mutant seen RED: `eq(lessonsTable.orgId, disciplinesTable.id)` — a join
   * between two integer columns that type-checks perfectly and pairs every
   * discipline with every lesson of the org whose id happens to match.
   */
  it('joins lessons to disciplines on discipline_id', async () => {
    queueSelects([], [{ value: 0 }]);

    await listDisciplines(7);

    expect(capture.leftJoins).toHaveLength(1);
    expect(renderSql(capture.leftJoins[0])).toBe(
      '"lessons"."discipline_id" = "disciplines"."id"',
    );
  });

  /**
   * Mutant seen RED: the org filter dropped from the listing query — every
   * org's disciplines on one org's screen, with no visible symptom in a
   * single-org deployment until the second org exists.
   */
  it('scopes the listing to the org', async () => {
    queueSelects([], [{ value: 0 }]);

    await listDisciplines(7);

    expect(renderSql(capture.wheres[0])).toBe('"disciplines"."org_id" = $1');
    expect(renderSqlParams(capture.wheres[0])).toEqual([7]);
  });

  /**
   * The "Untitled" queue: lessons with `discipline_id IS NULL` are admin-only
   * by design (`requireLessonContentPermission` falls back to `requireAdmin`),
   * so an admin needs to see how many are waiting to be filed.
   *
   * Mutant seen RED: `isNotNull(lessonsTable.disciplineId)` — one character of
   * difference, a plausible number on screen, and exactly backwards. The
   * rendered SQL is the only thing that separates them, which is why this
   * asserts the full string and the bound org id rather than the returned
   * count alone.
   */
  it('counts the unfiled lessons of this org, and only the unfiled ones', async () => {
    queueSelects([], [{ value: 5 }]);

    const listing = await listDisciplines(7);

    expect(listing.unfiledLessonCount).toBe(5);
    expect(renderSql(capture.wheres[1])).toBe(
      '("lessons"."org_id" = $1 and "lessons"."discipline_id" is null)',
    );
    expect(renderSqlParams(capture.wheres[1])).toEqual([7]);
  });

  /**
   * Mutant seen RED: `unfiledLessonCount: unfiled?.value ?? listing.length`
   * or any other non-zero default. An org with nothing unfiled must report 0,
   * not a number borrowed from somewhere else.
   */
  it('reports zero unfiled lessons when the count query comes back empty', async () => {
    queueSelects([], []);

    const listing = await listDisciplines(7);

    expect(listing.unfiledLessonCount).toBe(0);
  });
});

describe('deleteDiscipline — refusing while lessons remain', () => {
  /**
   * `lessons.discipline_id` is `on delete no action`, so the alternative to
   * refusing is a foreign-key violation nobody catches, surfacing as a 500.
   *
   * Mutant seen RED: the pre-count removed, leaving only the `catch` backstop
   * — the DELETE is then issued, `db.delete` HAS been called, and this fails.
   * That is the whole point of asserting on the absence of the write rather
   * than on the returned reason: a function that deletes first and apologises
   * afterwards returns the same object.
   */
  it('refuses with the count, and issues no delete', async () => {
    queueSelects([{ id: 3 }], [{ value: 12 }]);
    db.delete.mockImplementation(() => {
      throw new Error('delete must not be issued');
    });

    const result = await deleteDiscipline(7, 3);

    expect(result).toEqual({
      ok: false,
      reason: 'has-lessons',
      lessonCount: 12,
    });
    expect(db.delete).not.toHaveBeenCalled();
  });

  /**
   * Mutant seen RED: the count query scoped by `orgId` as well as discipline.
   * The foreign key is not org-aware, so an org-scoped count could report 0
   * for a discipline the database will still refuse to drop — a refusal
   * promised and then not delivered.
   */
  it('counts every lesson pointing at the discipline, whatever org it is in', async () => {
    queueSelects([{ id: 3 }], [{ value: 1 }]);

    await deleteDiscipline(7, 3);

    // `wheres[1]`, not `[0]`: the org-ownership resolution queries first.
    expect(renderSql(capture.wheres[1])).toBe('"lessons"."discipline_id" = $1');
    expect(renderSqlParams(capture.wheres[1])).toEqual([3]);
  });

  /**
   * Mutant seen RED: the delete scoped by id alone. A discipline id from
   * another org would then be deleted rather than reported missing.
   */
  it('deletes an empty discipline, scoped to the org', async () => {
    queueSelects([{ id: 3 }], [{ value: 0 }]);
    let where: SQL | undefined;
    db.delete.mockImplementation(() => ({
      where: (condition: SQL) => {
        where = condition;
        return { returning: () => Promise.resolve([{ id: 3 }]) };
      },
    }));

    const result = await deleteDiscipline(7, 3);

    expect(result).toEqual({ ok: true });
    if (!where) throw new Error('no WHERE was issued');
    expect(renderSql(where)).toBe(
      '("disciplines"."org_id" = $1 and "disciplines"."id" = $2)',
    );
    expect(renderSqlParams(where)).toEqual([7, 3]);
  });

  it('reports a row the delete did not match as not found', async () => {
    queueSelects([{ id: 3 }], [{ value: 0 }]);
    db.delete.mockImplementation(() => ({
      where: () => ({ returning: () => Promise.resolve([]) }),
    }));

    expect(await deleteDiscipline(7, 3)).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  /**
   * The count is deliberately NOT org-scoped, because it has to match what the
   * foreign key will act on. The side effect, before this gate existed, was
   * that deleting another org's discipline answered 409 naming that org's
   * exact lesson count — a curriculum's size disclosed to an admin who does
   * not administer it, where an unowned id must read as "not found".
   *
   * Mutant seen RED: the ownership resolution moved to AFTER the count (or
   * removed). The count query then runs and `has-lessons` comes back with the
   * number in it, so both assertions fail.
   */
  it("reports another org's discipline as not found, without counting its lessons", async () => {
    queueSelects([]);
    db.delete.mockImplementation(() => {
      throw new Error('delete must not be issued');
    });

    const result = await deleteDiscipline(7, 3);

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    // One query only — the ownership check. No lesson count was taken, so no
    // count could leak into a refusal message.
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe('findDisciplineInOrg — the ownership gate', () => {
  /**
   * The single definition of "this deployment administers that discipline",
   * shared by `deleteDiscipline` and both staff writes.
   *
   * Mutant seen RED: `eq(disciplinesTable.orgId, disciplineId)` paired with
   * `eq(disciplinesTable.id, orgId)` — the two arguments swapped. Both are
   * integers, it type-checks, and the rendered SQL is IDENTICAL; only the
   * bound params tell them apart, which is why this asserts both.
   */
  it('matches on id AND org_id, in that pairing', async () => {
    queueSelects([{ id: 3 }]);

    expect(await findDisciplineInOrg(7, 3)).toEqual({ id: 3 });
    expect(renderSql(capture.wheres[0])).toBe(
      '("disciplines"."id" = $1 and "disciplines"."org_id" = $2)',
    );
    expect(renderSqlParams(capture.wheres[0])).toEqual([3, 7]);
  });

  /**
   * Mutant seen RED: `return row ?? { id: disciplineId }` — a fabricated row
   * for an id nobody owns, which reopens every gate built on this function at
   * once.
   */
  it('returns null for a discipline this org does not own', async () => {
    queueSelects([]);

    expect(await findDisciplineInOrg(7, 999)).toBeNull();
  });
});
