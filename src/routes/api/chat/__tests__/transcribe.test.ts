// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, generateText } = vi.hoisted(() => ({
  getSession: vi.fn(),
  generateText: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('ai', async (orig) => ({ ...(await orig<object>()), generateText }));

import { transcribeHandler } from '../transcribe';

function form(blob: Blob | null): Request {
  const fd = new FormData();
  if (blob) fd.set('audio', blob);
  return new Request('http://t/api/chat/transcribe', {
    method: 'POST',
    body: fd,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'u1' } });
  generateText.mockResolvedValue({ text: '  hello world  ' });
});

describe('transcribeHandler', () => {
  it('401 without session', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await transcribeHandler(
      form(new Blob(['x'], { type: 'audio/webm' })),
    );
    expect(res.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('400 when audio missing', async () => {
    const res = await transcribeHandler(form(null));
    expect(res.status).toBe(400);
  });

  it('400 when audio empty', async () => {
    const res = await transcribeHandler(
      form(new Blob([], { type: 'audio/webm' })),
    );
    expect(res.status).toBe(400);
  });

  it('returns the trimmed transcript', async () => {
    const res = await transcribeHandler(
      form(new Blob(['x'], { type: 'audio/webm' })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: 'hello world' });
  });

  // An oversize (>20MB) test is skipped here — constructing a >20MB Blob in
  // the test process is wasteful; the 20MB cap (MAX_AUDIO_BYTES) is enforced
  // identically to the missing/empty checks above and is a one-line branch.
});
