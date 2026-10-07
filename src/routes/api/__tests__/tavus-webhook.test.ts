// @vitest-environment node
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCallByConversation, reconcileVideoCall } = vi.hoisted(() => ({
  getCallByConversation: vi.fn(),
  reconcileVideoCall: vi.fn(),
}));
vi.mock('#/env', () => ({ env: { TAVUS_LLM_SECRET: 's'.repeat(32) } }));
vi.mock('#/db/video-calls', () => ({ getCallByConversation }));
vi.mock('#/lib/video-call-reconcile.server', () => ({ reconcileVideoCall }));

import { tavusWebhookHandler } from '../tavus/webhook';

const LLM_SECRET = 's'.repeat(32);
const SECRET = createHmac('sha256', LLM_SECRET)
  .update('tavus-webhook')
  .digest('hex');
const hook = (token: string, body: unknown) =>
  new Request(`http://t/api/tavus/webhook?token=${token}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCallByConversation.mockResolvedValue({
    id: 'vc1',
    tavusConversationId: 'conv-1',
  });
  reconcileVideoCall.mockResolvedValue({});
});

describe('tavusWebhookHandler', () => {
  it('401 with the wrong token', async () => {
    const res = await tavusWebhookHandler(
      hook('nope', {
        conversation_id: 'conv-1',
        event_type: 'system.shutdown',
      }),
    );
    expect(res.status).toBe(401);
    expect(reconcileVideoCall).not.toHaveBeenCalled();
  });

  it('rejects the raw LLM secret as a token', async () => {
    const res = await tavusWebhookHandler(
      hook(LLM_SECRET, {
        conversation_id: 'conv-1',
        event_type: 'system.shutdown',
      }),
    );
    expect(res.status).toBe(401);
    expect(reconcileVideoCall).not.toHaveBeenCalled();
  });

  it('200 and no reconcile for a malformed or empty body', async () => {
    for (const body of ['', 'not json', '{}']) {
      const res = await tavusWebhookHandler(
        new Request(`http://t/api/tavus/webhook?token=${SECRET}`, {
          method: 'POST',
          body,
        }),
      );
      expect(res.status).toBe(200);
    }
    expect(reconcileVideoCall).not.toHaveBeenCalled();
  });

  it('still 200 when reconcile throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    reconcileVideoCall.mockRejectedValue(new Error('tavus down'));
    const res = await tavusWebhookHandler(
      hook(SECRET, {
        conversation_id: 'conv-1',
        event_type: 'system.shutdown',
      }),
    );
    expect(res.status).toBe(200);
    expect(err).toHaveBeenCalled();
  });

  it('reconciles the matching call on shutdown and transcript events', async () => {
    for (const event_type of [
      'system.shutdown',
      'application.transcription_ready',
    ]) {
      const res = await tavusWebhookHandler(
        hook(SECRET, { conversation_id: 'conv-1', event_type }),
      );
      expect(res.status).toBe(200);
    }
    expect(getCallByConversation).toHaveBeenCalledWith('conv-1');
    expect(reconcileVideoCall).toHaveBeenCalledTimes(2);
    expect(reconcileVideoCall).toHaveBeenCalledWith({
      id: 'vc1',
      tavusConversationId: 'conv-1',
    });
  });

  it('ignores other events and unknown conversations', async () => {
    await tavusWebhookHandler(
      hook(SECRET, {
        conversation_id: 'conv-1',
        event_type: 'system.replica_joined',
      }),
    );
    getCallByConversation.mockResolvedValueOnce(null);
    await tavusWebhookHandler(
      hook(SECRET, { conversation_id: 'zzz', event_type: 'system.shutdown' }),
    );
    expect(reconcileVideoCall).not.toHaveBeenCalled();
  });
});
