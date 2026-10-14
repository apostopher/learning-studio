import { describe, expect, it } from 'vitest';
import {
  nextRosterLevel,
  ROSTER_LEVEL_SAVE_DELAY_MS,
  rosterLevelMessage,
} from '../roster-level';

describe('nextRosterLevel', () => {
  it('starts someone with no level at Basic', () => {
    expect(nextRosterLevel(null)).toBe('basic');
  });

  it('climbs Basic → Intermediate → Advanced', () => {
    expect(nextRosterLevel('basic')).toBe('intermediate');
    expect(nextRosterLevel('intermediate')).toBe('advanced');
  });

  it('wraps Advanced back to Basic — never back to no level', () => {
    expect(nextRosterLevel('advanced')).toBe('basic');
  });
});

describe('rosterLevelMessage', () => {
  it('tells the pilot the course and the full level name', () => {
    expect(rosterLevelMessage('Instrument Ground School', 'intermediate')).toBe(
      'Your training team set your level in Instrument Ground School to Intermediate.',
    );
  });
});

describe('ROSTER_LEVEL_SAVE_DELAY_MS', () => {
  it('is about 700ms', () => {
    expect(ROSTER_LEVEL_SAVE_DELAY_MS).toBe(700);
  });
});
