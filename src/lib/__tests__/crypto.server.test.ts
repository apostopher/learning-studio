import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from '../crypto.server';

describe('crypto.server', () => {
  it('round-trips a JSON value', () => {
    const value = { apiKey: 'sk_live_abc', nested: { keyId: '123' } };
    const env = encryptJson(value);
    expect(env.v).toBe(1);
    expect(env.ct).not.toContain('sk_live_abc'); // ciphertext hides plaintext
    expect(decryptJson(env)).toEqual(value);
  });

  it('produces a fresh iv each time', () => {
    const a = encryptJson({ x: 1 });
    const b = encryptJson({ x: 1 });
    expect(a.iv).not.toBe(b.iv);
  });

  it('rejects a tampered ciphertext', () => {
    const env = encryptJson({ x: 1 });
    // Flip the leading base64 char rather than appending: `ct` here is short
    // enough that its base64 form ends in `=` padding, and Node's lenient
    // base64 decoder silently ignores bytes appended after padding — so
    // `${env.ct}00` round-trips to the *same* bytes and never exercises
    // tamper detection. Mutating a char inside the payload guarantees the
    // decoded bytes actually change.
    const tamperedCt = `${env.ct[0] === 'A' ? 'B' : 'A'}${env.ct.slice(1)}`;
    expect(() => decryptJson({ ...env, ct: tamperedCt })).toThrow();
  });
});
