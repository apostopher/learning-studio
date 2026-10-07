// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  mapShutdownReason,
  PERSONA_SENTINEL,
  splitTavusMessages,
  stripSsml,
  transcriptToMessages,
} from '#/lib/tavus-messages';

// Modelled on the messages Tavus actually sent during the spike.
const TAVUS_MESSAGES = [
  {
    role: 'system',
    content: `${PERSONA_SENTINEL}\n\nYou are in a live video conference call. EVERY RESPONSE MUST BEGIN WITH AN EMOTION TAG.`,
  },
  { role: 'system', content: "The user's timezone is unknown." },
  { role: 'assistant', content: 'Hi, it is Viper7.' },
  { role: 'system', content: 'respond in english' },
  {
    role: 'system',
    content:
      '<user_appearance>\nAn adult with glasses.\n</user_appearance>\n\n<user_emotions>\nNeutral.\n</user_emotions>',
  },
  { role: 'user', content: 'What is Vref?' },
];

describe('splitTavusMessages', () => {
  it('keeps Tavus rules, drops perception and the persona sentinel', () => {
    const { tavusRules } = splitTavusMessages(TAVUS_MESSAGES);
    expect(tavusRules).toContain(
      'EVERY RESPONSE MUST BEGIN WITH AN EMOTION TAG',
    );
    expect(tavusRules).toContain("The user's timezone is unknown.");
    expect(tavusRules).toContain('respond in english');
    expect(tavusRules).not.toContain(PERSONA_SENTINEL);
    expect(tavusRules).not.toContain('user_appearance');
    expect(tavusRules).not.toContain('glasses');
  });

  it('turns user/assistant turns into UI messages in order', () => {
    const { history } = splitTavusMessages(TAVUS_MESSAGES);
    expect(history.map((m) => [m.role, m.parts])).toEqual([
      ['assistant', [{ type: 'text', text: 'Hi, it is Viper7.' }]],
      ['user', [{ type: 'text', text: 'What is Vref?' }]],
    ]);
  });

  it('drops a perception tag that carries attributes', () => {
    const { tavusRules } = splitTavusMessages([
      { role: 'system', content: 'Keep replies short.' },
      {
        role: 'system',
        content: '<user_emotions confidence="0.8">\nAnxious.\n</user_emotions>',
      },
    ]);
    expect(tavusRules).toBe('Keep replies short.');
  });

  it('drops perception sent under a user (or any) role', () => {
    const { history } = splitTavusMessages([
      {
        role: 'user',
        content:
          '<user_appearance>\nAn adult with glasses.\n</user_appearance>',
      },
      {
        role: 'assistant',
        content: '<user_screen>\nA bank statement.\n</user_screen>',
      },
      { role: 'user', content: 'What is Vref?' },
    ]);
    expect(history.map((m) => m.parts)).toEqual([
      [{ type: 'text', text: 'What is Vref?' }],
    ]);
  });

  it('reads array content parts and skips empty turns', () => {
    const { history } = splitTavusMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: null },
    ]);
    expect(history).toHaveLength(1);
    expect(history[0]?.parts).toEqual([{ type: 'text', text: 'Hello' }]);
  });
});

describe('stripSsml', () => {
  it('removes emotion and other SSML tags but keeps ordinary text', () => {
    expect(
      stripSsml('<emotion value="content"/>Vref is <break time="1s"/>speed.'),
    ).toBe('Vref is speed.');
    expect(stripSsml('If a < b then fine')).toBe('If a < b then fine');
  });
});

describe('transcriptToMessages', () => {
  it('brackets cleaned turns with status lines and drops system turns', () => {
    const out = transcriptToMessages(
      [
        { role: 'system', content: 'rules' },
        { role: 'assistant', content: 'Hi, it is Viper7.' },
        { role: 'user', content: ' What is Vref? ' },
        {
          role: 'assistant',
          content: '<emotion value="content"/>Reference speed.',
        },
        { role: 'assistant', content: '<emotion value="neutral"/>' },
      ],
      { durationSeconds: 480, endReason: 'user' },
    );
    expect(out).toEqual([
      {
        role: 'assistant',
        parts: [
          {
            type: 'data-notification',
            data: { text: 'Video call with Viper7' },
          },
        ],
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi, it is Viper7.' }],
      },
      { role: 'user', parts: [{ type: 'text', text: 'What is Vref?' }] },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Reference speed.' }],
      },
      {
        role: 'assistant',
        parts: [
          {
            type: 'data-notification',
            data: { text: 'Video call ended · 8 min' },
          },
        ],
      },
    ]);
  });
});

describe('mapShutdownReason', () => {
  it('maps Tavus shutdown reasons to ours', () => {
    expect(mapShutdownReason('max_call_duration')).toBe('time_limit');
    expect(mapShutdownReason('participant_left_timeout')).toBe('left');
    expect(mapShutdownReason('participant_absent_timeout')).toBe('left');
    expect(mapShutdownReason('end_call_endpoint_hit')).toBe('user');
    expect(mapShutdownReason(undefined)).toBe('user');
  });
});
