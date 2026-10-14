# Mux Auto-Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mux lesson videos get auto-generated captions. The shared player shows CC for them, and the lesson debrief (which needs a caption transcript) becomes available for Mux lessons.

**Architecture:**
- **Pure helpers and a dependency-injected service.** These live in
  `src/lib/video-providers/mux-captions*.ts` and decide everything: the
  language mapping, which track to use, when to refresh, the cache TTL and
  the error copy. The service functions `requestMuxCaptions` and
  `readMuxCaptions` take a store and a Mux API.
- **A thin real Mux API wrapper:** `mux-api.server.ts`.
- **A thin drizzle store and wiring:** `src/db/video-captions.ts`.
- **Playback.** Learner and admin playback pick up captions through an
  injected lookup in `resolvePlayback`. Admin save routes request captions
  after saving a Mux video. A new admin captions route plus a
  `CaptionsStatus` line show progress and allow retry.

**Tech Stack:** TanStack Start, drizzle (Postgres), `@mux/mux-node` 14.1.1 (already a dependency), zod 4, TanStack Query, jotai, Base UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-mux-auto-captions-design.md`

## Global Constraints

- **Footprint.** No new dependencies and no new environment variables. The
  only migration is the hand-written idempotent `pnpm db:migrate-video-captions`.
  Never run `db:push` or `drizzle-kit generate`.
- **Mux API calls** use `new Mux({ tokenId, tokenSecret, timeout: 10_000, maxRetries: 1 })`.
- **Language map:**
  - `en`→`en`, `fr`/`fr-CA`→`fr`, `es`→`es`, `de`→`de`, `pt-BR`→`pt`,
    `tr`→`tr`;
  - `ja zh af ar hi` → unsupported. Mux is never called for them.
- **Status refresh** happens at most once per 60s per playback id, and
  only while the status is `generating` and an API token is available.
- **Learner playback cache TTL** is capped at 60s while captions are
  generating.
- **Failures never break other work.** A captions failure never fails a
  video save, never breaks playback, and never throws out of a read.
- **Copy, verbatim:**

  | Case | Copy |
  |---|---|
  | Token rejected | "Mux rejected the API token." |
  | 7-day limit | "Mux only captions videos older than 7 days on request — contact Mux support." |
  | Other Mux error | "Mux couldn't generate captions: <message>" |
  | Generating | "Generating <Language> captions… usually a few minutes" |
  | Ready | "<Language> captions ready" |
  | Failed | "<Language> captions failed: <reason>" |
  | Unsupported | "Mux can't generate <Language> captions" |
  | No token | "Add a Mux API token to this course's Mux credentials to generate captions" |
  | No row | "No captions yet" |
  | Not a Mux video (409) | "Captions come from the provider for this video." |

- **Project conventions:**
  - `.server.ts` modules are never imported by `src/routes/**` files
    directly. API route handlers import `src/db/*` modules, which may
    import `.server.ts`. That's the existing pattern: routes →
    `#/db/admin` → `resolve.server`.
  - Vitest imports use `#/`. Internal modules are fully stubbed in
    `vi.mock`, never `importOriginal`.
  - Tests assert on what the consumer received. Every regression test
    must be seen failing before it's fixed.
  - Logical CSS only. Base UI for controls. WCAG AA. Every non-ready
    state states its reason visibly.
  - Container/presentational split. Jotai or TanStack Query, never
    `useState`.
- **Formatting and staging.**
  - Run `pnpm biome check --write <file> …` on the files you changed, by
    explicit path only.
  - `git add` explicit paths only. The working tree holds the user's
    unrelated modified files: never stage, format, stash or revert them.
- **Commit trailer:**
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01WjpvarXhi3euZ11pKz9TmR`.

## Review Focus

1. **Re-saving credentials without retyping the token.** It must keep the
   stored token, not silently drop it and switch captions off for the
   course. *Pinned in Task 1 (`mergeStoredMuxToken` test).*
2. **A Mux API outage while saving a video.** The save must still return
   `{ ok: true }`, and the failure must be recorded so Retry is offered.
   *Pinned in Task 6 (save-route test with a throwing captions request).*
3. **A captions DB or Mux error during playback.** The video must still
   play, with `captions: null`. *Pinned in Task 5 (resolver test with a
   throwing lookup).*
4. **A video still generating when a learner opens it.** The cached
   playback must expire within 60s, so CC appears soon after Mux finishes,
   not an hour later. *Pinned in Task 2 (`playbackCacheTtl`) and Task 5
   (cache write test).*
5. **An alternate in an unsupported language (Japanese).** The status must
   be "unsupported" with Mux never called, and CC disabled with a reason.
   *Pinned in Task 3 (service test asserting zero API calls).*

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/video-providers/mux.ts` | Token pair in `muxCredentialSchema`; `mergeStoredMuxToken`; display; how-to | 1 |
| `src/lib/admin-schemas.ts` | `muxCredentialInputSchema` gains optional token fields; `lessonCaptionsSchema` | 1, 7 |
| `src/lib/video-providers/mux-api.server.ts` (new) | Real Mux API: playback→asset, asset tracks, generate subtitles, token check, `muxApiFromCreds` | 1, 3 |
| `src/lib/video-providers/resolve.server.ts` | `validateCredentials` token check; Mux captions injection | 1, 5 |
| `src/db/admin.ts` | `saveCourseProvider` merges the stored token | 1 |
| `src/components/admin/lesson-config/credential-fields.ts` | Two optional token inputs | 1 |
| `src/lib/video-providers/mux-captions.ts` (new) | Pure helpers and types | 2 |
| `src/lib/video-providers/mux-captions-service.ts` (new) | `requestMuxCaptions` and `readMuxCaptions` with injected store and API | 3 |
| `src/db/schema.ts` | `videoCaptionsTable` | 4 |
| `src/db/migrate-video-captions.ts` (new) + `package.json` script | Idempotent table creation | 4 |
| `src/db/video-captions.ts` (new) | Drizzle store; lesson→target; credentials finder; wiring functions | 4 |
| `src/db/resolve-lesson-video.ts`, `src/db/lesson-playback.ts`, `src/db/lesson-transcript.ts`, `src/components/lesson-material/compute-transcript-debrief.ts` | Playback picks up captions; cache TTL cap; comment fixes | 5 |
| Save routes, `src/routes/api/admin/lessons.$lessonId.captions.ts` (new), `scripts/backfill-mux-captions.ts` (new) + `package.json` script | Triggers | 6 |
| `src/data-hooks/keys.ts`, `use-lesson-captions.ts`, `use-request-lesson-captions.ts` (new), `captions-status.tsx` and `captions-status-container.tsx` (new), `video-section-container.tsx` | Admin UI | 7 |

---

### Task 1: Credentials carry an optional Mux API token

**Files:**
- Modify: `src/lib/video-providers/mux.ts`, `src/lib/admin-schemas.ts` (`muxCredentialInputSchema`), `src/lib/video-providers/resolve.server.ts` (`validateCredentials`), `src/db/admin.ts` (`saveCourseProvider`), `src/components/admin/lesson-config/credential-fields.ts`
- Create: `src/lib/video-providers/mux-api.server.ts` (token check only in this task)
- Test: `src/lib/video-providers/__tests__/mux-credentials.test.ts` (create), `src/lib/video-providers/resolve.server.test.ts` (extend)

**Interfaces:**
- Produces:
  - `muxCredentialSchema` (refined) with optional `apiTokenId` and
    `apiTokenSecret`. Blank strings count as absent, and the pair is
    all-or-nothing.
  - `type MuxCredentials = z.infer<typeof muxCredentialSchema>`.
  - `mergeStoredMuxToken(input: MuxCredentials, stored: unknown): MuxCredentials`
    in `mux.ts`.
  - `checkMuxApiToken(tokenId: string, tokenSecret: string): Promise<string | null>`
    in `mux-api.server.ts`. It returns the error copy, or `null` when OK.
  - `CredentialFormValues` gains `apiTokenId?` and `apiTokenSecret?`.

- [ ] **Step 1: Write the failing tests**

`src/lib/video-providers/__tests__/mux-credentials.test.ts`:

```ts
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
      muxCredentialSchema.parse({ ...key, apiTokenId: '', apiTokenSecret: ' ' }),
    ).toEqual(key);
  });

  it('accepts a full token pair', () => {
    expect(
      muxCredentialSchema.parse({ ...key, apiTokenId: 'tid', apiTokenSecret: 'ts' }),
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
      mergeStoredMuxToken(key, { ...key, apiTokenId: 'old', apiTokenSecret: 'olds' }),
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
      muxProvider.credentialDisplay({ ...key, apiTokenId: 'tid', apiTokenSecret: 'ts' }),
    ).toEqual({ keyId: 'k', apiTokenId: 'tid' });
    expect(muxProvider.credentialDisplay(key)).toEqual({ keyId: 'k' });
  });
});
```

In `src/lib/video-providers/resolve.server.test.ts`:
- Follow the file's existing `vi.hoisted` and `vi.mock` setup.
- Add `vi.mock('./mux-api.server', () => ({ checkMuxApiToken }))`, where
  `checkMuxApiToken` is a `vi.hoisted` `vi.fn()`.
- Add these tests:

```ts
describe('validateCredentials — Mux API token', () => {
  it('checks the token when one is given and reports its rejection', async () => {
    checkMuxApiToken.mockResolvedValue('Mux rejected the API token.');
    const r = await validateCredentials('mux', {
      keyId: 'k', privateKey: VALID_TEST_PRIVATE_KEY, apiTokenId: 'tid', apiTokenSecret: 'ts',
    });
    expect(checkMuxApiToken).toHaveBeenCalledWith('tid', 'ts');
    expect(r).toEqual({ ok: false, error: 'Mux rejected the API token.' });
  });

  it('does not call Mux when no token is given', async () => {
    checkMuxApiToken.mockClear();
    const r = await validateCredentials('mux', { keyId: 'k', privateKey: VALID_TEST_PRIVATE_KEY });
    expect(checkMuxApiToken).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });

  it('reports half a token pair in words, not as a zod dump', async () => {
    const r = await validateCredentials('mux', {
      keyId: 'k', privateKey: VALID_TEST_PRIVATE_KEY, apiTokenId: 'tid',
    });
    expect(r).toEqual({
      ok: false,
      error: 'Enter both the API token ID and secret, or neither',
    });
  });
});
```

For `VALID_TEST_PRIVATE_KEY`, use whatever the file's existing Mux
`validateCredentials` tests use: either a fixture key, or a stubbed
`mux.jwt.signPlaybackId`. If they stub the signer, keep stubbing it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/video-providers/__tests__/mux-credentials.test.ts src/lib/video-providers/resolve.server.test.ts`

Expected: FAIL. `mergeStoredMuxToken` is not exported, the token fields
are stripped, and `checkMuxApiToken` is never called.

- [ ] **Step 3: Implement**

`src/lib/video-providers/mux.ts`: replace `muxCredentialSchema` and add the
merge. Keep `muxProvider` and update `credentialDisplay` and `howTo`.

```ts
/** Blank inputs from an untouched optional form field are "absent". */
const optionalSecret = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().min(1).optional(),
);

/** Field shape, unrefined, so the API input schema can spread it into a discriminated union. */
export const muxCredentialShape = {
  keyId: z.string().trim().min(1, 'Signing key ID is required'),
  // Base64 PEM private key from the Mux signing key.
  privateKey: z.string().trim().min(1, 'Signing key (private) is required'),
  // Optional Mux API access token (Video read/write): only needed to generate
  // captions. Playback signing never uses it.
  apiTokenId: optionalSecret,
  apiTokenSecret: optionalSecret,
};

