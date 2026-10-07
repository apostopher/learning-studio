// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#/env', () => ({
  env: { TAVUS_API_KEY: 'test-key', TAVUS_REPLICA_ID: 'r93ce3db27f8' },
}));

import {
  createConversation,
  endConversation,
  getConversation,
  TavusError,
} from '#/lib/tavus.server';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('createConversation', () => {
  it('sends persona, replica, limits and greeting to Tavus', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        conversation_id: 'c1',
        conversation_url: 'https://tavus.daily.co/c1',
        status: 'active',
      }),
    );

    const result = await createConversation({
      personaId: 'p1',
      callbackUrl: 'https://pub.example/api/tavus/webhook?token=t',
      maxCallDurationSeconds: 420,
      customGreeting: 'Hi',
    });

    expect(result).toEqual({
      conversationId: 'c1',
      conversationUrl: 'https://tavus.daily.co/c1',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tavusapi.com/v2/conversations');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    expect(JSON.parse(init.body as string)).toEqual({
      persona_id: 'p1',
      replica_id: 'r93ce3db27f8',
      callback_url: 'https://pub.example/api/tavus/webhook?token=t',
      custom_greeting: 'Hi',
      properties: {
        max_call_duration: 420,
        participant_left_timeout: 30,
        participant_absent_timeout: 120,
      },
    });
  });

  it('throws TavusError with the status on failure', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'nope' }, 402));
    await expect(
      createConversation({
        personaId: 'p1',
        callbackUrl: 'https://x.example',
        maxCallDurationSeconds: 60,
        customGreeting: 'Hi',
      }),
    ).rejects.toMatchObject({ name: 'TavusError', status: 402 });
  });
});

describe('endConversation', () => {
  it('posts to the end endpoint', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await endConversation('c1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tavusapi.com/v2/conversations/c1/end');
    expect(init.method).toBe('POST');
  });
});

describe('getConversation', () => {
  it('extracts shutdown and transcript from verbose events', async () => {
    // Shape recorded from a real call during the 2026-10-06 spike.
    fetchMock.mockResolvedValueOnce(
      json({
        conversation_id: 'c1',
        status: 'ended',
        events: [
          {
            event_type: 'system.replica_joined',
            timestamp: '2026-10-06T14:18:59.306376Z',
            properties: {},
          },
          {
            event_type: 'system.shutdown',
            timestamp: '2026-10-06T14:19:59.478485Z',
            properties: { shutdown_reason: 'participant_absent_timeout' },
          },
          {
            event_type: 'application.transcription_ready',
            timestamp: '2026-10-06T14:19:59.880405Z',
            properties: {
              transcript: [
                { role: 'system', content: 'rules' },
                { role: 'user', content: 'Hi.' },
              ],
            },
          },
        ],
      }),
    );

    const conv = await getConversation('c1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://tavusapi.com/v2/conversations/c1?verbose=true',
    );
    expect(conv.status).toBe('ended');
    expect(conv.shutdown).toEqual({
      at: new Date('2026-10-06T14:19:59.478485Z'),
      reason: 'participant_absent_timeout',
    });
    expect(conv.transcript).toEqual([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'Hi.' },
    ]);
  });

  it('reports no shutdown and no transcript while active', async () => {
    fetchMock.mockResolvedValueOnce(json({ conversation_id: 'c1', status: 'active' }));
    const conv = await getConversation('c1');
    expect(conv).toEqual({ status: 'active', shutdown: null, transcript: null });
  });

  it('is a TavusError on 404', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'missing' }, 404));
    await expect(getConversation('nope')).rejects.toBeInstanceOf(TavusError);
  });
});
