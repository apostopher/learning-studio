// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@mux/mux-node', () => ({
  default: class {
    video = { assets: { list } };
  },
}));

import { checkMuxApiToken } from '#/lib/video-providers/mux-api.server';

afterEach(() => vi.restoreAllMocks());

describe('checkMuxApiToken', () => {
  it('accepts a token Mux answers for', async () => {
    list.mockResolvedValueOnce({ data: [] });
    expect(await checkMuxApiToken('t', 's')).toBeNull();
  });

  it.each([401, 403])('blocks the save when Mux answers %s', async (status) => {
    list.mockRejectedValueOnce(
      Object.assign(new Error(`${status}`), { status }),
    );
    expect(await checkMuxApiToken('t', 's')).toBe(
      'Mux rejected the API token.',
    );
  });

  // A Mux blip says nothing about the token; it must never block saving
  // the course's credentials.
  it.each([
    ['a 5xx', Object.assign(new Error('502 Bad Gateway'), { status: 502 })],
    ['a timeout', new Error('Request timed out.')],
    ['a network failure', new TypeError('fetch failed')],
  ])('lets the save through (logged) on %s', async (_label, error) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    list.mockRejectedValueOnce(error);
    expect(await checkMuxApiToken('t', 's')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