export const muxCredentialSchema = z
  .object(muxCredentialShape)
  .refine(
    (c) => (c.apiTokenId === undefined) === (c.apiTokenSecret === undefined),
    {
      message: 'Enter both the API token ID and secret, or neither',
      path: ['apiTokenSecret'],
    },
  );
export type MuxCredentials = z.infer<typeof muxCredentialSchema>;

/**
 * Re-saving Mux credentials re-enters the signing key (it is never shown
 * back), but the token fields are optional — so an admin updating the key
 * would otherwise silently drop a stored token and switch captions off. An
 * entered token always wins; with none entered, the stored one is kept.
 */
export function mergeStoredMuxToken(
  input: MuxCredentials,
  stored: unknown,
): MuxCredentials {
  if (input.apiTokenId !== undefined) return input;
  const prev = muxCredentialSchema.safeParse(stored);
  if (!prev.success || prev.data.apiTokenId === undefined) return input;
  return {
    ...input,
    apiTokenId: prev.data.apiTokenId,
    apiTokenSecret: prev.data.apiTokenSecret,
  };
}
```

`credentialDisplay`:

```ts
  credentialDisplay(creds) {
    const { keyId, apiTokenId } = muxCredentialSchema.parse(creds);
    return apiTokenId ? { keyId, apiTokenId } : { keyId };
  },
```

Insert this into `howTo.steps` before the last step:
`'Optional, for captions: in Mux → Settings → Access Tokens, create a token with Mux Video read and write, and paste its ID and secret.'`

`src/lib/admin-schemas.ts`:

```ts
export const muxCredentialInputSchema = z.object({
  provider: z.literal('mux'),
  ...muxCredentialShape,
});
```

Import `muxCredentialShape` from `#/lib/video-providers/mux`, matching the
file's existing import style for that module. The pair rule is enforced
server-side in `validateCredentials`.

Create `src/lib/video-providers/mux-api.server.ts`:

```ts
import Mux from '@mux/mux-node';

/** Every Mux API call: a stuck request must not hold an admin save open. */
export const muxApiClient = (tokenId: string, tokenSecret: string) =>
  new Mux({ tokenId, tokenSecret, timeout: 10_000, maxRetries: 1 });

const isAuthStatus = (error: unknown): boolean => {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
};

/** `null` when the token works; otherwise the admin-facing reason. */
export async function checkMuxApiToken(
  tokenId: string,
  tokenSecret: string,
): Promise<string | null> {
  try {
    await muxApiClient(tokenId, tokenSecret).video.assets.list({ limit: 1 });
    return null;
  } catch (error) {
    return isAuthStatus(error)
      ? 'Mux rejected the API token.'
      : `Mux couldn't check the API token: ${(error as Error).message}`;
  }
}
```

In `resolve.server.ts` `validateCredentials`, replace the Mux branch with:

```ts
    if (provider === 'mux') {
      const parsed = muxCredentialSchema.safeParse(creds);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid Mux credentials' };
      }
      const { keyId, privateKey, apiTokenId, apiTokenSecret } = parsed.data;
      // Structural check: the key must sign. Full validity confirmed on play.
      await mux.jwt.signPlaybackId('validation', {
        keyId,
        keySecret: privateKey,
        expiration: '30s',
        type: 'video',
      });
      if (apiTokenId !== undefined && apiTokenSecret !== undefined) {
        const tokenError = await checkMuxApiToken(apiTokenId, apiTokenSecret);
        if (tokenError) return { ok: false, error: tokenError };
      }
      return { ok: true };
    }
```

Import `checkMuxApiToken` from `./mux-api.server`.

In `src/db/admin.ts` `saveCourseProvider`, merge before validating:

```ts
  const { provider, ...entered } = input;
  const creds =
    provider === 'mux'
      ? mergeStoredMuxToken(
          entered as MuxCredentials,
          await resolveCourseProvider(courseId, 'mux'),
        )
      : entered;
  const validation = await validateCredentials(provider, creds);
```

The rest of the function stays the same; it encrypts `creds`. Import
`mergeStoredMuxToken` and `type MuxCredentials` from
`#/lib/video-providers/mux`.

`credential-fields.ts`:
- `CredentialFormValues` gains `apiTokenId?: string;` and
  `apiTokenSecret?: string;`.
- In the `mux` branch, after `privateKey`, add:

```ts
      {
        name: 'apiTokenId',
        label: 'API access token ID (optional, for captions)',
        type: 'text',
        register: form.register('apiTokenId'),
        error: form.formState.errors.apiTokenId?.message,
      },
      {
        name: 'apiTokenSecret',
        label: 'API access token secret (optional, for captions)',
        type: 'password',
        register: form.register('apiTokenSecret'),
        error: form.formState.errors.apiTokenSecret?.message,
      },
```

`CredentialField.name` may be a typed union. If so, widen it in
`provider-credential-form.tsx` the same way the existing names are typed.

- [ ] **Step 4: Run tests and type check**

Run: `pnpm vitest run src/lib/video-providers src/lib src/db src/components/admin && pnpm tsc --noEmit`

Expected: PASS, with tsc clean. If an existing admin test builds a Mux
credential save without a stored row, the new `resolveCourseProvider`
call in `saveCourseProvider` may need its mocked `db.select` to return
`[]`. Fix that test's mock and don't weaken any assertion.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/lib/video-providers/mux.ts src/lib/video-providers/mux-api.server.ts src/lib/video-providers/resolve.server.ts src/lib/video-providers/resolve.server.test.ts src/lib/video-providers/__tests__/mux-credentials.test.ts src/lib/admin-schemas.ts src/db/admin.ts src/components/admin/lesson-config/credential-fields.ts
git add <the same files, plus any test or provider-credential-form.tsx you had to touch>
git commit -m "feat(mux): course credentials carry an optional API token for captions"
```

---

### Task 2: Pure caption helpers

**Files:**
- Create: `src/lib/video-providers/mux-captions.ts`
- Test: `src/lib/video-providers/__tests__/mux-captions.test.ts`

**Interfaces:**
- Produces, all from `#/lib/video-providers/mux-captions`:

```ts
export type MuxCaptionCode = 'en' | 'es' | 'de' | 'fr' | 'pt' | 'tr';
export type CaptionStatus = 'generating' | 'ready' | 'failed' | 'unsupported';
export interface VideoCaptionsRow {
  playbackId: string;
  assetId: string | null;
  trackId: string | null;
  languageCode: string;
  status: CaptionStatus;
  error: string | null;
  checkedAt: Date;
}
export interface MuxTrack {
  id?: string;
  type?: string;
  status?: string;
  language_code?: string;
  text_source?: string;
}
export function muxCaptionLanguage(lang: VideoLang): MuxCaptionCode | null;
export function pickCaptionTrack(tracks: readonly MuxTrack[], code: MuxCaptionCode): { trackId: string; status: 'ready' | 'generating' } | null;
export function findAudioTrackId(tracks: readonly MuxTrack[]): string | null;
export function trackOutcome(tracks: readonly MuxTrack[], trackId: string): 'ready' | 'generating' | 'failed';
export const CAPTION_REFRESH_INTERVAL_MS = 60_000;
export function shouldRefreshCaptions(row: VideoCaptionsRow, now: Date, hasToken: boolean): boolean;
export function captionsVttUrl(playbackId: string, trackId: string, token: string): string;
export const CAPTIONS_PENDING_CACHE_SECONDS = 60;
export function playbackCacheTtl(expiresInSeconds: number, captionsPending: boolean): number;
export function describeMuxError(error: unknown): string;
export function captionTrackName(lang: VideoLang): string;
/** What playback needs to know about a Mux video's captions. */
export type MuxCaptionsLookup = { status: 'ready'; trackId: string } | { status: 'pending' } | null;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  captionsVttUrl,
  captionTrackName,
  describeMuxError,
  findAudioTrackId,
  muxCaptionLanguage,
  pickCaptionTrack,
  playbackCacheTtl,
  shouldRefreshCaptions,
  trackOutcome,
  type VideoCaptionsRow,
} from '#/lib/video-providers/mux-captions';
import { labelForLang } from '#/lib/video-languages';

describe('muxCaptionLanguage', () => {
  it.each([
    ['en', 'en'], ['fr', 'fr'], ['fr-CA', 'fr'], ['es', 'es'],
    ['de', 'de'], ['pt-BR', 'pt'], ['tr', 'tr'],
  ] as const)('%s → %s', (lang, code) => {
    expect(muxCaptionLanguage(lang)).toBe(code);
  });
  it.each(['ja', 'zh', 'af', 'ar', 'hi'] as const)('%s is unsupported', (lang) => {
    expect(muxCaptionLanguage(lang)).toBeNull();
  });
});

describe('pickCaptionTrack', () => {
  const text = (o: object) => ({ type: 'text', ...o });
  it('prefers a ready track in the language, generated or uploaded', () => {
    expect(
      pickCaptionTrack(
        [
          text({ id: 'p', status: 'preparing', language_code: 'en', text_source: 'generated_vod' }),
          text({ id: 'u', status: 'ready', language_code: 'en', text_source: 'uploaded' }),
        ],
        'en',
      ),
    ).toEqual({ trackId: 'u', status: 'ready' });
  });
  it('falls back to a preparing track as generating', () => {
    expect(
      pickCaptionTrack([text({ id: 'p', status: 'preparing', language_code: 'fr' })], 'fr'),
    ).toEqual({ trackId: 'p', status: 'generating' });
  });
  it('ignores other languages, errored/deleted tracks and non-text tracks', () => {
    expect(
      pickCaptionTrack(
        [
          text({ id: 'a', status: 'ready', language_code: 'es' }),
          text({ id: 'b', status: 'errored', language_code: 'en' }),
          text({ id: 'c', status: 'deleted', language_code: 'en' }),
          { id: 'd', type: 'audio', status: 'ready', language_code: 'en' },
        ],
        'en',
      ),
    ).toBeNull();
  });
  it('matches a regional code on its base language (en-US counts as en)', () => {
    expect(
      pickCaptionTrack([text({ id: 'r', status: 'ready', language_code: 'en-US' })], 'en'),
    ).toEqual({ trackId: 'r', status: 'ready' });
  });
});

describe('findAudioTrackId', () => {
  it('returns the first ready audio track, else the first audio track', () => {
    expect(findAudioTrackId([{ id: 'v', type: 'video' }, { id: 'a', type: 'audio', status: 'ready' }])).toBe('a');
    expect(findAudioTrackId([{ id: 'v', type: 'video' }])).toBeNull();
  });
});

describe('trackOutcome', () => {
  it('maps the stored track to its current state; a vanished track has failed', () => {
    expect(trackOutcome([{ id: 't', type: 'text', status: 'ready' }], 't')).toBe('ready');
    expect(trackOutcome([{ id: 't', type: 'text', status: 'preparing' }], 't')).toBe('generating');
    expect(trackOutcome([{ id: 't', type: 'text', status: 'errored' }], 't')).toBe('failed');
    expect(trackOutcome([], 't')).toBe('failed');
  });
});

describe('shouldRefreshCaptions', () => {
  const row = (o: Partial<VideoCaptionsRow>): VideoCaptionsRow => ({
    playbackId: 'p', assetId: 'a', trackId: 't', languageCode: 'en',
    status: 'generating', error: null, checkedAt: new Date(0), ...o,
  });
  const now = new Date(60_000);
  it('refreshes a generating row last checked a minute ago when a token exists', () => {
    expect(shouldRefreshCaptions(row({}), now, true)).toBe(true);
  });
  it('never refreshes inside the interval, without a token, or when not generating', () => {
    expect(shouldRefreshCaptions(row({ checkedAt: new Date(1) }), now, true)).toBe(false);
    expect(shouldRefreshCaptions(row({}), now, false)).toBe(false);
    expect(shouldRefreshCaptions(row({ status: 'ready' }), now, true)).toBe(false);
    expect(shouldRefreshCaptions(row({ assetId: null }), now, true)).toBe(false);
  });
});

describe('captionsVttUrl', () => {
  it('is the signed text-track URL, token reused from playback', () => {
    expect(captionsVttUrl('pid', 'tid', 'jwt')).toBe(
      'https://stream.mux.com/pid/text/tid.vtt?token=jwt',
    );
  });
});

describe('playbackCacheTtl', () => {
  it('keeps the 30s safety margin under the URL expiry', () => {
    expect(playbackCacheTtl(3600, false)).toBe(3570);
    expect(playbackCacheTtl(10, false)).toBe(1);
  });
  it('caps at 60s while captions are generating, so CC appears soon after', () => {
    expect(playbackCacheTtl(3600, true)).toBe(60);
    expect(playbackCacheTtl(40, true)).toBe(10);
  });
});

describe('describeMuxError', () => {
  it('names a rejected token', () => {
    expect(describeMuxError({ status: 401, message: 'x' })).toBe('Mux rejected the API token.');
    expect(describeMuxError({ status: 403, message: 'x' })).toBe('Mux rejected the API token.');
  });
  it('explains the 7-day contract limit', () => {
    expect(
      describeMuxError({ status: 400, message: 'Assets older than 7 days cannot have subtitles generated' }),
    ).toBe('Mux only captions videos older than 7 days on request — contact Mux support.');
  });
  it('passes anything else through in words', () => {
    expect(describeMuxError(new Error('boom'))).toBe("Mux couldn't generate captions: boom");
  });
});

describe('captionTrackName', () => {
  it('labels the generated track with the language name', () => {
    expect(captionTrackName('fr')).toBe(`${labelForLang('fr')} (generated)`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/video-providers/__tests__/mux-captions.test.ts`

Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement** `src/lib/video-providers/mux-captions.ts`:

