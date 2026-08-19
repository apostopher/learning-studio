// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, acknowledgeLevelRow } = vi.hoisted(() => ({
  getSession: vi.fn(),
  acknowledgeLevelRow: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/user-levels', () => ({ acknowledgeLevelRow }));

import { postLevelAcknowledgeHandler } from '../level-acknowledge';

function post(body: unknown): Request {
  return new Request('http://test/api/user/level-acknowledge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  acknowledgeLevelRow.mockResolvedValue(undefined);
});

describe('postLevelAcknowledgeHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await postLevelAcknowledgeHandler(post({ rowId: 42 }));
    expect(res.status).toBe(401);
    expect(acknowledgeLevelRow).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON', async () => {
    const res = await postLevelAcknowledgeHandler(
      new Request('http://test/api/user/level-acknowledge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
    expect(acknowledgeLevelRow).not.toHaveBeenCalled();
  });

  it('400 when rowId is missing or not a positive integer', async () => {
    const res = await postLevelAcknowledgeHandler(post({ rowId: -1 }));
    expect(res.status).toBe(400);
    expect(acknowledgeLevelRow).not.toHaveBeenCalled();
  });

  /**
   * The session user is what reaches the store, never a client-supplied one —
   * even though acknowledgeLevelRow also scopes by userId internally, this
   * handler must not trust a body-supplied id to begin with.
   */
  it('acknowledges the row for the session user, ignoring any client-supplied user id', async () => {
    const res = await postLevelAcknowledgeHandler(
      post({ rowId: 42, userId: 'someone-else' }),
    );
    expect(res.status).toBe(204);
    expect(acknowledgeLevelRow).toHaveBeenCalledWith('user-1', 42);
  });
});
