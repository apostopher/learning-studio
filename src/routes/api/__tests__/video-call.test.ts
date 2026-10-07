// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  envMock: {
    TAVUS_PERSONA_ID: 'p1' as string | undefined,
    TAVUS_LLM_SECRET: 's'.repeat(32),
    TAVUS_PUBLIC_URL: 'https://pub.example',
  },
  getSession: vi.fn(),
  ensureChat: vi.fn(),
  createConversation: vi.fn(),
  endConversation: vi.fn(),
  reconcileVideoCall: vi.fn(),
  listCallsSince: vi.fn(),
  getActiveCallForUser: vi.fn(),
  getCallForUser: vi.fn(),
  getCallById: vi.fn(),
  insertActiveCall: vi.fn(),
  markCallEnded: vi.fn(),
}));
vi.mock('#/env', () => ({ env: m.envMock }));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/db/chat', () => ({ ensureChat: m.ensureChat }));
vi.mock('#/lib/tavus.server', () => ({
  createConversation: m.createConversation,
  endConversation: m.endConversation,
}));
vi.mock('#/lib/video-call-reconcile.server', () => ({
  reconcileVideoCall: m.reconcileVideoCall,
}));
vi.mock('#/db/video-calls', () => ({
  listCallsSince: m.listCallsSince,
  getActiveCallForUser: m.getActiveCallForUser,
  getCallForUser: m.getCallForUser,
  getCallById: m.getCallById,
  insertActiveCall: m.insertActiveCall,
  markCallEnded: m.markCallEnded,
}));

import { VIDEO_CALL_GREETING } from '#/ai/prompts/voice-mode';
import { startVideoCallHandler } from '../video-call';
import { getVideoCallHandler } from '../video-call.$id';
import { endVideoCallHandler } from '../video-call.$id.end';
import { getAllowanceHandler } from '../video-call.allowance';

const NOW = new Date('2026-10-06T12:00:00Z');
const CALL = {
  id: 'vc1',
  userId: 'u1',
  userName: 'Rahul',
  chatId: 'chat-1',
  courseSlug: 'ppl',
  tavusConversationId: 'conv-1',
  status: 'active' as const,
  reservedSeconds: 600,
  startedAt: new Date('2026-10-06T11:58:30Z'),
  endedAt: null,
  durationSeconds: null,
  endReason: null,
  transcriptSavedAt: null,
};
const ended = (durationSeconds: number) => ({
  ...CALL,
  id: `old-${durationSeconds}`,
  status: 'ended' as const,
  durationSeconds,
});

const post = (url: string, body: unknown = {}) =>
  new Request(`http://t${url}`, { method: 'POST', body: JSON.stringify(body) });