```ts
import { labelForLang, type VideoLang } from '#/lib/video-languages';

/** Languages Mux can generate captions in, of the ones lessons use. */
export type MuxCaptionCode = 'en' | 'es' | 'de' | 'fr' | 'pt' | 'tr';

export type CaptionStatus = 'generating' | 'ready' | 'failed' | 'unsupported';

/** One `video_captions` row: a Mux playback id's caption state. */
export interface VideoCaptionsRow {
  playbackId: string;
  assetId: string | null;
  trackId: string | null;
  languageCode: string;
  status: CaptionStatus;
  error: string | null;
  checkedAt: Date;
}

/** The slice of a Mux asset track this module reads. */
export interface MuxTrack {
  id?: string;
  type?: string;
  status?: string;
  language_code?: string;
  text_source?: string;
}

// Mux generates captions in the audio's language and never translates, so a
// video's caption language IS its spoken language. `null`: Mux has no model
// for it — the row records `unsupported` and Mux is never called.
const MUX_CAPTION_CODES: Record<VideoLang, MuxCaptionCode | null> = {
  en: 'en',
  fr: 'fr',
  'fr-CA': 'fr',
  es: 'es',
  de: 'de',
  'pt-BR': 'pt',
  tr: 'tr', // Mux beta
  ja: null,
  zh: null,
  af: null,
  ar: null,
  hi: null,
};

export const muxCaptionLanguage = (lang: VideoLang): MuxCaptionCode | null =>
  MUX_CAPTION_CODES[lang];

const baseLanguage = (code: string | undefined) => code?.split('-')[0];

const textTracksIn = (tracks: readonly MuxTrack[], code: MuxCaptionCode) =>
  tracks.filter(
    (t) => t.type === 'text' && t.id && baseLanguage(t.language_code) === code,
  );

/**
 * The text track to use for `code`: a ready one first (generated or uploaded
 * — an existing track is reused rather than generating a duplicate), else
 * one still preparing. Errored and deleted tracks never count.
 */
export function pickCaptionTrack(
  tracks: readonly MuxTrack[],
  code: MuxCaptionCode,
): { trackId: string; status: 'ready' | 'generating' } | null {
  const candidates = textTracksIn(tracks, code);
  const ready = candidates.find((t) => t.status === 'ready');
  if (ready?.id) return { trackId: ready.id, status: 'ready' };
  const preparing = candidates.find((t) => t.status === 'preparing');
  if (preparing?.id) return { trackId: preparing.id, status: 'generating' };
  return null;
}

/** The audio track `generate-subtitles` runs on. */
export function findAudioTrackId(tracks: readonly MuxTrack[]): string | null {
  const audio = tracks.filter((t) => t.type === 'audio' && t.id);
  return (audio.find((t) => t.status === 'ready') ?? audio[0])?.id ?? null;
}

/** Where a stored generating track is now. Vanished, errored or deleted: failed. */
export function trackOutcome(
  tracks: readonly MuxTrack[],
  trackId: string,
): 'ready' | 'generating' | 'failed' {
  const track = tracks.find((t) => t.id === trackId);
  if (track?.status === 'ready') return 'ready';
  if (track?.status === 'preparing') return 'generating';
  return 'failed';
}

export const CAPTION_REFRESH_INTERVAL_MS = 60_000;

/** Ask Mux again only for a generating row, with a token, at most once a minute. */
export function shouldRefreshCaptions(
  row: VideoCaptionsRow,
  now: Date,
  hasToken: boolean,
): boolean {
  return (
    hasToken &&
    row.status === 'generating' &&
    row.assetId !== null &&
    now.getTime() - row.checkedAt.getTime() >= CAPTION_REFRESH_INTERVAL_MS
  );
}

/** Signed playback: the text track takes the same `v`-audience token as the stream. */
export const captionsVttUrl = (
  playbackId: string,
  trackId: string,
  token: string,
): string =>
  `https://stream.mux.com/${playbackId}/text/${trackId}.vtt?token=${token}`;

export const CAPTIONS_PENDING_CACHE_SECONDS = 60;

/**
 * Learner playback cache TTL: 30s under the signed URL's expiry (a URL handed
 * out as its entry expires must still play long enough to start), and no
 * more than a minute while captions are generating — otherwise CC and the
 * debrief would wait up to an hour behind a cached `captions: null`.
 */
export function playbackCacheTtl(
  expiresInSeconds: number,
  captionsPending: boolean,
): number {
  const bySignature = Math.max(1, expiresInSeconds - 30);
  return captionsPending
    ? Math.min(bySignature, CAPTIONS_PENDING_CACHE_SECONDS)
    : bySignature;
}

/** A Mux API failure in words an admin can act on. */
export function describeMuxError(error: unknown): string {
  const { status, message } = (error ?? {}) as {
    status?: unknown;
    message?: unknown;
  };
  if (status === 401 || status === 403) return 'Mux rejected the API token.';
  const text = typeof message === 'string' ? message : String(error);
  if (/7 days/i.test(text)) {
    return 'Mux only captions videos older than 7 days on request — contact Mux support.';
  }
  return `Mux couldn't generate captions: ${text}`;
}

/** The generated track's name in Mux: "French (generated)". */
export const captionTrackName = (lang: VideoLang): string =>
  `${labelForLang(lang)} (generated)`;

/** What playback needs to know about a Mux video's captions (see `resolvePlayback`). */
export type MuxCaptionsLookup =
  | { status: 'ready'; trackId: string }
  | { status: 'pending' }
  | null;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/video-providers/__tests__/mux-captions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/lib/video-providers/mux-captions.ts src/lib/video-providers/__tests__/mux-captions.test.ts
git add src/lib/video-providers/mux-captions.ts src/lib/video-providers/__tests__/mux-captions.test.ts
git commit -m "feat(mux): pure caption helpers — language map, track choice, refresh and cache rules"
```

---

### Task 3: Captions service and the real Mux API

**Files:**
- Create: `src/lib/video-providers/mux-captions-service.ts`
- Modify: `src/lib/video-providers/mux-api.server.ts` (add the API adapter and `muxApiFromCreds`)
- Test: `src/lib/video-providers/__tests__/mux-captions-service.test.ts`

**Interfaces:**
- Consumes: everything from Task 2; `muxApiClient` and `muxCredentialSchema` from Task 1.
- Produces:

```ts
// mux-captions-service.ts
export interface CaptionsStore {
  get(playbackId: string): Promise<VideoCaptionsRow | null>;
  upsert(row: VideoCaptionsRow): Promise<void>;
}
export interface MuxCaptionsApi {
  assetIdForPlayback(playbackId: string): Promise<string>;
  assetTracks(assetId: string): Promise<MuxTrack[]>;
  generateSubtitles(assetId: string, audioTrackId: string, code: MuxCaptionCode, name: string): Promise<void>;
}
export interface CaptionsDeps { store: CaptionsStore; api: MuxCaptionsApi | null; now: () => Date }
export type RequestCaptionsResult = CaptionStatus | 'no_token';
export function requestMuxCaptions(deps: CaptionsDeps, input: { playbackId: string; lang: VideoLang }): Promise<RequestCaptionsResult>;
export function readMuxCaptions(deps: CaptionsDeps, playbackId: string): Promise<VideoCaptionsRow | null>;

// mux-api.server.ts
export function muxCaptionsApi(tokenId: string, tokenSecret: string): MuxCaptionsApi;
export function muxApiFromCreds(creds: unknown): MuxCaptionsApi | null;
```

- [ ] **Step 1: Write the failing tests**

`src/lib/video-providers/__tests__/mux-captions-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoCaptionsRow } from '#/lib/video-providers/mux-captions';
import {
  type CaptionsDeps,
  type MuxCaptionsApi,
  readMuxCaptions,
  requestMuxCaptions,
} from '#/lib/video-providers/mux-captions-service';

const NOW = new Date('2026-10-14T10:00:00Z');

function memoryStore(initial: VideoCaptionsRow[] = []) {
  const rows = new Map(initial.map((r) => [r.playbackId, r]));
  return {
    rows,
    get: vi.fn(async (id: string) => rows.get(id) ?? null),
    upsert: vi.fn(async (row: VideoCaptionsRow) => {
      rows.set(row.playbackId, row);
    }),
  };
}

function api(overrides: Partial<MuxCaptionsApi> = {}): MuxCaptionsApi {
  return {
    assetIdForPlayback: vi.fn(async () => 'asset-1'),
    assetTracks: vi.fn(async () => [
      { id: 'aud', type: 'audio', status: 'ready' },
    ]),
    generateSubtitles: vi.fn(async () => {}),
    ...overrides,
  };
}

let store: ReturnType<typeof memoryStore>;
beforeEach(() => {
  store = memoryStore();
});
const deps = (a: MuxCaptionsApi | null): CaptionsDeps => ({ store, api: a, now: () => NOW });

