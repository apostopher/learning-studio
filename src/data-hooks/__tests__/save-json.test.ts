// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveJson } from '#/data-hooks/save-json';

afterEach(() => vi.restoreAllMocks());

describe('saveJson', () => {
  it('uses sendBeacon for fire-and-forget POST when available', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveJson({
      url: '/x',
      method: 'POST',
      body: { a: 1 },
      fireAndForget: true,
    });

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0];
    expect(url).toBe('/x');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
  });

  it('falls back to keepalive fetch when sendBeacon is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await saveJson({ url: '/x', method: 'POST', body: {}, fireAndForget: true });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
  });

  it('normal save fetches (no keepalive) and parses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ v: 2 }) });
    vi.stubGlobal('fetch', fetchMock);

    const out = await saveJson<{ v: number }>({
      url: '/x',
      method: 'POST',
      body: {},
      parse: (j) => j as { v: number },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.keepalive).toBe(false);
    expect(out).toEqual({ v: 2 });
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(
      saveJson({ url: '/x', method: 'POST', body: {} }),
    ).rejects.toThrow(/500/);
  });

  it('falls back to keepalive fetch when sendBeacon returns false', async () => {
    const beacon = vi.fn().mockReturnValue(false);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await saveJson({ url: '/x', method: 'POST', body: {}, fireAndForget: true });

    expect(beacon).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
  });
});
