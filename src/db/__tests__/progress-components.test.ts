import { describe, expect, it, vi } from 'vitest';

// toComponentFields is pure; the module's top level only builds sql fragments
// from schema columns, so a bare stub of the schema is enough.
vi.mock('#/db/schema', () => ({
  lessonMaterialProgressTable: {},
  lessonsTable: {},
}));

import { toComponentFields } from '#/db/progress-components';

const base = {
  videoProvider: 'mux',
  videoRef: 'abc',
  needsVideoWatch: true,
  hasDebrief: true,
  applicableSectionNames: [] as string[],
  tappedSectionNames: [] as string[],
  hasQuiz: false,
  quizPlayed: false,
  debriefBearing: true,
  debriefPassed: false,
  lastFinishedDebriefAt: null as Date | string | null,
  hasOpenDebrief: false,
  chunksCleared: 0,
  chunksTotal: null as number | null,
  doneAt: null as Date | string | null,
  videoWatchedAt: null as Date | string | null,
  visited: false,
};

describe('toComponentFields', () => {
  it('maps Date timestamps to ISO strings and keeps null as null', () => {
    const out = toComponentFields({
      ...base,
      doneAt: new Date('2026-10-01T00:00:00Z'),
      lastFinishedDebriefAt: new Date('2026-10-02T12:30:00Z'),
    });
    expect(out.doneAt).toBe('2026-10-01T00:00:00.000Z');
    expect(out.lastFinishedDebriefAt).toBe('2026-10-02T12:30:00.000Z');
    expect(toComponentFields(base).doneAt).toBeNull();
    expect(toComponentFields(base).lastFinishedDebriefAt).toBeNull();
  });

  it('maps the video-watched time to ISO', () => {
    expect(
      toComponentFields({ ...base, videoWatchedAt: '2026-10-01 06:00:00+00' })
        .videoWatchedAt,
    ).toBe('2026-10-01T06:00:00.000Z');
    expect(toComponentFields(base).videoWatchedAt).toBeNull();
  });

  it('parses offset-bearing driver strings to the same instant', () => {
    expect(
      toComponentFields({ ...base, doneAt: '2026-10-01 00:00:00+00' }).doneAt,
    ).toBe('2026-10-01T00:00:00.000Z');
  });

  it('drops unknown section names and orders the rest canonically', () => {
    const out = toComponentFields({
      ...base,
      applicableSectionNames: ['links', 'keyPoints'],
      tappedSectionNames: ['links', 'page', 'bogus', 'keyPoints'],
    });
    expect(out.tappedSectionNames).toEqual(['keyPoints', 'links']);
    expect(out.applicableSectionNames).toEqual(['keyPoints', 'links']);
  });

  it('passes the debrief facts through', () => {
    const out = toComponentFields({ ...base, debriefPassed: true });
    expect(out).toMatchObject({ debriefBearing: true, debriefPassed: true });
  });

  it('hands the chunk counts and open flag through unchanged', () => {
    expect(
      toComponentFields({
        ...base,
        hasOpenDebrief: true,
        chunksCleared: 5,
        chunksTotal: 7,
      }),
    ).toMatchObject({
      hasOpenDebrief: true,
      chunksCleared: 5,
      chunksTotal: 7,
    });
    expect(toComponentFields(base).chunksTotal).toBeNull();
  });
});