describe('requestMuxCaptions', () => {
  it('an unsupported language records `unsupported` and never calls Mux', async () => {
    const a = api();
    expect(await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'ja' })).toBe('unsupported');
    expect(a.assetIdForPlayback).not.toHaveBeenCalled();
    expect(a.generateSubtitles).not.toHaveBeenCalled();
    expect(store.rows.get('p')).toMatchObject({ status: 'unsupported', languageCode: 'ja' });
  });

  it('without an API token it writes nothing and says so', async () => {
    expect(await requestMuxCaptions(deps(null), { playbackId: 'p', lang: 'en' })).toBe('no_token');
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('reuses a ready text track instead of generating a duplicate', async () => {
    const a = api({
      assetTracks: vi.fn(async () => [
        { id: 'aud', type: 'audio', status: 'ready' },
        { id: 'txt', type: 'text', status: 'ready', language_code: 'en', text_source: 'uploaded' },
      ]),
    });
    expect(await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' })).toBe('ready');
    expect(a.generateSubtitles).not.toHaveBeenCalled();
    expect(store.rows.get('p')).toMatchObject({ assetId: 'asset-1', trackId: 'txt', status: 'ready' });
  });

  it('generates on the audio track in the mapped language, then records generating', async () => {
    const a = api({
      assetTracks: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'aud', type: 'audio', status: 'ready' }])
        .mockResolvedValueOnce([
          { id: 'aud', type: 'audio', status: 'ready' },
          { id: 'gen', type: 'text', status: 'preparing', language_code: 'fr', text_source: 'generated_vod' },
        ]),
    });
    expect(await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'fr-CA' })).toBe('generating');
    expect(a.generateSubtitles).toHaveBeenCalledWith(
      'asset-1',
      'aud',
      'fr',
      expect.stringMatching(/\(generated\)$/),
    );
    expect(store.rows.get('p')).toMatchObject({
      status: 'generating',
      trackId: 'gen',
      languageCode: 'fr',
      checkedAt: NOW,
    });
  });

  it('a Mux failure is recorded as `failed` with the reason in words, never thrown', async () => {
    const a = api({
      assetIdForPlayback: vi.fn(async () => {
        throw Object.assign(new Error('nope'), { status: 401 });
      }),
    });
    expect(await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' })).toBe('failed');
    expect(store.rows.get('p')).toMatchObject({
      status: 'failed',
      error: 'Mux rejected the API token.',
    });
  });

  it('an asset with no audio track fails with that reason', async () => {
    const a = api({ assetTracks: vi.fn(async () => [{ id: 'v', type: 'video' }]) });
    expect(await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' })).toBe('failed');
    expect(store.rows.get('p')?.error).toBe("Mux couldn't generate captions: the video has no audio track.");
  });
});

