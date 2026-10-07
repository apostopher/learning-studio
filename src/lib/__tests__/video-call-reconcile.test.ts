// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConversation, getCallById, markCallEnded, saveTranscriptOnce } =
  vi.hoisted(() => ({
    getConversation: vi.fn(),
    getCallById: vi.fn(),
    markCallEnded: vi.fn(),
    saveTranscriptOnce: vi.fn(),
  }));
vi.mock('#/lib/tavus.server', () => ({ getConversation }));
vi.mock('#/db/video-calls', () => ({
  getCallById,
  markCallEnded,
  saveTranscriptOnce,
}));

import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';

const STARTED = new Date('2026-10-06T12:00:00Z');
const ACTIVE = {
  id: 'vc1',
  userId: 'u1',
  userName: 'Rahul',
  chatId: 'chat-1',
  courseSlug: null,
  tavusConversationId: 'conv-1',
  status: 'active' as const,
  reservedSeconds: 600,
  startedAt: STARTED,
  endedAt: null,
  durationSeconds: null,
  endReason: null,
  transcriptSavedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  markCallEnded.mockResolvedValue(true);
  saveTranscriptOnce.mockResolvedValue(true);
});

describe('reconcileVideoCall', () => {
  it('records a time-limit shutdown with the clamped duration', async () => {
    getConversation.mockResolvedValue({
      status: 'ended',
      shutdown: {
        at: new Date('2026-10-06T12:10:03Z'),
        reason: 'max_call_duration',
      },
      transcript: null,
    });
    getCallById.mockResolvedValue({ ...ACTIVE, status: 'ended' });

    await reconcileVideoCall(ACTIVE);

    expect(markCallEnded).toHaveBeenCalledWith('vc1', {
      endedAt: new Date('2026-10-06T12:10:03Z'),
      durationSeconds: 600,
      endReason: 'time_limit',
    });
    expect(saveTranscriptOnce).not.toHaveBeenCalled();
  });

  it('appends the cleaned transcript to the call chat once ended', async () => {
    const ended = {
      ...ACTIVE,
      status: 'ended' as const,
      durationSeconds: 480,
      endReason: 'user' as const,
    };
    getConversation.mockResolvedValue({
      status: 'ended',
      shutdown: {
        at: new Date('2026-10-06T12:08:00Z'),
        reason: 'end_call_endpoint_hit',
      },
      transcript: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'What is Vref?' },
        {
          role: 'assistant',
          content: '<emotion value="content"/>Reference speed.',
        },
      ],
    });
    getCallById.mockResolvedValue(ended);

    await reconcileVideoCall(ended);

    expect(markCallEnded).not.toHaveBeenCalled();
    expect(saveTranscriptOnce).toHaveBeenCalledWith('vc1', 'chat-1', [
      {
        role: 'assistant',
        parts: [
          {
            type: 'data-notification',
            data: { text: 'Video call with Viper7' },
          },
        ],
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

  it('does nothing while Tavus still has the call running', async () => {
    getConversation.mockResolvedValue({
      status: 'active',
      shutdown: null,
      transcript: null,
    });
    getCallById.mockResolvedValue(ACTIVE);
    const result = await reconcileVideoCall(ACTIVE);
    expect(markCallEnded).not.toHaveBeenCalled();
    expect(saveTranscriptOnce).not.toHaveBeenCalled();
    expect(result.status).toBe('active');
  });

  it('skips Tavus entirely once the transcript is saved', async () => {
    const done = {
      ...ACTIVE,
      status: 'ended' as const,
      transcriptSavedAt: new Date(),
    };
    expect(await reconcileVideoCall(done)).toBe(done);
    expect(getConversation).not.toHaveBeenCalled();
  });
});
