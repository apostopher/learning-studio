# Lesson Video Providers (Mux + Synthesia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin attach a Mux or Synthesia video to a lesson by pasting a URL; detect the provider, capture per-course encrypted credentials with how-to guidance, and preview the resolved video in the admin config modal.

**Architecture:** A provider registry (`detect`/`validateCredentials`/`resolvePlayback`/`howTo`) keeps providers pluggable. Per-course credentials live in one `course_video_providers` table as an AES-256-GCM jsonb envelope; a single `resolveCourseProvider` decrypts and dispatches to the provider's signer. Lessons store `video_provider` + `video_ref`. The admin Video tab and the course edit dialog share one credential form + endpoints.

**Tech Stack:** TanStack Start/Router, TanStack Query, jotai, react-hook-form + zod, Base UI, Drizzle + Neon Postgres, `@mux/mux-node` (JWT signing), `hls.js` (admin preview), Node `crypto` (AES-GCM).

**Design spec:** `docs/superpowers/specs/2026-07-16-lesson-video-providers-design.md`

## Global Constraints

- TypeScript strict; format every changed file with `pnpm exec biome check --write <paths>`.
- All client state via jotai; all server data via TanStack Query data-hooks in `src/data-hooks/`. Never `useState`/`useEffect` for data.
- Base UI components; presentational vs container split; kebab-case component files.
- **Deps (exact pins, clear the 7-day release-age gate):** `@mux/mux-node@14.1.1` (server), `hls.js@1.6.16` (client, lazy-imported).
- **New env:** `CREDENTIALS_ENCRYPTION_KEY` — required, base64 of 32 random bytes (`openssl rand -base64 32`). Add to `src/env.ts` server block.
- **Security (non-negotiable):** provider secrets are encrypted at rest and NEVER returned to the client; credential GET returns only `{ provider, configured, display, lastValidatedAt }`. Decryption is server-only. Every admin endpoint calls `requireAdmin` (mirror `src/routes/api/admin/lessons.$lessonId.ts`). Never log a secret.
- **Provider ids:** the string union `'mux' | 'synthesia'` everywhere.
- **Commit hygiene (this repo):** the user has uncommitted edits in `src/db/schema.ts`, `package.json` (dev-script `.env` line), and `CLAUDE.md`. NEVER stage those. Edit `schema.ts` for the migration but leave it unstaged — the user runs `pnpm db:push`. For dependency commits use the dance: temporarily revert the `package.json` dev-script line to `.env.local`, `git add package.json pnpm-lock.yaml`, commit only the dep line, then restore the `.env` line. Always `git add <explicit paths>`, never `-A`.
- **Verify each task:** `pnpm exec tsc --noEmit` (ignore pre-existing `ai-test` errors) and `BLOB_READ_WRITE_TOKEN=dummy CREDENTIALS_ENCRYPTION_KEY=$(openssl rand -base64 32) pnpm build`. Run vitest where the task adds tests: `pnpm exec vitest run <file>`.
- Commit trailers on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01JduKrmfroXbjvFuAX1FqRL`

---

### Task 1: Encryption utility + env key

**Files:**
- Create: `src/lib/crypto.server.ts`
- Create: `src/lib/__tests__/crypto.server.test.ts`
- Modify: `src/env.ts` (add `CREDENTIALS_ENCRYPTION_KEY`)

**Interfaces:**
- Produces: `export interface SecretEnvelope { v: 1; iv: string; tag: string; ct: string }`, `encryptJson(value: unknown): SecretEnvelope`, `decryptJson(envelope: SecretEnvelope): unknown`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/crypto.server.test.ts
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
    expect(() => decryptJson({ ...env, ct: `${env.ct}00` })).toThrow();
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `CREDENTIALS_ENCRYPTION_KEY=$(openssl rand -base64 32) pnpm exec vitest run src/lib/__tests__/crypto.server.test.ts` → FAIL (module missing).

- [ ] **Step 3: Add the env var** in `src/env.ts` server block, after `BLOB_READ_WRITE_TOKEN`:

```ts
    // 32-byte base64 key for AES-256-GCM encryption of stored provider secrets.
    CREDENTIALS_ENCRYPTION_KEY: z.string().min(1),