describe('readMuxCaptions', () => {
  const generating: VideoCaptionsRow = {
    playbackId: 'p', assetId: 'asset-1', trackId: 'gen', languageCode: 'en',
    status: 'generating', error: null, checkedAt: new Date(NOW.getTime() - 61_000),
  };

  it('no row → null, without calling Mux', async () => {
    const a = api();
    expect(await readMuxCaptions(deps(a), 'p')).toBeNull();
    expect(a.assetTracks).not.toHaveBeenCalled();
  });

  it('refreshes a stale generating row and stores the new state', async () => {
    store = memoryStore([generating]);
    const a = api({ assetTracks: vi.fn(async () => [{ id: 'gen', type: 'text', status: 'ready' }]) });
    const row = await readMuxCaptions(deps(a), 'p');
    expect(a.assetTracks).toHaveBeenCalledWith('asset-1');
    expect(row).toMatchObject({ status: 'ready', checkedAt: NOW });
    expect(store.rows.get('p')?.status).toBe('ready');
  });

  it('does not ask Mux again inside the minute', async () => {
    store = memoryStore([{ ...generating, checkedAt: new Date(NOW.getTime() - 5_000) }]);
    const a = api();
    await readMuxCaptions(deps(a), 'p');
    expect(a.assetTracks).not.toHaveBeenCalled();
  });

  it('a refresh error returns the stale row and bumps checkedAt so it is not retried at once', async () => {
    store = memoryStore([generating]);
    const a = api({ assetTracks: vi.fn(async () => { throw new Error('down'); }) });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const row = await readMuxCaptions(deps(a), 'p');
    errorLog.mockRestore();
    expect(row).toMatchObject({ status: 'generating', checkedAt: NOW });
  });

  it('a generating row that never learned its track id finds it by language', async () => {
    store = memoryStore([{ ...generating, trackId: null, languageCode: 'fr' }]);
    const a = api({
      assetTracks: vi.fn(async () => [{ id: 'late', type: 'text', status: 'ready', language_code: 'fr' }]),
    });
    expect(await readMuxCaptions(deps(a), 'p')).toMatchObject({ status: 'ready', trackId: 'late' });
  });

  it('a vanished track flips to failed with a reason', async () => {
    store = memoryStore([generating]);
    const a = api({ assetTracks: vi.fn(async () => []) });
    expect(await readMuxCaptions(deps(a), 'p')).toMatchObject({
      status: 'failed',
      error: "Mux couldn't generate captions: the caption track failed.",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/video-providers/__tests__/mux-captions-service.test.ts`

Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement** `src/lib/video-providers/mux-captions-service.ts`:

```ts
import type { VideoLang } from '#/lib/video-languages';
import {
  type CaptionStatus,
  captionTrackName,
  describeMuxError,
  findAudioTrackId,
  type MuxCaptionCode,
  type MuxTrack,
  muxCaptionLanguage,
  pickCaptionTrack,
  shouldRefreshCaptions,
  trackOutcome,
  type VideoCaptionsRow,
} from './mux-captions';

export interface CaptionsStore {
  get(playbackId: string): Promise<VideoCaptionsRow | null>;
  upsert(row: VideoCaptionsRow): Promise<void>;
}

export interface MuxCaptionsApi {
  assetIdForPlayback(playbackId: string): Promise<string>;
  assetTracks(assetId: string): Promise<MuxTrack[]>;
  generateSubtitles(
    assetId: string,
    audioTrackId: string,
    code: MuxCaptionCode,
    name: string,
  ): Promise<void>;
}

/** `api: null` — the course has no Mux API token; nothing can be generated or refreshed. */
export interface CaptionsDeps {
  store: CaptionsStore;
  api: MuxCaptionsApi | null;
  now: () => Date;
}

export type RequestCaptionsResult = CaptionStatus | 'no_token';

class CaptionsFailure extends Error {}

/**
 * Make sure Mux is captioning this video: reuse a matching text track if the
 * asset has one, otherwise ask Mux to generate one. Never throws — every
 * outcome is recorded on the row so the admin sees it and can retry.
 */
export async function requestMuxCaptions(
  { store, api, now }: CaptionsDeps,
  { playbackId, lang }: { playbackId: string; lang: VideoLang },
): Promise<RequestCaptionsResult> {
  const code = muxCaptionLanguage(lang);
  const base = {
    playbackId,
    assetId: null,
    trackId: null,
    error: null,
    checkedAt: now(),
  };
  if (code === null) {
    await store.upsert({ ...base, languageCode: lang, status: 'unsupported' });
    return 'unsupported';
  }
  if (api === null) return 'no_token';

  let assetId: string | null = null;
  try {
    assetId = await api.assetIdForPlayback(playbackId);
    const tracks = await api.assetTracks(assetId);
    const existing = pickCaptionTrack(tracks, code);
    if (existing) {
      await store.upsert({
        ...base,
        assetId,
        trackId: existing.trackId,
        languageCode: code,
        status: existing.status,
      });
      return existing.status;
    }
    const audioTrackId = findAudioTrackId(tracks);
    if (audioTrackId === null) {
      throw new CaptionsFailure('the video has no audio track.');
    }
    await api.generateSubtitles(assetId, audioTrackId, code, captionTrackName(lang));
    // Read the asset back for the new track's id — the status refresh
    // follows that track. Absent (Mux not yet listing it) is still
    // `generating`; the next request reuses whatever track appears.
    const created = pickCaptionTrack(await api.assetTracks(assetId), code);
    await store.upsert({
      ...base,
      assetId,
      trackId: created?.trackId ?? null,
      languageCode: code,
      status: 'generating',
    });
    return 'generating';
  } catch (error) {
    const message =
      error instanceof CaptionsFailure
        ? `Mux couldn't generate captions: ${error.message}`
        : describeMuxError(error);
    await store.upsert({
      ...base,
      assetId,
      languageCode: code,
      status: 'failed',
      error: message,
    });
    return 'failed';
  }
}

/**
 * The stored caption state, refreshed from Mux at most once a minute while
 * generating. Never throws: a refresh failure is logged and the stale row is
 * returned (with `checkedAt` bumped, so a Mux outage is not re-asked on
 * every playback).
 */
export async function readMuxCaptions(
  { store, api, now }: CaptionsDeps,
  playbackId: string,
): Promise<VideoCaptionsRow | null> {
  const row = await store.get(playbackId);
  if (!row) return null;
  const at = now();
  if (!api || !shouldRefreshCaptions(row, at, true)) return row;
  // shouldRefreshCaptions guarantees the asset id is set.
  const assetId = row.assetId as string;
  try {
    const tracks = await api.assetTracks(assetId);
    // A row written right after `generate-subtitles` may not know its track
    // yet (Mux had not listed it): find it by language now, or keep waiting.
    let trackId = row.trackId;
    let outcome: 'ready' | 'generating' | 'failed';
    if (trackId === null) {
      const found = pickCaptionTrack(tracks, row.languageCode as MuxCaptionCode);
      trackId = found?.trackId ?? null;
      outcome = found?.status ?? 'generating';
    } else {
      outcome = trackOutcome(tracks, trackId);
    }
    const next: VideoCaptionsRow = {
      ...row,
      trackId,
      status: outcome,
      error:
        outcome === 'failed'
          ? "Mux couldn't generate captions: the caption track failed."
          : null,
      checkedAt: at,
    };
    await store.upsert(next);
    return next;
  } catch (error) {
    console.error(`Mux captions refresh failed for ${playbackId}:`, error);
    const next = { ...row, checkedAt: at };
    try {
      await store.upsert(next);
    } catch {
      // The stale row is still the right answer for this read.
    }
    return next;
  }
}
```

In `mux-api.server.ts`, add:

```ts
import type { MuxCaptionCode } from './mux-captions';
import type { MuxCaptionsApi } from './mux-captions-service';
import { muxCredentialSchema } from './mux';

/** The real Mux API behind the captions service. */
export function muxCaptionsApi(
  tokenId: string,
  tokenSecret: string,
): MuxCaptionsApi {
  const client = muxApiClient(tokenId, tokenSecret);
  return {
    async assetIdForPlayback(playbackId) {
      const { object } = await client.video.playbackIds.retrieve(playbackId);
      if (object.type !== 'asset') {
        throw new Error('this playback id is a live stream, not a video.');
      }
      return object.id;
    },
    async assetTracks(assetId) {
      const asset = await client.video.assets.retrieve(assetId);
      return asset.tracks ?? [];
    },
    async generateSubtitles(assetId, audioTrackId, code: MuxCaptionCode, name) {
      await client.video.assets.generateSubtitles(assetId, audioTrackId, {
        generated_subtitles: [{ language_code: code, name }],
      });
    },
  };
}

/** The captions API for a course's stored Mux credentials, or `null` with no API token. */
export function muxApiFromCreds(creds: unknown): MuxCaptionsApi | null {
  const parsed = muxCredentialSchema.safeParse(creds);
  if (!parsed.success) return null;
  const { apiTokenId, apiTokenSecret } = parsed.data;
  return apiTokenId && apiTokenSecret
    ? muxCaptionsApi(apiTokenId, apiTokenSecret)
    : null;
}
```

(`muxCaptionsApi` is a thin adapter, verified by type checking and the
browser walkthrough. The service tests carry the logic.)

- [ ] **Step 4: Run tests and type check**

Run: `pnpm vitest run src/lib/video-providers && pnpm tsc --noEmit`

Expected: PASS, with tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/lib/video-providers/mux-captions-service.ts src/lib/video-providers/mux-api.server.ts src/lib/video-providers/__tests__/mux-captions-service.test.ts
git add src/lib/video-providers/mux-captions-service.ts src/lib/video-providers/mux-api.server.ts src/lib/video-providers/__tests__/mux-captions-service.test.ts
git commit -m "feat(mux): captions service — request or reuse a track, throttled status refresh"
```

---

### Task 4: `video_captions` table, migration and DB wiring

**Files:**
- Modify: `src/db/schema.ts`, `package.json` (one script line)
- Create: `src/db/migrate-video-captions.ts`, `src/db/video-captions.ts`
- Test: `src/db/__tests__/video-captions.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3; `resolveCourseProvider` (`#/db/admin`); `getCourseIdsForLesson` (`#/db/placements`); `selectVideoForLang`; `OtherVideoIdsSchema`.
- Produces (`#/db/video-captions`):

```ts
export const captionsStore: CaptionsStore;
export function findCaptionsApi(lessonId: number): Promise<MuxCaptionsApi | null>;
export function getCaptionsTarget(lessonId: number, lang: VideoLang): Promise<{ provider: ProviderId; ref: string; lang: VideoLang } | null>;
export function requestLessonCaptions(input: { lessonId: number; playbackId: string; lang: VideoLang }): Promise<RequestCaptionsResult>;
export function requestLessonCaptionsSafely(input: { lessonId: number; playbackId: string; lang: VideoLang }): Promise<void>;
// MuxCaptionsLookup is imported from '#/lib/video-providers/mux-captions' (Task 2)
export function muxCaptionsForPlayback(playbackId: string, creds: unknown): Promise<MuxCaptionsLookup>;
export type LessonCaptionsStatus = CaptionStatus | 'none' | 'no_token' | 'not_mux';
export function getLessonCaptionsStatus(lessonId: number, lang: VideoLang): Promise<{ status: LessonCaptionsStatus; error: string | null; lang: VideoLang } | null>;
```

- [ ] **Step 1: Write the failing tests**

`src/db/__tests__/video-captions.test.ts` (node). Stub every internal
module, following the "fully stub" pattern:
- `#/db` with a `db` whose `select().from().where()` returns a
  `vi.hoisted` lesson row list;
- `#/db/schema` with real `pgTable` objects for `lessons` and
  `video_captions`, rebuilt like
  `src/db/__tests__/admin-course-cache-invalidation.test.ts` does;
- `#/db/admin` (`resolveCourseProvider`);
- `#/db/placements` (`getCourseIdsForLesson`);
- `#/lib/video-providers/mux-api.server` (`muxApiFromCreds`);
- `#/lib/video-providers/mux-captions-service` (`requestMuxCaptions`,
  `readMuxCaptions`).

Then test:

```ts
describe('findCaptionsApi', () => {
  it('uses the first course placing the lesson whose Mux credentials have a token', async () => {
    getCourseIdsForLesson.mockResolvedValue([3, 7]);
    resolveCourseProvider.mockImplementation(async (courseId: number) =>
      courseId === 7 ? { keyId: 'k', privateKey: 'p', apiTokenId: 't', apiTokenSecret: 's' } : { keyId: 'k', privateKey: 'p' },
    );
    muxApiFromCreds.mockImplementation((c: { apiTokenId?: string }) => (c?.apiTokenId ? API : null));
    expect(await findCaptionsApi(10)).toBe(API);
    expect(resolveCourseProvider).toHaveBeenCalledWith(7, 'mux');
  });
  it('null when no course has a token, or the lesson is in no course', async () => {
    getCourseIdsForLesson.mockResolvedValue([]);
    expect(await findCaptionsApi(10)).toBeNull();
  });
});

describe('requestLessonCaptionsSafely', () => {
  it('never throws — a captions failure must not fail the video save', async () => {
    getCourseIdsForLesson.mockRejectedValue(new Error('db down'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      requestLessonCaptionsSafely({ lessonId: 10, playbackId: 'p', lang: 'en' }),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe('muxCaptionsForPlayback', () => {
  it('maps a ready row to its track, generating to pending, anything else to null', async () => {
    muxApiFromCreds.mockReturnValue(null);
    readMuxCaptions.mockResolvedValueOnce({ status: 'ready', trackId: 'trk' });
    expect(await muxCaptionsForPlayback('p', {})).toEqual({ status: 'ready', trackId: 'trk' });
    readMuxCaptions.mockResolvedValueOnce({ status: 'generating', trackId: null });
    expect(await muxCaptionsForPlayback('p', {})).toEqual({ status: 'pending' });
    readMuxCaptions.mockResolvedValueOnce({ status: 'failed', trackId: null });
    expect(await muxCaptionsForPlayback('p', {})).toBeNull();
    readMuxCaptions.mockResolvedValueOnce(null);
    expect(await muxCaptionsForPlayback('p', {})).toBeNull();
  });
  it('hands the read the serving course credentials API (for the refresh)', async () => {
    muxApiFromCreds.mockReturnValue(API);
    readMuxCaptions.mockResolvedValueOnce(null);
    await muxCaptionsForPlayback('p', { creds: 1 });
    expect(muxApiFromCreds).toHaveBeenCalledWith({ creds: 1 });
    expect(readMuxCaptions.mock.calls.at(-1)?.[0]).toMatchObject({ api: API });
  });
});

describe('getLessonCaptionsStatus', () => {
  it("is `not_mux` when the selected video is not on Mux", async () => {
    lessonRows.value = [{ videoProvider: 'synthesia', videoRef: 's1', otherVideoIds: [] }];
    expect(await getLessonCaptionsStatus(10, 'en')).toMatchObject({ status: 'not_mux', lang: 'en' });
  });
  it('is `no_token` when there is no row and no course has a token', async () => {
    lessonRows.value = [{ videoProvider: 'mux', videoRef: 'm1', otherVideoIds: [] }];
    readMuxCaptions.mockResolvedValueOnce(null);
    getCourseIdsForLesson.mockResolvedValue([]);
    expect(await getLessonCaptionsStatus(10, 'en')).toMatchObject({ status: 'no_token' });
  });
  it('is `none` with a token but no row, and reports the row status otherwise', async () => {
    lessonRows.value = [{ videoProvider: 'mux', videoRef: 'm1', otherVideoIds: [{ lang: 'fr', provider: 'mux', ref: 'm2' }] }];
    getCourseIdsForLesson.mockResolvedValue([3]);
    resolveCourseProvider.mockResolvedValue({ apiTokenId: 't' });
    muxApiFromCreds.mockReturnValue(API);
    readMuxCaptions.mockResolvedValueOnce(null);
    expect(await getLessonCaptionsStatus(10, 'en')).toMatchObject({ status: 'none' });
    readMuxCaptions.mockResolvedValueOnce({ status: 'failed', error: 'why' });
    expect(await getLessonCaptionsStatus(10, 'fr')).toEqual({ status: 'failed', error: 'why', lang: 'fr' });
    expect(readMuxCaptions.mock.calls.at(-1)?.[1]).toBe('m2');
  });
  it('null for an unknown lesson or one with no video', async () => {
    lessonRows.value = [];
    expect(await getLessonCaptionsStatus(10, 'en')).toBeNull();
  });
});
```

Use `const API = { assetIdForPlayback: vi.fn(), assetTracks: vi.fn(), generateSubtitles: vi.fn() };`
and a hoisted `lessonRows = { value: [] }` that the stubbed `db` returns.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/db/__tests__/video-captions.test.ts`

Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement**

In `src/db/schema.ts`, add the table next to `courseVideoProvidersTable`:

```ts
/**
 * Mux caption state per PLAYBACK id (not per lesson: one Mux video can sit
 * under several lessons and courses). See `src/db/video-captions.ts`.
 */
export const videoCaptionsTable = pgTable('video_captions', {
  playbackId: text('playback_id').primaryKey(),
  assetId: text('asset_id'),
  trackId: text('track_id'),
  languageCode: text('language_code').notNull(),
  status: text('status').notNull(), // 'generating' | 'ready' | 'failed' | 'unsupported'
  error: text('error'),
  checkedAt: timestamp('checked_at', { mode: 'date', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});
```

`src/db/migrate-video-captions.ts`:

```ts
/**
 * Idempotent migration for `video_captions`.
 *
 * Hand-written rather than generated, for the reason migrate-offerings.ts
 * gives: `drizzle-kit push` diffs the whole schema and offers to truncate
 * `docs` over unrelated drift. Every statement here is safe to re-run.
 *
 * Run: pnpm db:migrate-video-captions
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main(): Promise<void> {
  console.info('Creating video_captions…');
  await db.execute(sql`
    create table if not exists "video_captions" (
      "playback_id"   text primary key,
      "asset_id"      text,
      "track_id"      text,
      "language_code" text not null,
      "status"        text not null,
      "error"         text,
      "checked_at"    timestamp with time zone not null,
      "updated_at"    timestamp with time zone not null default CURRENT_TIMESTAMP,
      constraint "video_captions_status_check"
        check ("status" in ('generating', 'ready', 'failed', 'unsupported'))
    );
  `);
  console.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

`package.json`, next to the other `db:migrate-*` lines:
`"db:migrate-video-captions": "dotenv -e .env.local -- tsx src/db/migrate-video-captions.ts",`

`src/db/video-captions.ts`:

```ts
import { eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import { resolveCourseProvider } from '#/db/admin';
import { getCourseIdsForLesson } from '#/db/placements';
import { lessonsTable, videoCaptionsTable } from '#/db/schema';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';
import { muxApiFromCreds } from '#/lib/video-providers/mux-api.server';
import type {
  CaptionStatus,
  MuxCaptionsLookup,
  VideoCaptionsRow,
} from '#/lib/video-providers/mux-captions';
import {
  type CaptionsStore,
  type MuxCaptionsApi,
  type RequestCaptionsResult,
  readMuxCaptions,
  requestMuxCaptions,
} from '#/lib/video-providers/mux-captions-service';
import { selectVideoForLang } from '#/lib/video-providers/select-video-for-lang';
import type { ProviderId } from '#/lib/video-providers/types';
import { OtherVideoIdsSchema } from '#/types';

export const captionsStore: CaptionsStore = {
  async get(playbackId) {
    const [row] = await db
      .select()
      .from(videoCaptionsTable)
      .where(eq(videoCaptionsTable.playbackId, playbackId));
    return row
      ? { ...row, status: row.status as CaptionStatus }
      : null;
  },
  async upsert(row: VideoCaptionsRow) {
    const { playbackId, ...rest } = row;
    await db
      .insert(videoCaptionsTable)
      .values(row)
      .onConflictDoUpdate({
        target: videoCaptionsTable.playbackId,
        set: { ...rest, updatedAt: sql`now()` },
      });
  },
};

/**
 * The Mux API to caption a lesson's videos with: through the first course
 * placing the lesson whose Mux credentials carry an API token. Video is
 * lesson content (saved without a course in hand), and every course points
 * at the same Mux environment, so any token-bearing course will do.
 */
export async function findCaptionsApi(
  lessonId: number,
): Promise<MuxCaptionsApi | null> {
  for (const courseId of await getCourseIdsForLesson(lessonId)) {
    const api = muxApiFromCreds(await resolveCourseProvider(courseId, 'mux'));
    if (api) return api;
  }
  return null;
}

/** Which video a lesson plays for `lang` — the same rule as playback. */
export async function getCaptionsTarget(
  lessonId: number,
  lang: VideoLang,
): Promise<{ provider: ProviderId; ref: string; lang: VideoLang } | null> {
  const [lesson] = await db
    .select({
      provider: lessonsTable.videoProvider,
      ref: lessonsTable.videoRef,
      otherVideoIds: lessonsTable.otherVideoIds,
    })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId));
  if (!lesson?.provider || !lesson.ref) return null;
  const alternates = OtherVideoIdsSchema.safeParse(lesson.otherVideoIds);
  const selection = selectVideoForLang({
    primary: { provider: lesson.provider as ProviderId, ref: lesson.ref },
    alternates: alternates.success ? alternates.data : [],
    requested: lang,
  });
  return { provider: selection.provider, ref: selection.ref, lang: selection.lang };
}

export async function requestLessonCaptions({
  lessonId,
  playbackId,
  lang,
}: {
  lessonId: number;
  playbackId: string;
  lang: VideoLang;
}): Promise<RequestCaptionsResult> {
  return requestMuxCaptions(
    { store: captionsStore, api: await findCaptionsApi(lessonId), now: () => new Date() },
    { playbackId, lang },
  );
}

/** For save routes: captions must never fail the save that triggered them. */
export async function requestLessonCaptionsSafely(input: {
  lessonId: number;
  playbackId: string;
  lang: VideoLang;
}): Promise<void> {
  try {
    await requestLessonCaptions(input);
  } catch (error) {
    console.error(`Mux captions request failed for lesson ${input.lessonId}:`, error);
  }
}

/**
 * Playback's view of a Mux video's captions, refreshing through the SERVING
 * course's token when it has one. Injected into `resolvePlayback`.
 */
export async function muxCaptionsForPlayback(
  playbackId: string,
  creds: unknown,
): Promise<MuxCaptionsLookup> {
  const row = await readMuxCaptions(
    { store: captionsStore, api: muxApiFromCreds(creds), now: () => new Date() },
    playbackId,
  );
  if (row?.status === 'ready' && row.trackId) {
    return { status: 'ready', trackId: row.trackId };
  }
  if (row?.status === 'generating') return { status: 'pending' };
  return null;
}

export type LessonCaptionsStatus = CaptionStatus | 'none' | 'no_token' | 'not_mux';

/** The admin captions line's data. `null`: no such lesson, or no video. */
export async function getLessonCaptionsStatus(
  lessonId: number,
  lang: VideoLang,
): Promise<{ status: LessonCaptionsStatus; error: string | null; lang: VideoLang } | null> {
  const target = await getCaptionsTarget(lessonId, lang);
  if (!target) return null;
  if (target.provider !== 'mux') {
    return { status: 'not_mux', error: null, lang: target.lang };
  }
  const api = await findCaptionsApi(lessonId);
  const row = await readMuxCaptions(
    { store: captionsStore, api, now: () => new Date() },
    target.ref,
  );
  if (row) return { status: row.status, error: row.error, lang: target.lang };
  return { status: api ? 'none' : 'no_token', error: null, lang: target.lang };
}
```

`PRIMARY_VIDEO_LANG` is used by Task 6's save route. If it's unused here,
drop the import.

- [ ] **Step 4: Run tests and type check**

Run: `pnpm vitest run src/db && pnpm tsc --noEmit`

Expected: PASS, with tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/db/schema.ts src/db/migrate-video-captions.ts src/db/video-captions.ts src/db/__tests__/video-captions.test.ts package.json
git add src/db/schema.ts src/db/migrate-video-captions.ts src/db/video-captions.ts src/db/__tests__/video-captions.test.ts package.json
git commit -m "feat(db): video_captions table, migration, and lesson captions wiring"
```

---

### Task 5: Playback serves Mux captions; cache and debrief

**Files:**
- Modify:
  - `src/lib/video-providers/resolve.server.ts` (`Playback`, `resolvePlayback`)
  - `src/db/resolve-lesson-video.ts`
  - `src/db/lesson-playback.ts` (the cache write)
  - `src/db/lesson-transcript.ts` (comment)
  - `src/components/lesson-material/compute-transcript-debrief.ts` (comment)
- Test:
  - `src/lib/video-providers/resolve.server.test.ts`
  - `src/db/__tests__/lesson-playback.test.ts`

**Interfaces:**
- Consumes:
  - `captionsVttUrl` and `playbackCacheTtl` (Task 2);
  - `muxCaptionsForPlayback` (Task 4) and `MuxCaptionsLookup` (Task 2).
- Produces:
  - `Playback.captionsPending?: true`, set only on a Mux result whose
    captions are generating;
  - `resolvePlayback(provider, ref, creds, options?: { muxCaptions?: (playbackId: string, creds: unknown) => Promise<MuxCaptionsLookup> })`.

- [ ] **Step 1: Write the failing tests**

In `resolve.server.test.ts` (Mux branch, using its existing signer stub):

```ts
describe('resolvePlayback — Mux captions', () => {
  it('a ready track becomes the signed VTT URL, with the same token as the stream', async () => {
    const muxCaptions = vi.fn(async () => ({ status: 'ready' as const, trackId: 'trk' }));
    const r = await resolvePlayback('mux', 'pid', MUX_CREDS, { muxCaptions });
    expect(muxCaptions).toHaveBeenCalledWith('pid', MUX_CREDS);
    if (r.status !== 'ready') throw new Error('expected ready');
    const token = new URL(r.url).searchParams.get('token');
    expect(r.captions).toEqual({ vtt: `https://stream.mux.com/pid/text/trk.vtt?token=${token}` });
    expect(r.captionsPending).toBeUndefined();
  });

  it('generating → no captions yet, flagged pending for the cache', async () => {
    const r = await resolvePlayback('mux', 'pid', MUX_CREDS, {
      muxCaptions: async () => ({ status: 'pending' as const }),
    });
    expect(r).toMatchObject({ status: 'ready', captions: null, captionsPending: true });
  });

  it('a captions lookup that throws never takes playback down', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await resolvePlayback('mux', 'pid', MUX_CREDS, {
      muxCaptions: async () => { throw new Error('db down'); },
    });
    errorLog.mockRestore();
    expect(r).toMatchObject({ status: 'ready', captions: null });
  });
});
```

Here `MUX_CREDS` is the file's existing valid Mux credentials fixture.

In `src/db/__tests__/lesson-playback.test.ts`:
- Follow its existing mocks for `redis` and the resolver.
- Add a test: when the resolved result is
  `{ status: 'ready', expiresInSeconds: 3600, captionsPending: true, … }`,
  `redis.set` is called with `{ ex: 60 }`.
- Add a test: with no `captionsPending`, the call is `{ ex: 3570 }`.

If the file stubs `resolveSelectedLessonVideo`, make the stub return
these results.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/video-providers/resolve.server.test.ts src/db/__tests__/lesson-playback.test.ts`

Expected: FAIL. There's no fourth parameter, `captions` is null, and `ex`
is 3570.

- [ ] **Step 3: Implement**

`resolve.server.ts`:
- Add to `Playback`:
  ```ts
  /**
   * Set (to `true`) only on a Mux result whose captions are still being
   * generated, so the learner cache can expire within a minute and pick
   * them up — see `playbackCacheTtl`. Absent otherwise.
   */
  captionsPending?: true;
  ```
- Import `captionsVttUrl` and `type MuxCaptionsLookup` from
  `./mux-captions`. Keep `lib/` free of `#/db` imports, even type-only.
- Signature:
  ```ts
  export async function resolvePlayback(
    provider: ProviderId,
    ref: string,
    creds: unknown,
    options: {
      muxCaptions?: (playbackId: string, creds: unknown) => Promise<MuxCaptionsLookup>;
    } = {},
  ): Promise<PlaybackResult> {
  ```
- In the Mux branch, before `return`:
  ```ts
    // Captions are best-effort: a lookup failure (DB, Mux) must never take
    // the video itself down — it plays uncaptioned and CC states why.
    let captionsLookup: MuxCaptionsLookup = null;
    if (options.muxCaptions) {
      try {
        captionsLookup = await options.muxCaptions(ref, creds);
      } catch (error) {
        console.error(`Mux captions lookup failed for ${ref}:`, error);
      }
    }
  ```
  and in the returned object, replace the `captions: null` line and its
  comment with:
  ```ts
      // Mux auto-generated captions (see `#/db/video-captions`). Signed
      // playback: the text track takes the same video token as the stream.
      captions:
        captionsLookup?.status === 'ready'
          ? { vtt: captionsVttUrl(ref, captionsLookup.trackId, token) }
          : null,
      ...(captionsLookup?.status === 'pending'
        ? { captionsPending: true as const }
        : {}),
  ```
- Update the comment that names `VideoPreview`'s `onForbidden`. Since
  PR #30 that refusal reaches admin through the player's
  `onPlaybackFailed`; say so.

`src/db/resolve-lesson-video.ts`: pass the lookup.

```ts
  const playback = await resolvePlayback(
    selection.provider,
    selection.ref,
    creds,
    { muxCaptions: muxCaptionsForPlayback },
  );
```

Import `muxCaptionsForPlayback` from `#/db/video-captions`. Existing tests
that load `resolve-lesson-video.ts` with stubbed `#/db`/`#/db/schema`
(e.g. `src/db/__tests__/admin-course-cache-invalidation.test.ts`,
`src/db/__tests__/lesson-playback.test.ts`) may now need
`vi.mock('#/db/video-captions', () => ({ muxCaptionsForPlayback: vi.fn(async () => null) }))`.
Add exactly that where a file fails to load. Then assert, in the
admin resolver test that already checks `resolvePlayback`'s arguments,
that the 4th argument is `{ muxCaptions: muxCaptionsForPlayback }`.
That is the consumer-side proof that the wiring is live.

`src/db/lesson-playback.ts`: replace

```ts
      const ex = Math.max(1, result.expiresInSeconds - 30);
```

with

```ts
      const ex = playbackCacheTtl(
        result.expiresInSeconds,
        result.captionsPending === true,
      );
```

Import `playbackCacheTtl` from `#/lib/video-providers/mux-captions`. Add
one line to the big comment above `getLessonPlayback`: "…and at most 60s
while Mux captions are generating (`playbackCacheTtl`)."

Comment fixes, no behaviour change:
- `src/db/lesson-transcript.ts`: change "Mux videos carry no text track
  on this account" to "a Mux video has a transcript once its
  auto-generated captions are ready (`#/db/video-captions`)".
- `src/components/lesson-material/compute-transcript-debrief.ts`: the
  same correction where it says Mux returns `captions: null` on this
  account.

- [ ] **Step 4: Run tests and type check**

Run: `pnpm vitest run src/lib/video-providers src/db src/routes/api src/components/lesson-material src/components/lesson-main && pnpm tsc --noEmit`

Expected: PASS, with tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write <each changed file>
git add <each changed file>
git commit -m "feat(playback): Mux playback carries auto-generated captions; learner cache waits at most a minute"
```

---

### Task 6: Triggers: save routes, admin captions route, backfill

**Files:**
- Modify:
  - `src/routes/api/admin/lessons.$lessonId.video.ts`
  - `src/routes/api/admin/lessons.$lessonId.alternate-videos.ts`
  - `package.json`
- Create:
  - `src/routes/api/admin/lessons.$lessonId.captions.ts`
  - `scripts/backfill-mux-captions.ts`
- Test:
  - `src/routes/api/admin/__tests__/lesson-video-route.test.ts`
  - `src/routes/api/admin/__tests__/lesson-alternate-videos-route.test.ts`
  - `src/routes/api/admin/__tests__/lesson-captions-route.test.ts` (create)

**Interfaces:**
- Consumes (`#/db/video-captions`):
  - `requestLessonCaptionsSafely`
  - `requestLessonCaptions`
  - `getLessonCaptionsStatus`
  - `getCaptionsTarget`
  - `captionsStore`
  - `findCaptionsApi`
- Produces: the route
  `GET|POST /api/admin/lessons/$lessonId/captions?courseId=&lang=`.
  - GET returns `{ status, error, lang }`.
  - POST returns `{ status }`, or 409 for a video not on Mux.

- [ ] **Step 1: Write the failing tests**

In `lesson-video-route.test.ts`:
- Add `vi.mock('#/db/video-captions', () => ({ requestLessonCaptionsSafely }))`,
  with `requestLessonCaptionsSafely` as a `vi.hoisted` `vi.fn(async () => {})`.
- Add:

```ts
  it('a Mux video save requests captions for the new playback id, in English', async () => {
    setLessonVideo.mockResolvedValue(true);
    const res = await putVideoHandler(jsonRequest({ provider: 'mux', ref: 'newpid' }), '10');
    expect(res.status).toBe(200);
    expect(requestLessonCaptionsSafely).toHaveBeenCalledWith({ lessonId: 10, playbackId: 'newpid', lang: 'en' });
  });

  it('a Synthesia save requests no Mux captions', async () => {
    setLessonVideo.mockResolvedValue(true);
    await putVideoHandler(jsonRequest({ provider: 'synthesia', ref: 's1' }), '10');
    expect(requestLessonCaptionsSafely).not.toHaveBeenCalled();
  });

  it('a captions failure never fails the save', async () => {
    setLessonVideo.mockResolvedValue(true);
    requestLessonCaptionsSafely.mockRejectedValueOnce(new Error('should be swallowed upstream'));
    const res = await putVideoHandler(jsonRequest({ provider: 'mux', ref: 'p' }), '10');
    expect(res.status).toBe(200);
  });
```

`jsonRequest` means the file's existing request helper; use whatever it
already has. The third test proves the route doesn't depend on the
helper's own try/catch. The route wraps the call too.

In `lesson-alternate-videos-route.test.ts`, add the same mock and:
- a Mux alternate PUT calls it with `{ lessonId: 10, playbackId: <ref>, lang: 'fr' }`;
- a Synthesia alternate doesn't call it;
- a rejected call still returns 200.

`lesson-captions-route.test.ts` (node). Mock these, following the
`lesson-video-playback.test.ts` setup:
- `#/db/placements` (`getCourseIdsForLesson`);
- `#/lib/permissions.server` (`requireCoursePermission`, `absentResourceResponse`);
- `#/lib/admin-functions.server` (`ForbiddenError`);
- `#/db/video-captions` (`getLessonCaptionsStatus`, `getCaptionsTarget`,
  `requestLessonCaptions`).

Tests:
- GET with no `courseId` → 400.
- A lesson not placed in the course → the `absentResourceResponse` answer.
- A forbidden user → 403, and `requireCoursePermission` was called with
  `(headers, 42, 'content', 'read')`.
- GET `?courseId=42&lang=fr` → 200, body equals what
  `getLessonCaptionsStatus(1, 'fr')` returned, and it was called with
  `(1, 'fr')`.
- GET `?lang=xx` → `getLessonCaptionsStatus` called with `'en'`.
- GET when `getLessonCaptionsStatus` returns `null` → 404.
- POST → `requireCoursePermission` called with
  `(headers, 42, 'content', 'update')`.
- POST on a Mux target → `requestLessonCaptions` called with
  `{ lessonId: 1, playbackId: 'm2', lang: 'fr' }`, and 200 `{ status: 'generating' }`.
- POST on a Synthesia target → 409 with body
  `{ error: 'Captions come from the provider for this video.' }`.
- POST with no video (`getCaptionsTarget` returns `null`) → 404.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/routes/api/admin`

Expected: FAIL. The captions route module is missing, and the save
routes never call captions.

- [ ] **Step 3: Implement**

`lessons.$lessonId.video.ts`, in `putVideoHandler` after
`if (!updated) …`:

```ts
  // Auto-captions for a Mux video. Awaited (a serverless response may end
  // the work) but never allowed to fail the save — the outcome is stored on
  // `video_captions` and shown, with Retry, in the video section.
  if (parsed.data.provider === 'mux') {
    try {
      await requestLessonCaptionsSafely({
        lessonId,
        playbackId: parsed.data.ref,
        lang: PRIMARY_VIDEO_LANG,
      });
    } catch (error) {
      console.error('Captions request failed after a video save:', error);
    }
  }
```

The alternate route's `putAlternateVideoHandler` gets the same block,
with `lang: parsed.data.lang`. Imports: `requestLessonCaptionsSafely`
from `#/db/video-captions`; `PRIMARY_VIDEO_LANG` from
`#/lib/video-languages`.

`src/routes/api/admin/lessons.$lessonId.captions.ts`:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getCourseIdsForLesson } from '#/db/placements';
import {
  getCaptionsTarget,
  getLessonCaptionsStatus,
  requestLessonCaptions,
} from '#/db/video-captions';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  absentResourceResponse,
  requireCoursePermission,
} from '#/lib/permissions.server';
import { isVideoLang, PRIMARY_VIDEO_LANG } from '#/lib/video-languages';

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Shared front half of GET and POST: ids, language, placement, guard. The
 * course is named by the client (the editor knows which course it shows) —
 * same reasoning and same 404-before-403 ordering as `video-playback`.
 */
