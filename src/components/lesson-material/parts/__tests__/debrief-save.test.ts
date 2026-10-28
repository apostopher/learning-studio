import { describe, expect, it } from 'vitest';
import { debriefSaveOutcome, debriefSaveState } from '../debrief-save';

const test = { lessonSlug: 'l1', questions: [] };
const other = { lessonSlug: 'l1', questions: [] };

describe('debriefSaveState', () => {
  it('is unsaved with no record, or a record for another session', () => {
    expect(debriefSaveState(null, test)).toBe('unsaved');
    expect(debriefSaveState({ test: other, state: 'saved' }, test)).toBe(
      'unsaved',
    );
  });

  it.each([
    'saving',
    'saved',
    'failed',
  ] as const)('is %s when that is what the record says for this session', (state) => {
    expect(debriefSaveState({ test, state }, test)).toBe(state);
  });
});

describe('debriefSaveOutcome', () => {
  it('is saved when save-results answered', () => {
    expect(debriefSaveOutcome({ status: 'fulfilled', value: { id: 1 } })).toBe(
      'saved',
    );
  });

  it('is not-open when the server refused it as not open (the hook resolved null)', () => {
    expect(debriefSaveOutcome({ status: 'fulfilled', value: null })).toBe(
      'not-open',
    );
  });

  it('is failed on any other error — the attempt was never recorded', () => {
    expect(
      debriefSaveOutcome({ status: 'rejected', reason: new Error('500') }),
    ).toBe('failed');
  });
});