const get = (url: string) => new Request(`http://t${url}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  m.envMock.TAVUS_PERSONA_ID = 'p1';
  m.getSession.mockResolvedValue({ user: { id: 'u1', name: 'Rahul' } });
  m.getActiveCallForUser.mockResolvedValue(null);
  m.listCallsSince.mockResolvedValue([]);
  m.ensureChat.mockResolvedValue('chat-1');
  m.createConversation.mockResolvedValue({
    conversationId: 'conv-new',
    conversationUrl: 'https://tavus.daily.co/conv-new',
  });
  m.insertActiveCall.mockImplementation(
    async (values: Record<string, unknown>) => ({
      ...CALL,
      ...values,
      id: 'vc-new',
      startedAt: NOW,
    }),
  );
  m.markCallEnded.mockResolvedValue(true);
  m.endConversation.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('GET /api/video-call/allowance', () => {
  it('401 without a session', async () => {
    m.getSession.mockResolvedValueOnce(null);
    expect(
      (await getAllowanceHandler(get('/api/video-call/allowance'))).status,
    ).toBe(401);
  });

  it('gives a fresh user the full day', async () => {
    const res = await getAllowanceHandler(get('/api/video-call/allowance'));
    expect(await res.json()).toEqual({
      canStart: true,
      reason: null,
      remainingSeconds: 1800,
      resetsAt: '2026-10-07T00:00:00.000Z',
      activeCallId: null,
    });
  });

  it('says not_configured when no persona id is set', async () => {
    m.envMock.TAVUS_PERSONA_ID = undefined;
    const body = await (
      await getAllowanceHandler(get('/api/video-call/allowance'))
    ).json();
    expect(body).toMatchObject({ canStart: false, reason: 'not_configured' });
  });

  it('listCallsSince is queried from 00:00 UTC today', async () => {
    vi.setSystemTime(new Date('2026-10-07T00:01:00Z'));
    await getAllowanceHandler(get('/api/video-call/allowance'));
    expect(m.listCallsSince).toHaveBeenCalledWith(
      'u1',
      new Date('2026-10-07T00:00:00Z'),
    );
  });
});

describe('POST /api/video-call', () => {
  it('reserves what is left today and tells Tavus the same limit', async () => {
    m.listCallsSince.mockResolvedValue([ended(1500)]);
    const res = await startVideoCallHandler(
      post('/api/video-call', { chatId: 'chat-1', courseSlug: 'ppl' }),
    );

    expect(res.status).toBe(200);
    expect(m.createConversation).toHaveBeenCalledWith({
      personaId: 'p1',
      callbackUrl: `https://pub.example/api/tavus/webhook?token=${'s'.repeat(32)}`,
      maxCallDurationSeconds: 300,
      customGreeting: VIDEO_CALL_GREETING,
    });
    expect(m.ensureChat).toHaveBeenCalledWith({
      chatId: 'chat-1',
      userId: 'u1',
      firstUserText: 'Video call with Viper7',
    });
    expect(m.insertActiveCall).toHaveBeenCalledWith({
      userId: 'u1',
      userName: 'Rahul',
      chatId: 'chat-1',
      courseSlug: 'ppl',
      tavusConversationId: 'conv-new',
      reservedSeconds: 300,
    });
    expect(await res.json()).toEqual({
      id: 'vc-new',
      chatId: 'chat-1',
      conversationUrl: 'https://tavus.daily.co/conv-new',
      endsAt: '2026-10-06T12:05:00.000Z',
    });
  });

  it('403 daily_limit without creating a Tavus call', async () => {
    m.listCallsSince.mockResolvedValue([ended(1750)]);
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      reason: 'daily_limit',
      resetsAt: '2026-10-07T00:00:00.000Z',
    });
    expect(m.createConversation).not.toHaveBeenCalled();
  });

  it('503 not_configured without creating a Tavus call', async () => {
    m.envMock.TAVUS_PERSONA_ID = undefined;
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(503);
    expect(m.createConversation).not.toHaveBeenCalled();
  });

  it('start proceeds when the leftover active call has ended at Tavus', async () => {
    m.getActiveCallForUser.mockResolvedValue(CALL);
    m.reconcileVideoCall.mockResolvedValue({
      ...CALL,
      status: 'ended',
      durationSeconds: 60,
    });
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(m.reconcileVideoCall).toHaveBeenCalledWith(CALL);
    expect(res.status).toBe(200);
    expect(m.createConversation).toHaveBeenCalled();
  });

  it('409 when a call is genuinely live elsewhere', async () => {
    m.getActiveCallForUser.mockResolvedValue(CALL);
    m.reconcileVideoCall.mockResolvedValue(CALL);
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ reason: 'already_active' });
    expect(m.createConversation).not.toHaveBeenCalled();
  });

  it('marks an abandoned call stale when Tavus cannot be reached', async () => {
    const old = { ...CALL, startedAt: new Date('2026-10-06T11:40:00Z') };
    m.getActiveCallForUser.mockResolvedValue(old);
    m.reconcileVideoCall.mockRejectedValue(new Error('tavus down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await startVideoCallHandler(post('/api/video-call'));
    expect(m.markCallEnded).toHaveBeenCalledWith('vc1', {
      endedAt: NOW,
      durationSeconds: 600,
      endReason: 'stale',
    });
  });

  it('409 and ends the orphaned Tavus call when a parallel start wins the race', async () => {
    m.insertActiveCall.mockResolvedValue('already_active');
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(409);
    expect(m.endConversation).toHaveBeenCalledWith('conv-new');
  });

  it('502 and no chat or row when Tavus refuses', async () => {
    m.createConversation.mockRejectedValue(new Error('402'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await startVideoCallHandler(post('/api/video-call'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ reason: 'provider_unavailable' });
    expect(m.ensureChat).not.toHaveBeenCalled();
    expect(m.insertActiveCall).not.toHaveBeenCalled();
  });
});

describe('GET /api/video-call/:id', () => {
  it("404 for another user's call", async () => {
    m.getCallForUser.mockResolvedValue(null);
    const res = await getVideoCallHandler(get('/api/video-call/vc1'), 'vc1');
    expect(res.status).toBe(404);
    expect(m.getCallForUser).toHaveBeenCalledWith('vc1', 'u1');
    expect(m.reconcileVideoCall).not.toHaveBeenCalled();
  });

  it('reconciles while the transcript is unsaved and reports the result', async () => {
    m.getCallForUser.mockResolvedValue({ ...CALL, status: 'ended' });
    m.reconcileVideoCall.mockResolvedValue({
      ...CALL,
      status: 'ended',
      durationSeconds: 90,
      endReason: 'user',
      transcriptSavedAt: NOW,
    });
    const res = await getVideoCallHandler(get('/api/video-call/vc1'), 'vc1');
    expect(await res.json()).toEqual({
      status: 'ended',
      endReason: 'user',
      durationSeconds: 90,
      transcriptSaved: true,
      chatId: 'chat-1',
    });
  });
});

describe('POST /api/video-call/:id/end', () => {
  it("404 for another user's call without touching Tavus", async () => {
    m.getCallForUser.mockResolvedValue(null);
    const res = await endVideoCallHandler(
      post('/api/video-call/vc1/end'),
      'vc1',
    );
    expect(res.status).toBe(404);
    expect(m.endConversation).not.toHaveBeenCalled();
  });

  it('ends at Tavus and records the user hang-up with the real duration', async () => {
    m.getCallForUser.mockResolvedValue(CALL);
    m.reconcileVideoCall.mockResolvedValueOnce(CALL);
    m.getCallById.mockResolvedValue({
      ...CALL,
      status: 'ended',
      durationSeconds: 90,
      endReason: 'user',
    });
    const res = await endVideoCallHandler(
      post('/api/video-call/vc1/end'),
      'vc1',
    );

    expect(m.endConversation).toHaveBeenCalledWith('conv-1');
    expect(m.markCallEnded).toHaveBeenCalledWith('vc1', {
      endedAt: NOW,
      durationSeconds: 90,
      endReason: 'user',
    });
    expect(await res.json()).toMatchObject({
      status: 'ended',
      durationSeconds: 90,
    });
  });
});