async function authorize(
  request: Request,
  rawLessonId: string,
  action: 'read' | 'update',
): Promise<
  | { ok: true; lessonId: number; lang: ReturnType<typeof langFrom> }
  | { ok: false; response: Response }
> {
  const lessonId = parsePositiveInt(rawLessonId);
  if (lessonId === null) {
    return { ok: false, response: Response.json({ error: 'Invalid lesson id' }, { status: 400 }) };
  }
  const { searchParams } = new URL(request.url);
  const courseId = parsePositiveInt(searchParams.get('courseId'));
  if (courseId === null) {
    return { ok: false, response: Response.json({ error: 'A valid courseId is required' }, { status: 400 }) };
  }
  const placedIn = await getCourseIdsForLesson(lessonId);
  if (!placedIn.includes(courseId)) {
    return { ok: false, response: await absentResourceResponse(request.headers, 'Lesson not found') };
  }
  try {
    await requireCoursePermission(request.headers, courseId, 'content', action);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, response: new Response('Forbidden', { status: 403 }) };
    }
    throw error;
  }
  return { ok: true, lessonId, lang: langFrom(searchParams.get('lang')) };
}

const langFrom = (raw: string | null) =>
  isVideoLang(raw) ? raw : PRIMARY_VIDEO_LANG;

