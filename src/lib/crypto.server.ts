import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env';

export interface SecretEnvelope {
  v: 1;
  iv: string; // base64
  tag: string; // base64
  ct: string; // base64
}

const KEY = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, 'base64');
if (KEY.length !== 32) {
  throw new Error('CREDENTIALS_ENCRYPTION_KEY must be base64 of 32 bytes');
}

/** AES-256-GCM encrypt a JSON-serializable value into an envelope. */
export function encryptJson(value: unknown): SecretEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

/** Decrypt an envelope back into its JSON value. Throws on tamper/wrong key. */
export function decryptJson(envelope: SecretEnvelope): unknown {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    KEY,
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(envelope.ct, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(pt.toString('utf8'));
}
