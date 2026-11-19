// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { transcriptItems } from '../session-labels';

describe('transcriptItems', () => {
  it('keeps only the text of user and Viper messages, in order', () => {
    expect(
      transcriptItems([
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'Why flap?' }],
        },
        {
          id: 'm2',
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            { type: 'tool-searchKB', input: { query: 'flaps' } },
            { type: 'text', text: 'Lift.' },
            { type: 'text', text: 'And drag.' },
          ],
        },
        // Tool-only and system messages carry nothing to read.
        { id: 'm3', role: 'assistant', parts: [{ type: 'tool-x' }] },
        { id: 'm4', role: 'system', parts: [{ type: 'text', text: 'rules' }] },
      ]),
    ).toEqual([
      { key: 'm1', role: 'user', text: 'Why flap?' },
      { key: 'm2', role: 'assistant', text: 'Lift.\n\nAnd drag.' },
    ]);
  });
});
