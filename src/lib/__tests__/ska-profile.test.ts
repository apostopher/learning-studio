import { describe, expect, it } from 'vitest';
import {
  hasAnySkaSection,
  normaliseSkaProfile,
  toSkaMarkdown,
  toSkaProfileView,
  truncateSkaSections,
} from '#/lib/ska-profile';
import { SKA_SECTION_MAX_CHARS } from '#/types';

const FULL = {
  skills: 'Flies gliders.',
  knowledge: 'Holds a Part 107.',
  attitude: 'Goes slowly.',
};

describe('normaliseSkaProfile', () => {
  it('collapses blank and whitespace-only sections to null', () => {
    // `''` and `null` must not both be reachable: they mean the same thing to
    // a reader but compare unequal, so a profile written by the edit form
    // (`''`) would answer `hasAnySkaSection` differently from an identical one
    // written by the generator (`null`).
    expect(
      normaliseSkaProfile({ skills: '', knowledge: '   ', attitude: null }),
    ).toEqual({ skills: null, knowledge: null, attitude: null });
  });

  it('trims surrounding whitespace but keeps the content', () => {
    expect(
      normaliseSkaProfile({
        skills: '  Flies gliders.  ',
        knowledge: null,
        attitude: null,
      }).skills,
    ).toBe('Flies gliders.');
  });
});

describe('hasAnySkaSection', () => {
  it('is false for an all-empty profile even when sections are blank strings', () => {
    expect(
      hasAnySkaSection({ skills: '', knowledge: '  ', attitude: null }),
    ).toBe(false);
  });

  it('is true when any single section has content', () => {
    expect(
      hasAnySkaSection({ skills: null, knowledge: null, attitude: 'Direct.' }),
    ).toBe(true);
  });
});

describe('toSkaMarkdown', () => {
  it('renders the three headings in SKA order', () => {
    expect(toSkaMarkdown(FULL)).toBe(
      '## Skills\n\nFlies gliders.\n\n## Knowledge\n\nHolds a Part 107.\n\n## Attitude\n\nGoes slowly.',
    );
  });

  it('omits empty sections rather than emitting a bare heading', () => {
    const markdown = toSkaMarkdown({
      skills: null,
      knowledge: 'Holds a Part 107.',
      attitude: null,
    });

    expect(markdown).toBe('## Knowledge\n\nHolds a Part 107.');
    expect(markdown).not.toContain('## Skills');
  });

  it('renders only the requested sections', () => {
    expect(toSkaMarkdown(FULL, { sections: ['attitude'] })).toBe(
      '## Attitude\n\nGoes slowly.',
    );
  });

  it('keeps SKA order regardless of the order sections are requested in', () => {
    // The caller passes a set, not a sequence — the document's order is a
    // property of the format, not of the request.
    expect(toSkaMarkdown(FULL, { sections: ['attitude', 'skills'] })).toBe(
      '## Skills\n\nFlies gliders.\n\n## Attitude\n\nGoes slowly.',
    );
  });

  it('returns an empty string when nothing survives filtering', () => {
    expect(
      toSkaMarkdown(
        { skills: 'x', knowledge: null, attitude: null },
        {
          sections: ['attitude'],
        },
      ),
    ).toBe('');
  });
});

describe('truncateSkaSections', () => {
  it('cuts an over-long section to the cap instead of rejecting it', () => {
    // Model output is truncated, never rejected: `profiling` is best-effort,
    // and failing the whole generation over a long paragraph would cost the
    // learner their profile for a formatting miss.
    const long = 'a'.repeat(SKA_SECTION_MAX_CHARS + 500);
    const result = truncateSkaSections({
      skills: long,
      knowledge: null,
      attitude: null,
    });

    expect(result.skills).toHaveLength(SKA_SECTION_MAX_CHARS);
  });

  it('leaves a section within the cap untouched', () => {
    expect(truncateSkaSections(FULL)).toEqual(FULL);
  });
});

describe('toSkaProfileView', () => {
  it('serialises reviewedAt to ISO and normalises the sections', () => {
    expect(
      toSkaProfileView({
        skills: '  Flies gliders.  ',
        knowledge: '',
        attitude: null,
        reviewedAt: new Date('2026-08-03T10:00:00.000Z'),
      }),
    ).toEqual({
      skills: 'Flies gliders.',
      knowledge: null,
      attitude: null,
      reviewedAt: '2026-08-03T10:00:00.000Z',
    });
  });

  it('reports an unreviewed profile as reviewedAt: null', () => {
    // What the UI branches on — an unreviewed profile renders the "not in use
    // yet" state, so this must not silently become a truthy value.
    expect(
      toSkaProfileView({
        skills: 'x',
        knowledge: null,
        attitude: null,
        reviewedAt: null,
      }).reviewedAt,
    ).toBeNull();
  });
});