export async function getCaptionsHandler(request: Request, rawLessonId: string): Promise<Response> {
  const auth = await authorize(request, rawLessonId, 'read');
  if (!auth.ok) return auth.response;
  const status = await getLessonCaptionsStatus(auth.lessonId, auth.lang);
  if (!status) return new Response('Not found', { status: 404 });
  return Response.json(status);
}

export async function postCaptionsHandler(request: Request, rawLessonId: string): Promise<Response> {
  const auth = await authorize(request, rawLessonId, 'update');
  if (!auth.ok) return auth.response;
  const target = await getCaptionsTarget(auth.lessonId, auth.lang);
  if (!target) return new Response('Not found', { status: 404 });
  if (target.provider !== 'mux') {
    return Response.json(
      { error: 'Captions come from the provider for this video.' },
      { status: 409 },
    );
  }
  const status = await requestLessonCaptions({
    lessonId: auth.lessonId,
    playbackId: target.ref,
    lang: target.lang,
  });
  return Response.json({ status });
}

export const Route = createFileRoute('/api/admin/lessons/$lessonId/captions')({
  server: {
    handlers: {
      GET: ({ request, params }) => getCaptionsHandler(request, params.lessonId),
      POST: ({ request, params }) => postCaptionsHandler(request, params.lessonId),
    },
  },
});
```

`absentResourceResponse` may return either a `Response` or a
`Promise<Response>`. Check its signature in `#/lib/permissions.server`
and drop the `await` if it's synchronous.

The dev server's watcher regenerates `src/routeTree.gen.ts` for the new
route. Commit that regenerated file **only** if `git diff` shows nothing
but this route's additions. If it also bakes in other untracked routes,
see memory "routeTree watcher trap": leave it unstaged, and say so in the
report. tsc must pass either way, so run `pnpm tsr generate` or the
project's equivalent if the route types are missing.

`scripts/backfill-mux-captions.ts`:

```ts
/**
 * Request Mux auto-captions for every lesson video already on Mux.
 * Idempotent: playback ids that already have a `video_captions` row are
 * skipped, so it is safe to re-run (e.g. after adding a token to a course).
 *
 * Run: pnpm db:backfill-mux-captions
 */
import { isNotNull } from 'drizzle-orm';
import { db } from '#/db';
import { lessonsTable } from '#/db/schema';
import {
  captionsStore,
  findCaptionsApi,
  requestLessonCaptions,
} from '#/db/video-captions';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';
import { OtherVideoIdsSchema } from '#/types';

async function main(): Promise<void> {
  const lessons = await db
    .select({
      id: lessonsTable.id,
      provider: lessonsTable.videoProvider,
      ref: lessonsTable.videoRef,
      otherVideoIds: lessonsTable.otherVideoIds,
    })
    .from(lessonsTable)
    .where(isNotNull(lessonsTable.videoRef));

  const counts = { requested: 0, ready: 0, unsupported: 0, failed: 0, noToken: 0, skipped: 0 };
  for (const lesson of lessons) {
    const targets: { ref: string; lang: VideoLang }[] = [];
    if (lesson.provider === 'mux' && lesson.ref) {
      targets.push({ ref: lesson.ref, lang: PRIMARY_VIDEO_LANG });
    }
    const alternates = OtherVideoIdsSchema.safeParse(lesson.otherVideoIds);
    for (const alt of alternates.success ? alternates.data : []) {
      if (alt.provider === 'mux') targets.push({ ref: alt.ref, lang: alt.lang });
    }
    if (targets.length === 0) continue;
    if (!(await findCaptionsApi(lesson.id))) {
      counts.noToken += targets.length;
      continue;
    }
    for (const { ref, lang } of targets) {
      if (await captionsStore.get(ref)) {
        counts.skipped += 1;
        continue;
      }
      const outcome = await requestLessonCaptions({ lessonId: lesson.id, playbackId: ref, lang });
      if (outcome === 'generating') counts.requested += 1;
      else if (outcome === 'ready') counts.ready += 1;
      else if (outcome === 'unsupported') counts.unsupported += 1;
      else if (outcome === 'no_token') counts.noToken += 1;
      else counts.failed += 1;
    }
  }
  console.info('Mux captions backfill:', counts);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

Add to `package.json`:
`"db:backfill-mux-captions": "dotenv -e .env.local -- tsx scripts/backfill-mux-captions.ts",`

- [ ] **Step 4: Run tests and type check**

Run: `pnpm vitest run src/routes/api && pnpm tsc --noEmit`

Expected: PASS, with tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write <each changed or created file>
git add <each changed or created file; routeTree.gen.ts only per the rule above>
git commit -m "feat(admin): request Mux captions on save, captions status/retry route, backfill script"
```

---

### Task 7: Admin captions status line

**Files:**
- Modify:
  - `src/lib/admin-schemas.ts` (`lessonCaptionsSchema`)
  - `src/data-hooks/keys.ts`
  - `src/components/admin/lesson-config/video-section-container.tsx`
- Create:
  - `src/data-hooks/use-lesson-captions.ts`
  - `src/data-hooks/use-request-lesson-captions.ts`
  - `src/components/admin/lesson-config/captions-status.tsx`
  - `src/components/admin/lesson-config/captions-status-container.tsx`
