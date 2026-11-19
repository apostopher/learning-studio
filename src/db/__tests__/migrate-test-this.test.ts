// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock('#/db', () => ({ db }));

const { migrateTestThis, parseJobOfTheDayLinks } = await import(
  '#/db/migrate-test-this'
);

type Query = { queryChunks?: Array<{ value?: unknown }> };

/** Same house pattern as migrate-discipline-modules.test.ts, params kept. */
function textOf(query: Query): string {
  return (query.queryChunks ?? [])
    .map((chunk) =>
      Array.isArray(chunk.value)
        ? chunk.value.join('')
        : typeof chunk === 'string' || typeof chunk === 'number'
          ? String(chunk)
          : '',
    )
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every bound parameter, in order, nested sql fragments flattened. */
function paramsOf(query: unknown): unknown[] {
  const out: unknown[] = [];
  for (const chunk of (query as Query).queryChunks ?? []) {
    if (chunk && typeof chunk === 'object' && 'queryChunks' in chunk) {
      out.push(...paramsOf(chunk));
    } else if (!(chunk && typeof chunk === 'object' && 'value' in chunk)) {
      out.push(chunk);
    }
  }
  return out;
}

describe('parseJobOfTheDayLinks', () => {
  // The five shapes found in the live table on 2026-10-26.
  it('takes a bare URL as an unnamed link', () => {
    expect(
      parseJobOfTheDayLinks('https://www.youtube.com/watch?v=IcaEWuT5CHg'),
    ).toEqual([
      { name: '', url: 'https://www.youtube.com/watch?v=IcaEWuT5CHg' },
    ]);
  });

  it('drops an anchor name that only repeats its URL, through <p> and <mark>', () => {
    expect(
      parseJobOfTheDayLinks(
        '<p><a target="_blank" href="https://www.youtube.com/watch?v=LuPK6NrKLxE"><mark>https://www.youtube.com/watch?v=LuPK6NrKLxE</mark></a></p>',
      ),
    ).toEqual([
      { name: '', url: 'https://www.youtube.com/watch?v=LuPK6NrKLxE' },
    ]);
  });

  it('names a link inside a sentence with the whole sentence', () => {
    expect(
      parseJobOfTheDayLinks(
        '<p>How would YOU <a target="_blank" href="https://www.youtube.com/shorts/gq2Ec5vrP2M">test these drones</a></p>',
      ),
    ).toEqual([
      {
        name: 'How would YOU test these drones',
        url: 'https://www.youtube.com/shorts/gq2Ec5vrP2M',
      },
    ]);
  });

  it('keeps every link when there are several, each named by its own text', () => {
    expect(
      parseJobOfTheDayLinks(
        '<p>Watch <a href="https://a.test/1">one</a> and <a href="https://a.test/2">two</a></p>',
      ),
    ).toEqual([
      { name: 'one', url: 'https://a.test/1' },
      { name: 'two', url: 'https://a.test/2' },
    ]);
  });

  it('finds no link in text with no URL', () => {
    expect(parseJobOfTheDayLinks('<p>See the hangar board</p>')).toEqual([]);
    expect(parseJobOfTheDayLinks('   ')).toEqual([]);
  });
});

describe('migrateTestThis', () => {
  const executed: Query[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    executed.length = 0;
  });

  function runWith(rows: unknown[]) {
    db.transaction.mockImplementation(
      async (
        fn: (tx: { execute: (q: Query) => Promise<unknown> }) => unknown,
      ) =>
        fn({
          execute: async (q) => {
            executed.push(q);
            return { rows: textOf(q).startsWith('select') ? rows : [] };
          },
        }),
    );
    return migrateTestThis();
  }

  it('selects only lessons outside the 3D Airmanship discipline, no discipline included', async () => {
    await runWith([]);
    const select = executed.find((q) => textOf(q).startsWith('select'));
    expect(textOf(select as Query)).toContain('d.slug is distinct from');
    expect(paramsOf(select)).toContain('3d-airmanship');
  });

  it('writes the parsed links ahead of existing TEST THIS! links and clears Job of the Day', async () => {
    const result = await runWith([
      {
        id: 4,
        lesson_slug: 'uas-1',
        job_of_the_day: 'https://y.test/a',
        test_this: [{ name: 'Added', url: 'https://y.test/b' }],
      },
    ]);
    const update = executed.find((q) =>
      textOf(q).startsWith('update "lesson_material" set'),
    );
    expect(textOf(update as Query)).toContain('"job_of_the_day" = null');
    expect(paramsOf(update)).toEqual([
      JSON.stringify([
        { name: '', url: 'https://y.test/a' },
        { name: 'Added', url: 'https://y.test/b' },
      ]),
      4,
    ]);
    expect(result.moved).toEqual([
      { lessonSlug: 'uas-1', links: [{ name: '', url: 'https://y.test/a' }] },
    ]);
  });

  it('reports a value with no URL as dropped, and still clears it', async () => {
    const result = await runWith([
      {
        id: 9,
        lesson_slug: 'uas-2',
        job_of_the_day: '<p>tbd</p>',
        test_this: null,
      },
    ]);
    expect(result.dropped).toEqual([
      { lessonSlug: 'uas-2', value: '<p>tbd</p>' },
    ]);
    const update = executed.find((q) =>
      textOf(q).startsWith('update "lesson_material" set'),
    );
    expect(paramsOf(update)).toEqual(['[]', 9]);
  });

  /**
   * Order is the guarantee: the unique (user, lesson, section) index would
   * reject the rename for a learner who already has a testThis row, so the
   * duplicate must be deleted FIRST.
   */
  it('deletes colliding Job of the Day tab records before renaming the rest to testThis', async () => {
    await runWith([]);
    const texts = executed.map(textOf);
    const del = texts.findIndex((t) =>
      t.startsWith('delete from "lesson_material_progress"'),
    );
    const rename = texts.findIndex((t) =>
      t.startsWith('update "lesson_material_progress"'),
    );
    expect(del).toBeGreaterThan(-1);
    expect(rename).toBeGreaterThan(del);
    expect(texts[rename]).toContain("set section_name = 'testthis'");
    expect(paramsOf(executed[rename])).toContain('3d-airmanship');
  });
});
