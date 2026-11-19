import { describe, expect, it } from 'vitest';
import {
  fromRosterLevel,
  nextRosterLevel,
  ROSTER_LEVEL_SAVE_DELAY_MS,
  rosterLevelMessage,
  toRosterLevel,
} from '../roster-level';

describe('nextRosterLevel', () => {
  it('starts someone with no 3D cert at Basic', () => {
    expect(nextRosterLevel(toRosterLevel(null))).toBe('basic');
  });

  it('climbs Basic → Intermediate → Advanced', () => {
    expect(nextRosterLevel('basic')).toBe('intermediate');
    expect(nextRosterLevel('intermediate')).toBe('advanced');
  });

  it('wraps Advanced round to None, so a cert can be cleared', () => {
    expect(nextRosterLevel('advanced')).toBe('none');
  });
});

describe('toRosterLevel / fromRosterLevel', () => {
  it('treats no level and None as the same thing', () => {
    expect(toRosterLevel(null)).toBe('none');
    expect(fromRosterLevel('none')).toBeNull();
    expect(fromRosterLevel(toRosterLevel('advanced'))).toBe('advanced');
  });
});

describe('rosterLevelMessage', () => {
  it('tells the pilot the course and the full level name', () => {
    expect(rosterLevelMessage('Instrument Ground School', 'intermediate')).toBe(
      'Your training team set your level in Instrument Ground School to Intermediate.',
    );
  });

  it('says the cert was cleared when set to None', () => {
    expect(rosterLevelMessage('Instrument Ground School', 'none')).toBe(
      'Your training team cleared your 3D cert in Instrument Ground School.',
    );
  });
});

describe('ROSTER_LEVEL_SAVE_DELAY_MS', () => {
  it('is about 700ms', () => {
    expect(ROSTER_LEVEL_SAVE_DELAY_MS).toBe(700);
  });
});
