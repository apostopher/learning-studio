import { describe, expect, it } from 'vitest';
import {
  OutOfTierMaterialError,
  readOutOfTierError,
} from '../out-of-tier-material-error';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('readOutOfTierError', () => {
  it('parses the out-of-tier 403 into an OutOfTierMaterialError carrying the level', async () => {
    const res = jsonResponse(403, {
      error: 'out-of-tier',
      level: 'intermediate',
    });
    const err = await readOutOfTierError(res);
    expect(err).toBeInstanceOf(OutOfTierMaterialError);
    expect(err?.level).toBe('intermediate');
  });

  it('falls back to basic when the level is missing or malformed', async () => {
    const res = jsonResponse(403, { error: 'out-of-tier', level: 'nonsense' });
    const err = await readOutOfTierError(res);
    expect(err?.level).toBe('basic');
  });

  it('returns null for a 403 with a different body shape', async () => {
    const res = jsonResponse(403, { error: 'something-else' });
    expect(await readOutOfTierError(res)).toBeNull();
  });

  it('returns null for a non-403 status, even with the matching body', async () => {
    const res = jsonResponse(500, { error: 'out-of-tier', level: 'basic' });
    expect(await readOutOfTierError(res)).toBeNull();
  });

  it('returns null when the body is not valid JSON', async () => {
    const res = new Response('not json', { status: 403 });
    expect(await readOutOfTierError(res)).toBeNull();
  });
});
