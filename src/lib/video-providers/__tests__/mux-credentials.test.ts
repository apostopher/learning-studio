import { describe, expect, it } from 'vitest';
import {
  mergeStoredMuxToken,
  muxCredentialSchema,
  muxProvider,
} from '#/lib/video-providers/mux';

const key = { keyId: 'k', privateKey: 'p' };

describe('muxCredentialSchema', () => {
  it('accepts a signing key alone, treating blank token fields as absent', () => {
    expect(
      muxCredentialSchema.parse({
        ...key,
        apiTokenId: '',
        apiTokenSecret: ' ',
      }),
    ).toEqual(key);
  });

  it('accepts a full token pair', () => {
    expect(
      muxCredentialSchema.parse({
        ...key,
        apiTokenId: 'tid',
        apiTokenSecret: 'ts',
      }),
    ).toEqual({ ...key, apiTokenId: 'tid', apiTokenSecret: 'ts' });
  });

  it('rejects half a token pair, on the secret field', () => {
    const r = muxCredentialSchema.safeParse({ ...key, apiTokenId: 'tid' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({
      path: ['apiTokenSecret'],
      message: 'Enter both the API token ID and secret, or neither',
    });
  });
});

describe('mergeStoredMuxToken', () => {
  it('keeps the stored token when the admin re-saves only the signing key', () => {
    expect(
      mergeStoredMuxToken(key, {
        ...key,
        apiTokenId: 'old',
        apiTokenSecret: 'olds',
      }),
    ).toEqual({ ...key, apiTokenId: 'old', apiTokenSecret: 'olds' });
  });

  it('a newly entered token wins over the stored one', () => {
    expect(
      mergeStoredMuxToken(
        { ...key, apiTokenId: 'new', apiTokenSecret: 'news' },
        { ...key, apiTokenId: 'old', apiTokenSecret: 'olds' },
      ),
    ).toEqual({ ...key, apiTokenId: 'new', apiTokenSecret: 'news' });
  });

  it('nothing stored (or unparseable) leaves the input as is', () => {
    expect(mergeStoredMuxToken(key, null)).toEqual(key);
    expect(mergeStoredMuxToken(key, { junk: true })).toEqual(key);
  });
});

describe('muxProvider.credentialDisplay', () => {
  it('shows the token id when one is stored, never the secret', () => {
    expect(
      muxProvider.credentialDisplay({
        ...key,
        apiTokenId: 'tid',
        apiTokenSecret: 'ts',
      }),
    ).toEqual({ keyId: 'k', apiTokenId: 'tid' });
    expect(muxProvider.credentialDisplay(key)).toEqual({ keyId: 'k' });
  });
});