```

- [ ] **Step 4: Implement `src/lib/crypto.server.ts`**

```ts
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { env } from '@/env';

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
```

- [ ] **Step 5: Run tests** — same vitest command → PASS. Then `pnpm exec tsc --noEmit` clean.

- [ ] **Step 6: Commit** `src/lib/crypto.server.ts`, its test, `src/env.ts` (NOT schema.ts): `feat(video): AES-256-GCM secret envelope util + CREDENTIALS_ENCRYPTION_KEY`.

---

### Task 2: Provider registry — types, detect, how-to, credential schemas

Pure, network-free logic. `resolvePlayback`/`validateCredentials` are added in Task 3.

**Files:**
- Create: `src/lib/video-providers/types.ts`
- Create: `src/lib/video-providers/detect.ts`
- Create: `src/lib/video-providers/mux.ts`
- Create: `src/lib/video-providers/synthesia.ts`
- Create: `src/lib/video-providers/index.ts`
- Create: `src/lib/video-providers/__tests__/detect.test.ts`

**Interfaces:**
- Produces:
  - `type ProviderId = 'mux' | 'synthesia'`
  - `interface VideoProviderMeta { id: ProviderId; label: string; detect(url: string): { ref: string } | null; credentialSchema: z.ZodType; credentialDisplay(creds): Record<string, unknown>; howTo: { title: string; steps: string[] } }`
  - `const VIDEO_PROVIDERS: Record<ProviderId, VideoProviderMeta>`
  - `detectVideoUrl(url: string): { provider: ProviderId; ref: string } | null`

- [ ] **Step 1: Write the failing test** `src/lib/video-providers/__tests__/detect.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { detectVideoUrl } from '../detect';