- Test:
  - `src/components/admin/lesson-config/__tests__/captions-status.test.tsx` (create)
  - `src/data-hooks/__tests__/use-lesson-captions.test.tsx` (create)
  - `src/components/admin/lesson-config/__tests__/video-section-container.test.tsx` (extend)

**Interfaces:**
- Consumes: the Task 6 route.
- Produces:

```ts
// admin-schemas.ts
export const lessonCaptionsSchema = z.object({
  status: z.enum(['generating', 'ready', 'failed', 'unsupported', 'none', 'no_token', 'not_mux']),
  error: z.string().nullable(),
  lang: videoLangSchema,
});
export type LessonCaptions = z.infer<typeof lessonCaptionsSchema>;

// keys.ts
lessonCaptionsAll: (lessonId: number) => ['admin', 'lesson-captions', lessonId] as const,
lessonCaptions: (lessonId: number, courseId: number, lang: VideoLang) =>
  [...dataKeys.lessonCaptionsAll(lessonId), courseId, lang] as const,

// hooks
useLessonCaptions(target: { lessonId: number; courseId: number; lang: VideoLang } | null)
useRequestLessonCaptions()  // mutate({ lessonId, courseId, lang })

// presentational
interface CaptionsStatusProps {
  status: LessonCaptions['status'];
  languageLabel: string;
  error: string | null;
  onRequest?: () => void;
  isRequesting?: boolean;
}
```

- [ ] **Step 1: Write the failing tests**

`captions-status.test.tsx` (jsdom). No hooks: it's presentational.

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CaptionsStatus } from '../captions-status';

const base = { languageLabel: 'French', error: null };

describe('CaptionsStatus', () => {
  it.each([
    ['generating', 'Generating French captions… usually a few minutes'],
    ['ready', 'French captions ready'],
    ['unsupported', "Mux can't generate French captions"],
    ['no_token', "Add a Mux API token to this course's Mux credentials to generate captions"],
    ['none', 'No captions yet'],
  ] as const)('%s states itself', (status, text) => {
    render(<CaptionsStatus {...base} status={status} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('a failure states its reason and offers Retry, which reaches the caller', () => {
    const onRequest = vi.fn();
    render(<CaptionsStatus {...base} status="failed" error="Mux rejected the API token." onRequest={onRequest} />);
    expect(screen.getByText('French captions failed: Mux rejected the API token.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('no captions yet offers Generate captions', () => {
    const onRequest = vi.fn();
    render(<CaptionsStatus {...base} status="none" onRequest={onRequest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate captions' }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('a request in flight disables the button and says so', () => {
    render(<CaptionsStatus {...base} status="failed" error="x" onRequest={vi.fn()} isRequesting />);
    expect((screen.getByRole('button', { name: 'Requesting…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders nothing for a video that is not on Mux', () => {
    const { container } = render(<CaptionsStatus {...base} status="not_mux" />);
    expect(container.textContent).toBe('');
  });
});
```

`use-lesson-captions.test.tsx`: follow
`src/data-hooks/__tests__/use-lesson-video-playback-fetch.test.tsx`
(its `harness()`, `renderHook` and `fetch` stub).
- It fetches `/api/admin/lessons/10/captions?courseId=7&lang=fr`, and
  caches under `dataKeys.lessonCaptions(10, 7, 'fr')` the parsed body.
- `refetchInterval` is 30s while the status is `generating` and `false`
  otherwise. Export the pure `captionsRefetchInterval(status)` from the
  hook file and unit-test it: `generating` → `30_000`, everything else →
  `false`.
- `useRequestLessonCaptions`: after `mutateAsync({ lessonId: 10, courseId: 7, lang: 'fr' })`,
  `fetch` received `('/api/admin/lessons/10/captions?courseId=7&lang=fr', { method: 'POST' })`.
  `client.invalidateQueries` was called with
  `{ queryKey: dataKeys.lessonCaptionsAll(10) }` and
  `{ queryKey: dataKeys.lessonPlaybacks(10) }`. Spy on
  `client.invalidateQueries`.

In `video-section-container.test.tsx`:
- Stub `../captions-status-container` with a capturing
  `vi.fn(() => <div data-testid="captions-status" />)`.
- Assert that, with a course and a previewed language `fr`, the stub
  received `{ lessonId: <fixture>, courseId: <fixture>, lang: 'fr' }`.
- Assert that with `courseId === null` (library editor) it is not
  rendered.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/admin/lesson-config src/data-hooks`

Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Implement**

`admin-schemas.ts`: add `lessonCaptionsSchema` and `LessonCaptions` as
listed under Interfaces.

`keys.ts`: add both keys as listed, next to `lessonPlayback`.

`src/data-hooks/use-lesson-captions.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { type LessonCaptions, lessonCaptionsSchema } from '#/lib/admin-schemas';
import type { VideoLang } from '#/lib/video-languages';
import { dataKeys } from './keys';

/** Poll only while Mux is still working; a settled state changes only on an admin action. */
export const captionsRefetchInterval = (
  status: LessonCaptions['status'] | undefined,
): number | false => (status === 'generating' ? 30_000 : false);

export function useLessonCaptions(
  target: { lessonId: number; courseId: number; lang: VideoLang } | null,
) {
  return useQuery({
    queryKey: dataKeys.lessonCaptions(
      target?.lessonId ?? 0,
      target?.courseId ?? 0,
      target?.lang ?? 'en',
    ),
    enabled: target !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<LessonCaptions | null> => {
      if (target === null) return null;
      const res = await fetch(
        `/api/admin/lessons/${target.lessonId}/captions?courseId=${target.courseId}&lang=${target.lang}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Couldn't load captions status (${res.status})`);
      return lessonCaptionsSchema.parse(await res.json());
    },
    refetchInterval: (query) => captionsRefetchInterval(query.state.data?.status),
  });
}
```

`src/data-hooks/use-request-lesson-captions.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VideoLang } from '#/lib/video-languages';
import { dataKeys } from './keys';

/** Generate (or retry) a lesson video's Mux captions, then refetch status and playback. */
export function useRequestLessonCaptions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      lessonId,
      courseId,
      lang,
    }: { lessonId: number; courseId: number; lang: VideoLang }) => {
      const res = await fetch(
        `/api/admin/lessons/${lessonId}/captions?courseId=${courseId}&lang=${lang}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(`Couldn't request captions (${res.status})`);
    },
    onSuccess: (_data, { lessonId }) => {
      queryClient.invalidateQueries({ queryKey: dataKeys.lessonCaptionsAll(lessonId) });
      // Ready captions change what playback returns (the VTT URL).
      queryClient.invalidateQueries({ queryKey: dataKeys.lessonPlaybacks(lessonId) });
    },
  });
}
```

`captions-status.tsx` is presentational and hookless. Build the button
with `Button` from `@base-ui/react/button`, styled like the existing
fallback button in `preview-language-fallback.tsx` (copy its classes).
For text, use the existing hint text class in `video-section-container.tsx`,
e.g. `text-tertiary` or whatever token the "Loading <language>…" line uses.

```tsx
import { Button } from '@base-ui/react/button';
import type { LessonCaptions } from '#/lib/admin-schemas';

export interface CaptionsStatusProps {
  status: LessonCaptions['status'];
  languageLabel: string;
  error: string | null;
  onRequest?: () => void;
  isRequesting?: boolean;
}

function message({ status, languageLabel, error }: CaptionsStatusProps): string | null {
  switch (status) {
    case 'generating':
      return `Generating ${languageLabel} captions… usually a few minutes`;
    case 'ready':
      return `${languageLabel} captions ready`;
    case 'failed':
      return `${languageLabel} captions failed: ${error ?? 'unknown reason'}`;
    case 'unsupported':
      return `Mux can't generate ${languageLabel} captions`;
    case 'no_token':
      return "Add a Mux API token to this course's Mux credentials to generate captions";
    case 'none':
      return 'No captions yet';
    case 'not_mux':
      return null;
  }
}

/** One line under the preview: where this video's Mux captions stand, and the way forward. */
export function CaptionsStatus(props: CaptionsStatusProps) {
  const text = message(props);
  if (text === null) return null;
  const action =
    props.status === 'failed' ? 'Retry' : props.status === 'none' ? 'Generate captions' : null;
  return (
    <p className="… existing hint text classes … flex flex-wrap items-center gap-2" role="status">
      <span>{text}</span>
      {action && props.onRequest && (
        <Button
          className="… existing fallback button classes …"
          onClick={props.onRequest}
          disabled={props.isRequesting}
        >
          {props.isRequesting ? 'Requesting…' : action}
        </Button>
      )}
    </p>
  );
}
```

Replace the two `… existing … classes …` markers with the real class
strings copied from the named files. They must be real classes. Verify
AA contrast via the token layer, as `preview-language-fallback.tsx`
already does.

`captions-status-container.tsx`:

```tsx
import { useLessonCaptions } from '#/data-hooks/use-lesson-captions';
import { useRequestLessonCaptions } from '#/data-hooks/use-request-lesson-captions';
import { labelForLang, type VideoLang } from '#/lib/video-languages';
import { CaptionsStatus } from './captions-status';

export function CaptionsStatusContainer({
  lessonId,
  courseId,
  lang,
}: {
  lessonId: number;
  courseId: number;
  lang: VideoLang;
}) {
  const captions = useLessonCaptions({ lessonId, courseId, lang });
  const request = useRequestLessonCaptions();
  if (!captions.data) return null;
  return (
    <CaptionsStatus
      status={captions.data.status}
      languageLabel={labelForLang(captions.data.lang)}
      error={captions.data.error}
      onRequest={() => request.mutate({ lessonId, courseId, lang })}
      isRequesting={request.isPending}
    />
  );
}
```

`video-section-container.tsx`: where the preview renders (next to the
`Loading {labelForLang(previewLang)}…` line and `{languageFallback}` in
the `canPlay` branch), add:

```tsx
{courseId !== null && (
  <CaptionsStatusContainer lessonId={lesson.id} courseId={courseId} lang={previewLang} />
)}
```

The status line is about the video being previewed, so it sits with the
preview rather than the credential form. It renders nothing for a
non-Mux video (`not_mux`).

- [ ] **Step 4: Run tests and type check**

Run: `pnpm vitest run src/components/admin src/data-hooks && pnpm tsc --noEmit`

Expected: PASS, with tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write <each changed or created file>
git add <each changed or created file>
git commit -m "feat(admin): captions status line with generate and retry in the lesson video section"
```

---

### Task 8: Full verification

- [ ] **Step 1:** Run `pnpm vitest run`. Every file passes.
- [ ] **Step 2:** Run `pnpm tsc --noEmit`. Clean.
- [ ] **Step 3:** Run `pnpm build`. Exit 0. Then run
  `grep -l "drizzle-orm\|video_captions\|mux-captions-service\|DATABASE_URL" .output/public/assets/*.js`.
  It must print nothing, which proves no server module reached the
  client.
- [ ] **Step 4:** Hand the rollout and walkthrough to the user, on port
  5001:
  - `pnpm db:migrate-video-captions`, locally and on prod before
    deploying.
  - Add a Mux API token (Video read/write) to a course's Mux
    credentials. Re-save the signing key once without the token and
    confirm the token is kept (the summary still shows `apiTokenId`).
  - Attach a Mux video. The status line shows "Generating English
    captions…", then "English captions ready" a few minutes later.
  - On the learner lesson, CC plays, and the debrief is offered.
  - A Japanese alternate shows "Mux can't generate Japanese captions".
  - Run `pnpm db:backfill-mux-captions` and read the counts.
