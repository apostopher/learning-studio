// @vitest-environment node
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real `pgTable` stub for the one table this module writes; `#/db` and the
// slug helper fully mocked — never `importOriginal` (see memory: vitest
// can't resolve @/, use #/).
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
  isAvailable: boolean('is_available'),
  videoRef: text('video_ref'),
  disciplineId: integer('discipline_id'),
  orgId: integer('org_id'),
});

const m = vi.hoisted(() => ({
  insert: vi.fn(),
  transaction: vi.fn(),
  nextAvailableLessonSlug: vi.fn(),
}));
vi.mock('#/db', () => ({
  db: { insert: m.insert, transaction: m.transaction },
}));
vi.mock('#/db/schema', () => ({ lessonsTable }));
vi.mock('#/db/lesson-slug', () => ({
  nextAvailableLessonSlug: m.nextAvailableLessonSlug,
}));

const { createLibraryLesson } = await import('#/db/library-lessons');

/** Records the row handed to `.values()` and resolves `.returning()`. */
function makeInsertChain(returned: unknown, seen: { values: unknown[] }) {
  const chain = {
    values: (row: unknown) => {
      seen.values.push(row);
      return chain;
    },
    returning: () => Promise.resolve([returned]),
  };
  return chain;
}

const ROW = {
  id: 91,
  name: 'Stalls',
  slug: 'stalls',
  isAvailable: false,
  videoRef: null,
  // The gate columns come back from the INSERT's `returning` and are read
  // onto the card, so the row has to carry them like the real one does.
  levels: [],
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.nextAvailableLessonSlug.mockResolvedValue('stalls');
});

describe('createLibraryLesson', () => {
  it('writes the org and the discipline onto the row', async () => {
    const seen = { values: [] as unknown[] };
    m.insert.mockReturnValue(makeInsertChain(ROW, seen));

    await createLibraryLesson({ orgId: 7, disciplineId: 4, name: 'Stalls' });

    // Assert on what the INSERT received. A mutant that dropped `disciplineId`
    // would file every library-created lesson under nothing — landing it in
    // the admin-only "Untitled" queue instead of the column the user clicked
    // — and would still return a plausible card.
    expect(seen.values).toEqual([
      {
        name: 'Stalls',
        slug: 'stalls',
        requiredSubscriptions: [],
        orgId: 7,
        disciplineId: 4,
      },
    ]);
  });

  it('creates no placement, so the lesson teaches no course yet', async () => {
    const seen = { values: [] as unknown[] };
    m.insert.mockReturnValue(makeInsertChain(ROW, seen));

    await createLibraryLesson({ orgId: 7, disciplineId: 4, name: 'Stalls' });

    // Mutant this catches: copying `createLesson`'s module_lessons write into
    // here. There is no module to place into, so it would either crash or
    // invent a placement in someone's course. Exactly one insert, and it is
    // the lesson.
    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(m.insert.mock.calls[0][0]).toBe(lessonsTable);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('takes its slug from the shared helper rather than the raw name', async () => {
    const seen = { values: [] as unknown[] };
    m.nextAvailableLessonSlug.mockResolvedValue('stalls-2');
    m.insert.mockReturnValue(
      makeInsertChain({ ...ROW, slug: 'stalls-2' }, seen),
    );

    await createLibraryLesson({ orgId: 7, disciplineId: 4, name: 'Stalls' });

    // Mutant this catches: `slug: slugify(input.name)` inline, which skips
    // the collision suffix and mints a slug the unique index already holds.
    expect(m.nextAvailableLessonSlug.mock.calls).toEqual([['Stalls']]);
    expect((seen.values[0] as { slug: string }).slug).toBe('stalls-2');
  });

  it('reads isConfigured back off the row instead of assuming false', async () => {
    const seen = { values: [] as unknown[] };
    m.insert.mockReturnValue(
      makeInsertChain({ ...ROW, videoRef: 'mux-abc' }, seen),
    );

    const card = await createLibraryLesson({
      orgId: 7,
      disciplineId: 4,
      name: 'Stalls',
    });

    // Mutant this catches: `isConfigured: false` hardcoded. It is true today
    // for every fresh lesson, which is exactly why the hardcode would survive
    // any test that only created one and looked at the result.
    expect(card.isConfigured).toBe(true);
  });

  it('reports a fresh lesson as teaching zero courses', async () => {
    const seen = { values: [] as unknown[] };
    m.insert.mockReturnValue(makeInsertChain(ROW, seen));

    const card = await createLibraryLesson({
      orgId: 7,
      disciplineId: 4,
      name: 'Stalls',
    });

    expect(card).toEqual({
      id: 91,
      name: 'Stalls',
      slug: 'stalls',
      isConfigured: false,
      isAvailable: false,
      courseCount: 0,
      levels: [],
      requiredSubscriptions: [],
      hasDebrief: false,
      needsVideoWatch: false,
    });
  });
});