describe('detectVideoUrl', () => {
  it('detects a Synthesia share URL', () => {
    expect(
      detectVideoUrl('https://share.synthesia.io/11111111-2222-3333-4444-555555555555'),
    ).toEqual({ provider: 'synthesia', ref: '11111111-2222-3333-4444-555555555555' });
  });
  it('detects a Mux stream URL and strips extension/query', () => {
    expect(
      detectVideoUrl('https://stream.mux.com/AbCd1234Ef.m3u8?token=x'),
    ).toEqual({ provider: 'mux', ref: 'AbCd1234Ef' });
  });
  it('returns null for an unsupported / dashboard URL', () => {
    expect(detectVideoUrl('https://dashboard.mux.com/assets/xyz')).toBeNull();
    expect(detectVideoUrl('not a url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it → FAIL.**

- [ ] **Step 3: `src/lib/video-providers/types.ts`**

```ts
import type { z } from 'zod';

export type ProviderId = 'mux' | 'synthesia';

export interface VideoProviderMeta {
  id: ProviderId;
  label: string;
  /** Detect this provider and extract the normalized ref, or null. */
  detect(url: string): { ref: string } | null;
  /** Zod schema for the credential fields the admin enters. */
  credentialSchema: z.ZodType;
  /** Non-secret projection for display. Never returns the secret itself. */
  credentialDisplay(creds: unknown): Record<string, unknown>;
  howTo: { title: string; steps: string[] };
}
```

- [ ] **Step 4: `src/lib/video-providers/synthesia.ts`**

```ts
import { z } from 'zod';
import type { VideoProviderMeta } from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const synthesiaCredentialSchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required'),
});

export const synthesiaProvider: VideoProviderMeta = {
  id: 'synthesia',
  label: 'Synthesia',
  detect(url) {
    if (UUID_RE.test(url.trim())) return { ref: url.trim() };
    try {
      const u = new URL(url);
      if (!/(^|\.)synthesia\.io$/.test(u.hostname)) return null;
      const seg = u.pathname.split('/').filter(Boolean).at(-1);
      return seg && UUID_RE.test(seg) ? { ref: seg } : null;
    } catch {
      return null;
    }
  },
  credentialSchema: synthesiaCredentialSchema,
  credentialDisplay(creds) {
    const { apiKey } = synthesiaCredentialSchema.parse(creds);
    return { apiKeyLast4: apiKey.slice(-4) };
  },
  howTo: {
    title: 'Connect Synthesia',
    steps: [
      'Open Synthesia → Settings → Integrations → API.',
      'Create (or copy) an API key.',
      'Paste it below. It is stored encrypted and only used server-side to fetch playback URLs.',
    ],
  },
};
```

- [ ] **Step 5: `src/lib/video-providers/mux.ts`**

```ts
import { z } from 'zod';
import type { VideoProviderMeta } from './types';

// Mux playback ids are url-safe base64-ish strings, no dots/slashes.
const PLAYBACK_ID_RE = /^[A-Za-z0-9]+$/;

export const muxCredentialSchema = z.object({
  keyId: z.string().trim().min(1, 'Signing key ID is required'),
  // Base64 PEM private key from the Mux signing key.
  privateKey: z.string().trim().min(1, 'Signing key (private) is required'),
});

export const muxProvider: VideoProviderMeta = {
  id: 'mux',
  label: 'Mux',
  detect(url) {
    const raw = url.trim();
    if (PLAYBACK_ID_RE.test(raw)) return { ref: raw };
    try {
      const u = new URL(raw);
      if (u.hostname !== 'stream.mux.com') return null;
      const seg = u.pathname.split('/').filter(Boolean).at(-1);
      if (!seg) return null;
      const ref = seg.replace(/\.[a-z0-9]+$/i, ''); // strip .m3u8 / .mp4
      return PLAYBACK_ID_RE.test(ref) ? { ref } : null;
    } catch {
      return null;
    }
  },
  credentialSchema: muxCredentialSchema,
  credentialDisplay(creds) {
    const { keyId } = muxCredentialSchema.parse(creds);
    return { keyId };
  },
  howTo: {
    title: 'Connect Mux',
    steps: [
      'In Mux → Settings → Signing Keys, create a signing key.',
      'Copy the Key ID and the Base64 private key.',
      'Ensure your videos use a "signed" playback policy.',
      'Paste both below — stored encrypted, used server-side to sign short-lived playback tokens.',
    ],
  },
};
```

- [ ] **Step 6: `src/lib/video-providers/index.ts`**

```ts
import { muxProvider } from './mux';
import { synthesiaProvider } from './synthesia';
import type { ProviderId, VideoProviderMeta } from './types';

export const VIDEO_PROVIDERS: Record<ProviderId, VideoProviderMeta> = {
  mux: muxProvider,
  synthesia: synthesiaProvider,
};

export const PROVIDER_IDS = Object.keys(VIDEO_PROVIDERS) as ProviderId[];
export type { ProviderId, VideoProviderMeta } from './types';
```

- [ ] **Step 7: `src/lib/video-providers/detect.ts`**

```ts
import { PROVIDER_IDS, VIDEO_PROVIDERS } from './index';
import type { ProviderId } from './types';

/** First provider whose detect() matches, with the normalized ref. */
export function detectVideoUrl(
  url: string,
): { provider: ProviderId; ref: string } | null {
  for (const id of PROVIDER_IDS) {
    const hit = VIDEO_PROVIDERS[id].detect(url);
    if (hit) return { provider: id, ref: hit.ref };
  }
  return null;
}
```

(Note: `detect.ts` imports from `index.ts`; `index.ts` does not import `detect.ts`, so no cycle.)

- [ ] **Step 8: Run tests → PASS. `pnpm exec tsc --noEmit` clean.**

- [ ] **Step 9: Commit** the `video-providers` files + test: `feat(video): provider registry — detect, credential schemas, how-to (mux, synthesia)`.

---

### Task 3: Provider playback resolution + credential validation

Adds server-only `resolvePlayback` + `validateCredentials`. Needs `@mux/mux-node`.

**Files:**
- Create: `src/lib/video-providers/resolve.server.ts`
- Modify: `package.json` / `pnpm-lock.yaml` (add `@mux/mux-node@14.1.1`)

**Interfaces:**
- Produces: `interface Playback { url: string; kind: 'hls' | 'file'; expiresAt: number | null }`, `resolvePlayback(provider: ProviderId, ref: string, creds: unknown): Promise<Playback>`, `validateCredentials(provider: ProviderId, creds: unknown): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Install the dep** — `pnpm add @mux/mux-node@14.1.1`.

- [ ] **Step 2: Confirm the JWT API** — inspect `node_modules/@mux/mux-node` for the signing helper. Expected (v14): the default export has a static `Mux.JWT.signPlaybackId(playbackId, { keyId, keySecret, expiration, type })` returning a token string. If the shape differs in the installed types, adapt the call in Step 3 accordingly (grep the dist `.d.ts` for `signPlaybackId`).

- [ ] **Step 3: Implement `src/lib/video-providers/resolve.server.ts`**

```ts
import Mux from '@mux/mux-node';
import { getVideoDetails, getVideoExpiry } from '@/integrations/synthesia/videos';
import { isVideoAvailable } from '@/types';
import { muxCredentialSchema } from './mux';
import { synthesiaCredentialSchema } from './synthesia';
import type { ProviderId } from './types';

export interface Playback {
  url: string;
  kind: 'hls' | 'file';
  expiresAt: number | null;
}

const MUX_TTL_SECONDS = 60 * 60; // 1h signed playback token

export async function resolvePlayback(
  provider: ProviderId,
  ref: string,
  creds: unknown,
): Promise<Playback> {
  if (provider === 'mux') {
    const { keyId, privateKey } = muxCredentialSchema.parse(creds);
    const token = await Mux.JWT.signPlaybackId(ref, {
      keyId,
      keySecret: privateKey,
      expiration: `${MUX_TTL_SECONDS}s`,
      type: 'video',
    });
    return {
      url: `https://stream.mux.com/${ref}.m3u8?token=${token}`,
      kind: 'hls',
      expiresAt: Math.floor(Date.now() / 1000) + MUX_TTL_SECONDS,
    };
  }
  // synthesia
  const { apiKey } = synthesiaCredentialSchema.parse(creds);
  const details = await getVideoDetails(ref, apiKey);
  if (!isVideoAvailable(details) || !details.download) {
    throw new Error('VIDEO_NOT_AVAILABLE');
  }
  return {
    url: details.download,
    kind: details.download.endsWith('.m3u8') ? 'hls' : 'file',
    expiresAt: getVideoExpiry(details.download),
  };
}

export async function validateCredentials(
  provider: ProviderId,
  creds: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === 'mux') {
      const { keyId, privateKey } = muxCredentialSchema.parse(creds);
      // Structural check: the key must sign. Full validity confirmed on play.
      await Mux.JWT.signPlaybackId('validation', {
        keyId,
        keySecret: privateKey,
        expiration: '30s',
        type: 'video',
      });
      return { ok: true };
    }
    const { apiKey } = synthesiaCredentialSchema.parse(creds);
    const res = await fetch('https://api.synthesia.io/v2/videos?limit=1', {
      headers: { Accept: 'application/json', Authorization: apiKey },
      cache: 'no-store',
    });
    return res.ok
      ? { ok: true }
      : { ok: false, error: `Synthesia returned ${res.status}` };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
```

- [ ] **Step 4: Adapt `getVideoDetails` to accept an apiKey.** In `src/integrations/synthesia/videos.ts`, change the signature to `getVideoDetails(videoId: string, apiKey: string = env.SYNTHESIA_API_KEY)` and use `apiKey` in the `Authorization` header (keeps existing callers working via the default). Confirm existing importers still typecheck.

- [ ] **Step 5: Verify** — `pnpm exec tsc --noEmit` clean; `BLOB_READ_WRITE_TOKEN=dummy CREDENTIALS_ENCRYPTION_KEY=$(openssl rand -base64 32) pnpm build` succeeds (the `@mux/mux-node` import lands in the server bundle only — `resolve.server.ts` is imported by server code only).

- [ ] **Step 6: Commit** — dep-commit dance for `package.json`/`pnpm-lock.yaml` (add `@mux/mux-node`), plus `resolve.server.ts` and the `videos.ts` change: `feat(video): provider playback resolution + credential validation (mux JWT, synthesia)`.

---

### Task 4: Schema + zod

**Files:**
- Modify: `src/db/schema.ts` (edit only — do NOT stage; user runs `pnpm db:push`)
- Modify: `src/lib/admin-schemas.ts`

**Interfaces:**
- Produces (schema): `courseVideoProvidersTable`; `lessons.videoProvider`, `lessons.videoRef`.
- Produces (zod): `providerIdSchema`, `saveCredentialInputSchema` (per-provider union), `credentialSummarySchema` (client-safe), `setLessonVideoInputSchema`, `lessonPlaybackSchema`. Extend `boardLessonSchema` with `isConfigured` unchanged (already present; its DB derivation changes in Task 5).

- [ ] **Step 1: `src/db/schema.ts`** — add lesson columns (after `video_id`/`other_video_ids`):

```ts
  videoProvider: text("video_provider"), // 'mux' | 'synthesia' | null
  videoRef: text("video_ref"),
```

and add a new table near `lessonsTable`:

```ts
export const courseVideoProvidersTable = pgTable(
  "course_video_providers",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'mux' | 'synthesia'
    secrets: jsonb("secrets").notNull(), // AES-GCM envelope { v, iv, tag, ct }
    lastValidatedAt: timestamp("last_validated_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("course_video_providers_course_provider_idx").on(
      table.courseId,
      table.provider,
    ),
  ],
);
```

Confirm `jsonb`, `uniqueIndex`, `text`, `integer`, `timestamp` are already imported at the top of `schema.ts` (they are used elsewhere).

- [ ] **Step 2: `src/lib/admin-schemas.ts`** — add:

```ts
export const providerIdSchema = z.enum(['mux', 'synthesia']);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const muxCredentialInputSchema = z.object({
  provider: z.literal('mux'),
  keyId: z.string().trim().min(1),
  privateKey: z.string().trim().min(1),
});
export const synthesiaCredentialInputSchema = z.object({
  provider: z.literal('synthesia'),
  apiKey: z.string().trim().min(1),
});
export const saveCredentialInputSchema = z.discriminatedUnion('provider', [
  muxCredentialInputSchema,
  synthesiaCredentialInputSchema,
]);
export type SaveCredentialInput = z.infer<typeof saveCredentialInputSchema>;

/** Client-safe summary — never includes secrets. */
export const credentialSummarySchema = z.object({
  provider: providerIdSchema,
  configured: z.literal(true),
  display: z.record(z.string(), z.unknown()),
  lastValidatedAt: z.coerce.date().nullable(),
});
export type CredentialSummary = z.infer<typeof credentialSummarySchema>;

export const setLessonVideoInputSchema = z.object({
  provider: providerIdSchema,
  ref: z.string().trim().min(1),
});
export type SetLessonVideoInput = z.infer<typeof setLessonVideoInputSchema>;

export const lessonPlaybackSchema = z.object({
  url: z.string().url(),
  kind: z.enum(['hls', 'file']),
  expiresAt: z.number().nullable(),
});
export type LessonPlayback = z.infer<typeof lessonPlaybackSchema>;
```

- [ ] **Step 3: Verify** `pnpm exec tsc --noEmit` clean (schema/zod compile). Do NOT run `db:push` — that's the user.

- [ ] **Step 4: Commit** ONLY `src/lib/admin-schemas.ts` (schema.ts stays unstaged): `feat(video): zod schemas for credentials, set-video, playback`. In the task report, note that `src/db/schema.ts` was edited and the user must run `pnpm db:push`.

---

### Task 5: DB layer

**Files:**
- Modify: `src/db/admin.ts`

**Interfaces:**
- Consumes: `crypto.server` (`encryptJson`/`decryptJson`), `resolve.server` (`resolvePlayback`/`validateCredentials`), `VIDEO_PROVIDERS`.
- Produces:
  - `listCourseProviders(courseId): Promise<CredentialSummary[]>`
  - `saveCourseProvider(courseId, input: SaveCredentialInput): Promise<{ ok: boolean; error?: string }>` (validates → encrypts → upserts → sets lastValidatedAt)
  - `deleteCourseProvider(courseId, provider): Promise<boolean>`
  - `resolveCourseProvider(courseId, provider): Promise<unknown | null>` (decrypted creds, server-only)
  - `setLessonVideo(lessonId, provider, ref): Promise<{ id: number } | null>`
  - `resolveLessonPlayback(lessonId): Promise<Playback | null>` (looks up lesson → course → creds → `resolvePlayback`)
  - Update `getCourseBoard` lesson map: `isConfigured: l.videoRef !== null || l.videoId !== null` (select `videoRef` too).

- [ ] **Step 1: Imports** — add to `src/db/admin.ts`:
  `import { decryptJson, encryptJson, type SecretEnvelope } from '@/lib/crypto.server';`
  `import { resolvePlayback, validateCredentials, type Playback } from '@/lib/video-providers/resolve.server';`
  `import { VIDEO_PROVIDERS, type ProviderId } from '@/lib/video-providers';`
  `import { courseVideoProvidersTable } from '@/db/schema';`
  `import type { CredentialSummary, SaveCredentialInput } from '@/lib/admin-schemas';`

- [ ] **Step 2: `listCourseProviders`**

```ts
export async function listCourseProviders(
  courseId: number,
): Promise<CredentialSummary[]> {
  const rows = await db
    .select({
      provider: courseVideoProvidersTable.provider,
      secrets: courseVideoProvidersTable.secrets,
      lastValidatedAt: courseVideoProvidersTable.lastValidatedAt,
    })
    .from(courseVideoProvidersTable)
    .where(eq(courseVideoProvidersTable.courseId, courseId));
  return rows.map((r) => {
    const provider = r.provider as ProviderId;
    const creds = decryptJson(r.secrets as SecretEnvelope);
    return {
      provider,
      configured: true as const,
      display: VIDEO_PROVIDERS[provider].credentialDisplay(creds),
      lastValidatedAt: r.lastValidatedAt,
    };
  });
}
```

- [ ] **Step 3: `saveCourseProvider`** — strips the `provider` discriminator out of the stored payload; validates before persisting:

```ts
export async function saveCourseProvider(
  courseId: number,
  input: SaveCredentialInput,
): Promise<{ ok: boolean; error?: string }> {
  const { provider, ...creds } = input;
  const validation = await validateCredentials(provider, creds);
  if (!validation.ok) return validation;
  const secrets = encryptJson(creds);
  await db
    .insert(courseVideoProvidersTable)
    .values({ courseId, provider, secrets, lastValidatedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        courseVideoProvidersTable.courseId,
        courseVideoProvidersTable.provider,
      ],
      set: { secrets, lastValidatedAt: new Date(), updatedAt: sql`now()` },
    });
  return { ok: true };
}
```

- [ ] **Step 4: `deleteCourseProvider`, `resolveCourseProvider`**

```ts
export async function deleteCourseProvider(
  courseId: number,
  provider: ProviderId,
): Promise<boolean> {
  const [deleted] = await db
    .delete(courseVideoProvidersTable)
    .where(
      and(
        eq(courseVideoProvidersTable.courseId, courseId),
        eq(courseVideoProvidersTable.provider, provider),
      ),
    )
    .returning({ id: courseVideoProvidersTable.id });
  return Boolean(deleted);
}

/** Server-only: decrypted creds for a course+provider, or null. */
export async function resolveCourseProvider(
  courseId: number,
  provider: ProviderId,
): Promise<unknown | null> {
  const [row] = await db
    .select({ secrets: courseVideoProvidersTable.secrets })
    .from(courseVideoProvidersTable)
    .where(
      and(
        eq(courseVideoProvidersTable.courseId, courseId),
        eq(courseVideoProvidersTable.provider, provider),
      ),
    );
  return row ? decryptJson(row.secrets as SecretEnvelope) : null;
}
```

Add `and` to the existing `drizzle-orm` import if not present.

- [ ] **Step 5: `setLessonVideo` + `resolveLessonPlayback`**

```ts
export async function setLessonVideo(
  lessonId: number,
  provider: ProviderId,
  ref: string,
): Promise<{ id: number } | null> {
  const [updated] = await db
    .update(lessonsTable)
    .set({ videoProvider: provider, videoRef: ref, updatedAt: sql`now()` })
    .where(eq(lessonsTable.id, lessonId))
    .returning({ id: lessonsTable.id });
  return updated ?? null;
}

export async function resolveLessonPlayback(
  lessonId: number,
): Promise<Playback | null> {
  const [lesson] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
      courseId: modulesTable.courseId,
    })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .where(eq(lessonsTable.id, lessonId));
  if (!lesson?.videoProvider || !lesson.videoRef) return null;
  const provider = lesson.videoProvider as ProviderId;
  const creds = await resolveCourseProvider(lesson.courseId, provider);
  if (!creds) return null;
  return resolvePlayback(provider, lesson.videoRef, creds);
}
```

- [ ] **Step 6: `isConfigured`** — in `getCourseBoard`, add `videoRef: lessonsTable.videoRef` to the lesson select and change the map to `isConfigured: l.videoRef !== null || l.videoId !== null`.

- [ ] **Step 7: Verify** `pnpm exec tsc --noEmit` clean; build succeeds.

- [ ] **Step 8: Commit** `src/db/admin.ts`: `feat(video): db layer — course provider CRUD, resolve, set-lesson-video, playback`.

---

### Task 6: API routes

Mirror the guard + structure of `src/routes/api/admin/lessons.$lessonId.ts` (local `guard(request)` → 403 `ForbiddenError`).

**Files:**
- Create: `src/routes/api/admin/courses.$courseId.credentials.ts` (GET list, PUT upsert)
- Create: `src/routes/api/admin/courses.$courseId.credentials.$provider.ts` (DELETE)
- Create: `src/routes/api/admin/lessons.$lessonId.video.ts` (PUT set video)
- Create: `src/routes/api/admin/lessons.$lessonId.video-playback.ts` (GET resolve)

**Interfaces:**
- Consumes Task-5 DB fns and Task-4 zod. Each handler: `guard` → parse id → parse body with the relevant zod → call DB fn → JSON. Never returns secrets.

- [ ] **Step 1: `courses.$courseId.credentials.ts`**
  - `GET`: `Response.json(await listCourseProviders(courseId))`.
  - `PUT`: parse body with `saveCredentialInputSchema`; `const result = await saveCourseProvider(courseId, parsed.data)`; if `!result.ok` return `Response.json({ error: result.error ?? 'Validation failed' }, { status: 400 })`; else `Response.json({ ok: true })`.

- [ ] **Step 2: `courses.$courseId.credentials.$provider.ts`**
  - `DELETE`: validate `params.provider` with `providerIdSchema`; `deleteCourseProvider(courseId, provider)`; 404 if false else 204.

- [ ] **Step 3: `lessons.$lessonId.video.ts`**
  - `PUT`: parse body with `setLessonVideoInputSchema`; `setLessonVideo(lessonId, provider, ref)`; 404 if null else `Response.json({ ok: true })`.

- [ ] **Step 4: `lessons.$lessonId.video-playback.ts`**
  - `GET`: `const playback = await resolveLessonPlayback(lessonId)`; if null `return new Response('Not found', { status: 404 })`; else `Response.json(playback)`. (Short-TTL — no caching header needed for the admin preview; optionally wrap `resolveLessonPlayback` with `cacheWithRedis` keyed by lessonId using `expiresAt` — OPTIONAL, note in report if skipped.)

- [ ] **Step 5: Verify** `pnpm exec tsc --noEmit`; `pnpm build` (regenerates the route tree — commit `src/routeTree.gen.ts`).

- [ ] **Step 6: Commit** the four route files + `src/routeTree.gen.ts`: `feat(video): admin API routes — credentials, set-video, playback`.

---

### Task 7: Data hooks

Mirror `src/data-hooks/use-update-lesson.ts` / `use-course-board.ts`.

**Files:**
- Create: `src/data-hooks/use-course-credentials.ts` (query, parses `z.array(credentialSummarySchema)`)
- Create: `src/data-hooks/use-save-credential.ts` (mutation → `PUT …/credentials`, invalidates course-credentials)
- Create: `src/data-hooks/use-delete-credential.ts` (mutation → `DELETE …/credentials/:provider`)
- Create: `src/data-hooks/use-set-lesson-video.ts` (mutation → `PUT …/lessons/:id/video`, invalidates courseBoard + playback)
- Create: `src/data-hooks/use-lesson-video-playback.ts` (query → `GET …/video-playback`, parses `lessonPlaybackSchema`, `enabled` when the lesson has a video, `staleTime` short)
- Modify: `src/data-hooks/keys.ts` (add `courseCredentials(courseId)` and `lessonPlayback(lessonId)` keys)

**Interfaces:** typed hooks returning parsed data; `useSaveCredential(courseId)` takes `SaveCredentialInput` and returns `{ ok, error }` (surface validation errors to the form).

- [ ] **Step 1: keys** — add to `dataKeys`:
```ts
  courseCredentials: (courseId: number) => ['admin', 'course-credentials', courseId] as const,
  lessonPlayback: (lessonId: number) => ['admin', 'lesson-playback', lessonId] as const,
```

- [ ] **Step 2–6:** Implement each hook mirroring the existing patterns (fetch + `res.ok` throw + zod parse for queries; `onSuccess` invalidate for mutations). `useSaveCredential.mutationFn` returns the parsed `{ ok, error }` JSON (the PUT returns 400 with `{ error }` on validation failure — treat non-2xx as a thrown error carrying the message so the form can show it).

- [ ] **Step 7: Verify** `pnpm exec tsc --noEmit` clean.

- [ ] **Step 8: Commit** the hooks + keys: `feat(video): data-hooks — credentials, set-video, playback`.

---

### Task 8: Video section UI + admin preview

Replace the Video tab placeholder in `lesson-config-dialog-container.tsx` with the real section. Add `hls.js` (lazy).

**Files:**
- Modify: `package.json`/`pnpm-lock.yaml` (add `hls.js@1.6.16`)
- Create: `src/components/admin/lesson-config/video-section-container.tsx` (container)
- Create: `src/components/admin/lesson-config/video-preview.tsx` (presentational; hls.js player)
- Create: `src/components/admin/lesson-config/video-url-form.tsx` (presentational; react-hook-form URL input, shows detected provider)
- Create: `src/components/admin/lesson-config/provider-how-to.tsx` (presentational; renders `howTo`)
- Create: `src/components/admin/lesson-config/provider-credential-form.tsx` (presentational; fields per provider, write-only, Test/Save)
- Modify: `src/components/admin/lesson-config-dialog-container.tsx` (render `<VideoSectionContainer lesson={lesson} courseId={...} />` inside the `video` Tabs.Panel; the modal needs `courseId` — pass it from `ModuleBoardContainer` via a new prop, or look it up: add a `courseId` prop to `LessonConfigDialogContainer` and pass `courseId` from `module-board-container.tsx`.)

**Interfaces / behavior:**
- `VideoSectionContainer`: reads the lesson (`videoProvider`/`videoRef` — extend `BoardLesson` + board select to include them; add `videoProvider`/`videoRef` to `boardLessonSchema` and the `getCourseBoard` map so the client knows the current video). Uses `useCourseCredentials(courseId)`, `useSetLessonVideo`, `useSaveCredential`, `useLessonVideoPlayback(lessonId)`.
- State machine (jotai atoms or derived from data): `no-video → detecting → needs-credentials(provider) → resolving → playing | error`.
- `video-preview`: given a `LessonPlayback`, render a 16:9 player. For `kind:'hls'` lazy-`import('hls.js')` and attach to a `<video>` (native HLS on Safari); for `kind:'file'`, plain `<video src>`. Placeholder (lucide `Video`/`Play` icon on `bg-gray-3`) when no playback.

- [ ] **Step 1: Extend the board lesson payload** — add `videoProvider`/`videoRef` to `boardLessonSchema` (nullable) and to the `getCourseBoard` lesson select + map. `tsc` + build.

- [ ] **Step 2: Install `hls.js@1.6.16`** (dep-commit dance at commit time).

- [ ] **Step 3: Build `video-preview.tsx`** — 16:9 container; effect (allowed here — it's a media/DOM widget, document why) that lazy-loads hls.js for `.m3u8` and cleans up on unmount; placeholder when `playback` is null.

- [ ] **Step 4: Build `video-url-form.tsx`** — react-hook-form single URL field; on change/submit run `detectVideoUrl` (client import from `src/lib/video-providers/detect.ts` — pure, no server code); show the detected provider label or "Unsupported URL".

- [ ] **Step 5: Build `provider-how-to.tsx` + `provider-credential-form.tsx`** — how-to renders `VIDEO_PROVIDERS[provider].howTo`; credential form renders fields per provider (Mux: keyId + privateKey(password); Synthesia: apiKey(password)) with a Save action calling `useSaveCredential`; surface `{ ok:false, error }`.

- [ ] **Step 6: Build `video-section-container.tsx`** — orchestrate: URL form → detect → `useSetLessonVideo` → if `useCourseCredentials` lacks the provider, show how-to + credential form (`useSaveCredential`), else `useLessonVideoPlayback` → `video-preview`.

- [ ] **Step 7: Wire into the modal** — pass `courseId` to `LessonConfigDialogContainer`; render `<VideoSectionContainer>` inside the `video` `Tabs.Panel` (drop the placeholder for that panel).

- [ ] **Step 8: Verify** `tsc` + build (hls.js lazy chunk emitted). Manual browser check noted in report.

- [ ] **Step 9: Commit** (dep dance for hls.js) all UI files + wiring: `feat(video): lesson video section — URL detect, credentials, admin preview`.

---

### Task 9: Course video integrations section (course edit dialog)

**Files:**
- Create: `src/components/admin/course-video-integrations-container.tsx`
- Modify: `src/components/admin/create-course-form.tsx` (accept a `videoIntegrations?: ReactNode` slot rendered below the image field)
- Modify: `src/components/admin/edit-course-dialog-container.tsx` (pass `<CourseVideoIntegrationsContainer courseId={target.id} />`); leave `create-course-dialog-container.tsx` passing `undefined` (a course must exist first).

**Interfaces / behavior:**
- `CourseVideoIntegrationsContainer`: `useCourseCredentials(courseId)` lists each provider from `VIDEO_PROVIDERS` with configured/not-configured state; per provider, reuse `provider-how-to` + `provider-credential-form` (add/update) and a Remove button (`useDeleteCredential`). No secrets shown — only `display` (keyId / last-4) + `lastValidatedAt`.

- [ ] **Step 1: Build `course-video-integrations-container.tsx`** — iterate `PROVIDER_IDS`; for each show label + configured badge (from `useCourseCredentials`), an expand-to-edit (reuse credential form) and Remove.
- [ ] **Step 2: Add the `videoIntegrations` slot** to `create-course-form.tsx` (render `{videoIntegrations}` under the cover-image field; optional prop).
- [ ] **Step 3: Wire** into `edit-course-dialog-container.tsx` only (edit has a real `courseId`).
- [ ] **Step 4: Verify** `tsc` + build.
- [ ] **Step 5: Commit** the files: `feat(video): manage course video credentials in the course edit dialog`.

---

## Post-plan

- Final whole-branch review (subagent-driven-development's final review).
- The user must run `pnpm db:push` (Task 4) and set `CREDENTIALS_ENCRYPTION_KEY` before the feature works; browser-verify the Video tab end-to-end (needs a real Mux/Synthesia course credential).
- Follow-ons (separate): learner-side Mux player + signed-token endpoint; backfill existing `video_id`.

## Self-review notes

- Spec coverage: encryption (T1), registry+detect+howto (T2), resolve+validate (T3), schema+zod (T4), db (T5), routes (T6), hooks (T7), video UI+preview (T8), course-dialog credential mgmt (T9). ✓
- Types consistent: `ProviderId` union, `SecretEnvelope`, `Playback`, `CredentialSummary`, `SaveCredentialInput`, `SetLessonVideoInput`, `LessonPlayback` defined once and reused. ✓
- Security: secrets never in board payload / GET responses; write-only inputs; server-only decrypt; requireAdmin. ✓
