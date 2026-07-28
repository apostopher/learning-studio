import { describe, expect, it } from 'vitest';
import {
  isSettled,
  messageRowsToTranscript,
  toStatus,
  transcriptToUIMessages,
} from '#/lib/onboarding-transport';

describe('isSettled', () => {
  it.each([
    'awaitingConsent',
    'awaitingAnswer',
    'confirming',
  ])('treats %s as settled while the actor is still active', (state) => {
    expect(isSettled(state, 'active')).toBe(true);
  });

  it.each([
    'greeting',
    'evaluatingConsent',
    'signingOff',
    'recordingDecline',
    'asking',
    'evaluating',
    'askingFollowUp',
    'persisting',
    'summarising',
    'completing',
    'deleting',
  ])('does NOT treat mid-flight state %s as settled', (state) => {
    expect(isSettled(state, 'active')).toBe(false);
  });

  it('treats any state as settled once the actor is done', () => {
    // Final states stop the actor; the state value is whichever final state
    // it landed in, so settledness must come from the actor status, not the
    // name — otherwise a route would wait forever on a completed interview.
    expect(isSettled('complete', 'done')).toBe(true);
    expect(isSettled('consentDeclined', 'done')).toBe(true);
    expect(isSettled('deleted', 'done')).toBe(true);
  });

  it('treats an errored actor as settled so a caller cannot hang on it', () => {
    expect(isSettled('evaluating', 'error')).toBe(true);
  });
});

describe('toStatus', () => {
  it.each([
    ['awaitingConsent', 'awaiting_consent'],
    ['awaitingAnswer', 'awaiting_answer'],
    ['confirming', 'confirming'],
    ['complete', 'complete'],
    ['consentDeclined', 'declined'],
    ['deleted', 'deleted'],
    ['paused', 'paused'],
    ['failed', 'failed'],
  ])('maps %s to %s', (state, expected) => {
    expect(toStatus(state, 'active')).toBe(expected);
  });

  it('reports failed for an errored actor regardless of state name', () => {
    expect(toStatus('evaluating', 'error')).toBe('failed');
  });

  it('reports failed for an unrecognised state rather than guessing', () => {
    // A state added to the machine without updating this map must surface
    // loudly, not be silently reported as a working status.
    expect(toStatus('someNewState', 'active')).toBe('failed');
  });
});

describe('messageRowsToTranscript', () => {
  it('extracts text from the parts shape appendMessage writes', () => {
    const rows = [
      { role: 'assistant', parts: [{ type: 'text', text: 'Hello' }], order: 0 },
      { role: 'user', parts: [{ type: 'text', text: 'Hi' }], order: 1 },
    ];
    expect(messageRowsToTranscript(rows)).toEqual([
      { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'Hi' },
    ]);
  });

  it('orders by `order`, not by array position', () => {
    const rows = [
      { role: 'user', parts: [{ type: 'text', text: 'second' }], order: 1 },
      { role: 'assistant', parts: [{ type: 'text', text: 'first' }], order: 0 },
    ];
    expect(messageRowsToTranscript(rows).map((m) => m.text)).toEqual([
      'first',
      'second',
    ]);
  });

  it('joins multiple text parts in one row', () => {
    const rows = [
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
        order: 0,
      },
    ];
    expect(messageRowsToTranscript(rows)[0].text).toBe('ab');
  });

  it('skips non-text parts rather than throwing', () => {
    const rows = [
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'kept' },
          { type: 'data-something', payload: 1 },
        ],
        order: 0,
      },
    ];
    expect(messageRowsToTranscript(rows)[0].text).toBe('kept');
  });

  it('tolerates a row whose parts are not an array', () => {
    // parts is untyped jsonb, so a malformed row must not crash a whole
    // session load.
    const rows = [{ role: 'assistant', parts: null, order: 0 }];
    expect(messageRowsToTranscript(rows)).toEqual([
      { role: 'assistant', text: '' },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(messageRowsToTranscript([])).toEqual([]);
  });
});

describe('transcriptToUIMessages', () => {
  it('produces stable unique ids and the text part shape', () => {
    const result = transcriptToUIMessages([
      { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'Hi' },
    ]);
    expect(result).toEqual([
      {
        id: 'onboarding-0',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello' }],
      },
      {
        id: 'onboarding-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi' }],
      },
    ]);
  });

  it('gives every message a distinct id even when texts repeat', () => {
    const result = transcriptToUIMessages([
      { role: 'user', text: 'same' },
      { role: 'user', text: 'same' },
    ]);
    expect(new Set(result.map((m) => m.id)).size).toBe(2);
  });
});
