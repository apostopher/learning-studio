# Video Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lesson can carry translated videos per language; admins attach them in the Video tab, and the learner player gets a language menu that switches video without losing the playhead.

**Architecture:** The existing `lessons.other_video_ids` jsonb column stores `{ lang, provider, ref }[]`. The learner playback route takes `?lang=`, resolves the matching alternate (falling back to English) and reports `lang` + `languages` on the response; the client keys its playback query on the requested lang and a persisted jotai preference. The player gets a `LanguageMenu` beside the rate menu, and `VideoPlayerContainer` pauses, captures and restores the playhead across the source swap.

**Tech Stack:** TanStack Start routes, Drizzle (jsonb), zod 4, jotai (`atomWithStorage`), TanStack Query (`keepPreviousData`), react-hook-form, Base UI `Menu`/`Select`, vitest (+ jsdom/testing-library for renders).

**Spec:** `docs/superpowers/specs/2026-09-17-video-languages-design.md`

## Global Constraints

- Imports inside modules reached by tests use `#/`, never `@/` (vitest can't resolve `@/`).
- Presentational components are hookless pure functions; containers own hooks/state. Files are kebab-case; containers end in `-container.tsx`.
- Client state in jotai, server state in TanStack Query data hooks under `src/data-hooks/` (admin) or `src/hooks/data/` (learner). No `useState`.
- Tailwind logical properties only (`ps-`, `ms-`, `start-`…); colors via the semantic tokens already in use (`text-primary`, `bg-gray-1`, `border-gray-6`, `text-error-text`, `bg-apple-9`…). Never raw hex or Tailwind palette classes.
- Base UI first: `Menu` for the player menu, `Select` for the admin language picker.
- Language codes are BCP-47 as Synthesia uses them: `en` (primary, always), and `VIDEO_LANGUAGES = ['fr', 'fr-CA', 'es', 'de', 'pt-BR', 'ja', 'zh', 'tr', 'af', 'ar', 'hi']`.
- Alternates never leave the server except through the admin `alternate-videos` route; the learner response carries only `lang` + `languages`.
- Run tests with `pnpm vitest run <path>`; lint with `pnpm exec biome check <path>`; types with `pnpm exec tsc --noEmit -p .`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017sbSP7p9mg8ZTaQJfvALfy
  ```

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/video-languages.ts` (new) | Codes, zod schemas, `labelForLang`, `badgeForLang`, `orderedLanguages`, `availableLanguages`, `upsertAlternate`, `removeAlternate` |
| `src/types.ts` | `OtherVideoIdSchema` → `{ lang, provider, ref }` |
| `src/lib/video-providers/select-video-for-lang.ts` (new) | Pure: which `{provider, ref, lang}` to play for a requested lang |
| `src/db/lesson-playback.ts` | `lang` option; cache key per lang; response carries `lang`/`languages`; invalidate all langs |
| `src/routes/api/lesson/playback.ts` | `?lang=` |
| `src/lib/admin-schemas.ts` | `learnerPlaybackSchema`, `setLessonAlternateVideoInputSchema` |
| `src/hooks/data/keys.ts`, `src/atoms/lesson-video.ts`, `src/hooks/data/use-lesson-video.ts`, `src/atoms/video-language.ts` (new) | Learner query keyed by lang; persisted preference |
| `src/lib/video-providers/playback-to-state.ts`, `src/components/lesson-main/types.ts` | Lang-labelled caption track; `lang`/`languages` on ready state |
| `src/components/video-player/parts/language-menu.tsx` (new), `video-player.tsx`, `types.ts`, `labels.ts` | The menu |
| `src/components/video-player/restore-point.ts` (new), `video-player-container.tsx` | Pause/capture/restore across a source swap |
| `src/components/lesson-main/lesson-main-wrapper.tsx`, `parts/lesson-player-container.tsx` | Wire preference → query → player |
| `src/db/admin.ts`, `src/routes/api/admin/lessons.$lessonId.alternate-videos.ts` (new) | Admin read/upsert/remove |
| `src/data-hooks/keys.ts`, `use-lesson-alternate-videos.ts`, `use-set-lesson-alternate-video.ts`, `use-remove-lesson-alternate-video.ts` (new) | Admin data hooks |
| `src/components/admin/lesson-config/alternate-videos-list.tsx`, `alternate-video-form.tsx`, `alternate-videos-container.tsx` (new), `video-section-container.tsx` | Admin UI |

---

### Task 1: Language constants and pure helpers

**Files:**
- Create: `src/lib/video-languages.ts`
- Test: `src/lib/__tests__/video-languages.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PRIMARY_VIDEO_LANG = 'en';
  export const VIDEO_LANGUAGES: readonly ['fr','fr-CA','es','de','pt-BR','ja','zh','tr','af','ar','hi'];
  export const alternateLangSchema: z.ZodEnum;   // VIDEO_LANGUAGES only
  export const videoLangSchema: z.ZodEnum;       // 'en' | VIDEO_LANGUAGES
  export type AlternateLang; export type VideoLang;
  export const isVideoLang: (v: unknown) => v is VideoLang;
  export const labelForLang: (code: VideoLang) => string;   // "French (Canada)"
  export const badgeForLang: (code: VideoLang) => string;   // "FR-CA"
  export const orderedLanguages: (alternateLangs: readonly AlternateLang[]) => VideoLang[]; // ['en', ...in VIDEO_LANGUAGES order, deduped]
  export const availableLanguages: (used: readonly AlternateLang[]) => AlternateLang[];
  export type AlternateVideo = { lang: AlternateLang; provider: 'mux' | 'synthesia'; ref: string };
  export const upsertAlternate: (list: readonly AlternateVideo[], entry: AlternateVideo) => AlternateVideo[];
  export const removeAlternate: (list: readonly AlternateVideo[], lang: AlternateLang) => AlternateVideo[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/video-languages.test.ts
import { describe, expect, it } from 'vitest';
import {
  availableLanguages,
  badgeForLang,
  isVideoLang,
  labelForLang,
  orderedLanguages,
  removeAlternate,
  upsertAlternate,
  videoLangSchema,
} from '#/lib/video-languages';

describe('video languages', () => {
  it('labels a code with its English display name', () => {
    expect(labelForLang('en')).toBe('English');
    expect(labelForLang('fr-CA')).toBe('Canadian French');
  });

  it('badges a code in upper case, region kept', () => {
    expect(badgeForLang('en')).toBe('EN');
    expect(badgeForLang('fr-CA')).toBe('FR-CA');
    expect(badgeForLang('pt-BR')).toBe('PT-BR');
  });

  it('orders languages as en first, then in the curated order, deduped', () => {
    expect(orderedLanguages(['ja', 'fr-CA', 'fr', 'ja'])).toEqual([
      'en',
      'fr',
      'fr-CA',
      'ja',
    ]);
    expect(orderedLanguages([])).toEqual(['en']);
  });

  it('lists the languages an admin can still add', () => {
    const left = availableLanguages(['fr', 'ja']);
    expect(left).not.toContain('fr');
    expect(left).not.toContain('ja');
    expect(left).not.toContain('en');
    expect(left[0]).toBe('fr-CA');
  });

  it('upserts by lang, keeping one row per language', () => {
    const list = [{ lang: 'fr' as const, provider: 'synthesia' as const, ref: 'a' }];
    const next = upsertAlternate(list, { lang: 'fr', provider: 'synthesia', ref: 'b' });
    expect(next).toEqual([{ lang: 'fr', provider: 'synthesia', ref: 'b' }]);
    const added = upsertAlternate(next, { lang: 'ja', provider: 'mux', ref: 'c' });
    expect(added).toHaveLength(2);
    expect(list).toHaveLength(1); // input untouched
  });

  it('removes by lang', () => {
    const list = [
      { lang: 'fr' as const, provider: 'synthesia' as const, ref: 'a' },
      { lang: 'ja' as const, provider: 'synthesia' as const, ref: 'b' },
    ];
    expect(removeAlternate(list, 'fr')).toEqual([list[1]]);
  });

  it('accepts known codes and rejects unknown ones', () => {
    expect(videoLangSchema.safeParse('fr-CA').success).toBe(true);
    expect(videoLangSchema.safeParse('FR').success).toBe(false);
    expect(isVideoLang('xx')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/video-languages.test.ts`
Expected: FAIL — cannot resolve `#/lib/video-languages`.

- [ ] **Step 3: Implement**

```ts
// src/lib/video-languages.ts
import { z } from 'zod';

/** The primary video's language. Every lesson video is English first. */
export const PRIMARY_VIDEO_LANG = 'en';

/**
 * Languages an admin can attach a translated video under. BCP-47, as
 * Synthesia's translation feature names them (`fr-CA`, `pt-BR`). Curated
 * rather than fetched: a handful of real translations, not the 140 the
 * provider could produce, and a Mux lesson has no provider list at all.
 * Adding one is a one-line change here.
 */
export const VIDEO_LANGUAGES = [
  'fr',
  'fr-CA',
  'es',
  'de',
  'pt-BR',
  'ja',
  'zh',
  'tr',
  'af',
  'ar',
  'hi',
] as const;

export const alternateLangSchema = z.enum(VIDEO_LANGUAGES);
export type AlternateLang = z.infer<typeof alternateLangSchema>;

export const videoLangSchema = z.enum([PRIMARY_VIDEO_LANG, ...VIDEO_LANGUAGES]);
export type VideoLang = z.infer<typeof videoLangSchema>;

export const isVideoLang = (value: unknown): value is VideoLang =>
  videoLangSchema.safeParse(value).success;

const displayNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'language' })
    : null;

/** "Canadian French" — the browser's own name for the code, else the code. */
export const labelForLang = (code: VideoLang): string => {
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

/** The short form shown on the player's trigger: `EN`, `FR-CA`. */
export const badgeForLang = (code: VideoLang): string => code.toUpperCase();

/** `en` first, then whichever alternates exist, in curated order, deduped. */
export const orderedLanguages = (
  alternateLangs: readonly AlternateLang[],
): VideoLang[] => {
  const present = new Set(alternateLangs);
  return [PRIMARY_VIDEO_LANG, ...VIDEO_LANGUAGES.filter((l) => present.has(l))];
};

/** The codes not yet attached — what the admin's "Add language" select offers. */
export const availableLanguages = (
  used: readonly AlternateLang[],
): AlternateLang[] => {
  const taken = new Set(used);
  return VIDEO_LANGUAGES.filter((l) => !taken.has(l));
};

export type AlternateVideo = {
  lang: AlternateLang;
  provider: 'mux' | 'synthesia';
  ref: string;
};

/** One row per language: replaces an existing row for `entry.lang`, else appends. */
export const upsertAlternate = (
  list: readonly AlternateVideo[],
  entry: AlternateVideo,
): AlternateVideo[] => {
  const without = list.filter((a) => a.lang !== entry.lang);
  return [...without, entry];
};

export const removeAlternate = (
  list: readonly AlternateVideo[],
  lang: AlternateLang,
): AlternateVideo[] => list.filter((a) => a.lang !== lang);
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/video-languages.test.ts`
Expected: PASS (7 tests). If `labelForLang('fr-CA')` returns `"French (Canada)"` on this Node's ICU instead of `"Canadian French"`, change the expectation to whatever Node printed — the test pins the *mechanism* (Intl), not one ICU build's wording.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-languages.ts src/lib/__tests__/video-languages.test.ts
git commit -m "feat(video): curated video languages with display names and alternate-list helpers"
```

---

### Task 2: `OtherVideoIdSchema` becomes `{ lang, provider, ref }`

**Files:**
- Modify: `src/types.ts:88-95`
- Test: `src/lib/__tests__/other-video-id-schema.test.ts`

**Interfaces:**
- Produces: `OtherVideoIdSchema`, `OtherVideoIdsSchema`, `OtherVideoId`, `OtherVideoIds` in `#/types` with the new shape. `lessonsTable.otherVideoIds` (`src/db/schema.ts:401`) already uses `z.infer<typeof OtherVideoIdsSchema>` and follows automatically.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/other-video-id-schema.test.ts
import { describe, expect, it } from 'vitest';
import { OtherVideoIdsSchema } from '#/types';

describe('OtherVideoIdsSchema', () => {
  it('accepts lang + provider + ref rows', () => {
    const parsed = OtherVideoIdsSchema.safeParse([
      { lang: 'fr-CA', provider: 'synthesia', ref: 'e9eecce0-f228-4bc1-9c66-af6851605498' },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('rejects the legacy { lang: "FR", videoId } shape', () => {
    expect(
      OtherVideoIdsSchema.safeParse([{ lang: 'FR', videoId: 'https://share.synthesia.io/x' }]).success,
    ).toBe(false);
  });

  it('rejects en (the primary video is never an alternate) and two rows for one lang', () => {
    expect(
      OtherVideoIdsSchema.safeParse([{ lang: 'en', provider: 'mux', ref: 'a' }]).success,
    ).toBe(false);
    expect(
      OtherVideoIdsSchema.safeParse([
        { lang: 'fr', provider: 'mux', ref: 'a' },
        { lang: 'fr', provider: 'mux', ref: 'b' },
      ]).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/other-video-id-schema.test.ts`
Expected: FAIL — first test fails (`lang` must be `'FR' | 'JP'`, `videoId` missing).

- [ ] **Step 3: Implement**

Replace lines 88–95 of `src/types.ts`:

```ts
/**
 * A translated video attached to a lesson under one language. Same
 * provider/ref pair as the primary video, so it goes through the same
 * `resolvePlayback`; stored on `lessons.other_video_ids`. One row per lang.
 */
export const OtherVideoIdSchema = z.object({
  lang: alternateLangSchema,
  provider: z.enum(PROVIDER_IDS),
  ref: z.string().trim().min(1),
});
export type OtherVideoId = z.infer<typeof OtherVideoIdSchema>;

export const OtherVideoIdsSchema = z
  .array(OtherVideoIdSchema)
  .refine(
    (rows) => new Set(rows.map((r) => r.lang)).size === rows.length,
    'One video per language',
  );
export type OtherVideoIds = z.infer<typeof OtherVideoIdsSchema>;
```

Add to the imports at the top of `src/types.ts`:

```ts
import { alternateLangSchema } from '#/lib/video-languages';
import { PROVIDER_IDS } from '#/lib/video-providers';
```

(`#/lib/video-providers` pulls in `mux.ts`/`synthesia.ts`, which import only zod and their local `./types` — no server code, no cycle back to `#/types`.)

- [ ] **Step 4: Run to verify it passes, then typecheck the whole tree**

Run: `pnpm vitest run src/lib/__tests__/other-video-id-schema.test.ts && pnpm exec tsc --noEmit -p .`
Expected: PASS; tsc clean (`db/course.ts:187` only spreads the array, `course-details-shape.ts` only strips the field).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/__tests__/other-video-id-schema.test.ts
git commit -m "feat(types): other_video_ids rows are { lang, provider, ref }"
```

---

### Task 3: `selectVideoForLang` — which video plays for a requested language

**Files:**
- Create: `src/lib/video-providers/select-video-for-lang.ts`
- Test: `src/lib/video-providers/__tests__/select-video-for-lang.test.ts`

**Interfaces:**
- Consumes: `orderedLanguages`, `PRIMARY_VIDEO_LANG`, `VideoLang`, `AlternateVideo` from `#/lib/video-languages`; `ProviderId` from `./types`.
- Produces:
  ```ts
  export type VideoSelection = { provider: ProviderId; ref: string; lang: VideoLang; languages: VideoLang[] };
  export function selectVideoForLang(args: {
    primary: { provider: ProviderId; ref: string };
    alternates: readonly AlternateVideo[];
    requested: VideoLang;
  }): VideoSelection;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/video-providers/__tests__/select-video-for-lang.test.ts
import { describe, expect, it } from 'vitest';
import { selectVideoForLang } from '../select-video-for-lang';

const primary = { provider: 'synthesia' as const, ref: 'en-ref' };
const alternates = [
  { lang: 'fr-CA' as const, provider: 'synthesia' as const, ref: 'fr-ref' },
  { lang: 'ja' as const, provider: 'mux' as const, ref: 'ja-ref' },
];

describe('selectVideoForLang', () => {
  it('plays the alternate for a requested lang that exists, with that row\'s provider', () => {
    expect(selectVideoForLang({ primary, alternates, requested: 'ja' })).toEqual({
      provider: 'mux',
      ref: 'ja-ref',
      lang: 'ja',
      languages: ['en', 'fr-CA', 'ja'],
    });
  });

  it('falls back to the primary, reporting lang en, when the requested lang is not attached', () => {
    expect(selectVideoForLang({ primary, alternates, requested: 'de' })).toEqual({
      provider: 'synthesia',
      ref: 'en-ref',
      lang: 'en',
      languages: ['en', 'fr-CA', 'ja'],
    });
  });

  it('plays the primary for en', () => {
    expect(selectVideoForLang({ primary, alternates: [], requested: 'en' })).toEqual({
      provider: 'synthesia',
      ref: 'en-ref',
      lang: 'en',
      languages: ['en'],
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/video-providers/__tests__/select-video-for-lang.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/video-providers/select-video-for-lang.ts
import {
  type AlternateVideo,
  orderedLanguages,
  PRIMARY_VIDEO_LANG,
  type VideoLang,
} from '#/lib/video-languages';
import type { ProviderId } from './types';

export type VideoSelection = {
  provider: ProviderId;
  ref: string;
  /** The language actually chosen — `en` when the request had no match. */
  lang: VideoLang;
  /** Every language this lesson can play, `en` first. */
  languages: VideoLang[];
};

/**
 * Pure: the video to resolve for a requested language. A request for a
 * language the lesson does not carry is not an error — the learner's
 * preference is global and most lessons will lack most languages — so it
 * falls back to the primary and says so via `lang`, and the menu the client
 * renders from `languages` shows what was actually on offer.
 */
export function selectVideoForLang({
  primary,
  alternates,
  requested,
}: {
  primary: { provider: ProviderId; ref: string };
  alternates: readonly AlternateVideo[];
  requested: VideoLang;
}): VideoSelection {
  const languages = orderedLanguages(alternates.map((a) => a.lang));
  const hit =
    requested === PRIMARY_VIDEO_LANG
      ? undefined
      : alternates.find((a) => a.lang === requested);
  if (hit) {
    return { provider: hit.provider, ref: hit.ref, lang: hit.lang, languages };
  }
  return { ...primary, lang: PRIMARY_VIDEO_LANG, languages };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/video-providers/__tests__/select-video-for-lang.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-providers/select-video-for-lang.ts src/lib/video-providers/__tests__/select-video-for-lang.test.ts
git commit -m "feat(video): selectVideoForLang picks the alternate or falls back to English"
```

---

### Task 4: Learner playback resolves per language

**Files:**
- Modify: `src/db/lesson-playback.ts`
- Test: `src/db/__tests__/lesson-playback.test.ts`

**Interfaces:**
- Consumes: `selectVideoForLang` (Task 3); `OtherVideoIdsSchema` (Task 2); `videoLangSchema`, `VIDEO_LANGUAGES`, `PRIMARY_VIDEO_LANG`, `VideoLang` (Task 1).
- Produces:
  ```ts
  export type LessonPlaybackResult = PlaybackResult & { lang: VideoLang; languages: VideoLang[] };
  type LessonPlaybackOptions = { courseId: number; skipCache?: boolean; lang?: VideoLang }; // lang defaults to 'en'
  getLessonPlayback(lessonSlug, options): Promise<LessonPlaybackResult | null>
  getLessonPlayback.invalidate(lessonSlug) // evicts every (course × lang) key
  ```

- [ ] **Step 1: Update the test file**

In `src/db/__tests__/lesson-playback.test.ts`:

1. Add `otherVideoIds: jsonb('other_video_ids')` to the stub `lessonsTable` (import `jsonb` from `drizzle-orm/pg-core`).
2. Change every `'lesson-playback:3:l1'` expectation to `'lesson-playback:3:l1:en'`.
3. Change `lessonRow` to `{ videoProvider: 'mux', videoRef: 'ref-1', otherVideoIds: [] }`.
4. Every existing `expect(result).toEqual(ready)` / `toEqual({ status: 'rendering' })` etc. on a *resolved* (non-cached) result becomes `toEqual({ ...ready, lang: 'en', languages: ['en'] })` (pending results too: `{ status: 'rendering', lang: 'en', languages: ['en'] }`). The `redisMock.set` payload assertion likewise wraps `JSON.stringify({ ...ready, lang: 'en', languages: ['en'] })`.
5. Append these tests:

```ts
describe('getLessonPlayback with a language', () => {
  const rowWithFrench = {
    videoProvider: 'synthesia',
    videoRef: 'en-ref',
    otherVideoIds: [{ lang: 'fr-CA', provider: 'mux', ref: 'fr-ref' }],
  };
  const ready = {
    status: 'ready' as const,
    url: 'https://cdn/v.m3u8',
    kind: 'hls' as const,
    expiresInSeconds: 90,
    poster: null,
    captions: null,
  };

  it("resolves the alternate with THAT row's provider credentials and caches under the lang", async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(makeChain([rowWithFrench]));
    admin.resolveCourseProvider.mockResolvedValueOnce({ keyId: 'mux-key' });
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1', { ...inCourse, lang: 'fr-CA' });

    expect(admin.resolveCourseProvider).toHaveBeenCalledWith(3, 'mux');
    expect(providers.resolvePlayback).toHaveBeenCalledWith('mux', 'fr-ref', { keyId: 'mux-key' });
    expect(result).toEqual({ ...ready, lang: 'fr-CA', languages: ['en', 'fr-CA'] });
    expect(redisMock.get).toHaveBeenCalledWith('lesson-playback:3:l1:fr-CA');
    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:3:l1:fr-CA',
      JSON.stringify({ ...ready, lang: 'fr-CA', languages: ['en', 'fr-CA'] }),
      { ex: 60 },
    );
  });

  it('falls back to the primary video, reporting lang en, for a language the lesson lacks', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(makeChain([rowWithFrench]));
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1', { ...inCourse, lang: 'ja' });

    expect(providers.resolvePlayback).toHaveBeenCalledWith('synthesia', 'en-ref', expect.anything());
    expect(result).toMatchObject({ lang: 'en', languages: ['en', 'fr-CA'] });
  });

  it('treats an unparseable other_video_ids column as no alternates rather than failing playback', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(
      makeChain([{ ...rowWithFrench, otherVideoIds: [{ lang: 'FR', videoId: 'legacy' }] }]),
    );
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1', { ...inCourse, lang: 'fr' });

    expect(result).toMatchObject({ lang: 'en', languages: ['en'] });
  });
});

describe('getLessonPlayback.invalidate', () => {
  it('evicts every language key for every course teaching the lesson', async () => {
    const access = await import('#/db/lesson-access');
    const placements = await import('#/db/placements');
    vi.mocked(access.getLessonIdBySlug).mockResolvedValueOnce(9);
    vi.mocked(placements.getCourseIdsForLesson).mockResolvedValueOnce([3, 4]);

    await getLessonPlayback.invalidate('l1');

    expect(redisMock.del).toHaveBeenCalledWith('lesson-playback:3:l1:en');
    expect(redisMock.del).toHaveBeenCalledWith('lesson-playback:3:l1:fr-CA');
    expect(redisMock.del).toHaveBeenCalledWith('lesson-playback:4:l1:ja');
    // 2 courses × (en + 11 alternates)
    expect(redisMock.del).toHaveBeenCalledTimes(24);
  });
});
```

Change the hoisted mock to `const redisMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));` — the file has no `invalidate` tests yet.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm vitest run src/db/__tests__/lesson-playback.test.ts`
Expected: the renamed cache-key tests and the four new tests FAIL; nothing errors at import.

- [ ] **Step 3: Implement**

In `src/db/lesson-playback.ts`:

Add imports:

```ts
import { OtherVideoIdsSchema } from '#/types';
import {
  PRIMARY_VIDEO_LANG,
  VIDEO_LANGUAGES,
  type VideoLang,
} from '#/lib/video-languages';
import { selectVideoForLang } from '#/lib/video-providers/select-video-for-lang';
```

Add the exported result type after the imports:

```ts
/** A `PlaybackResult` plus which language it is and which the lesson offers. */
export type LessonPlaybackResult = PlaybackResult & {
  lang: VideoLang;
  languages: VideoLang[];
};
```

Change `resolveLessonPlaybackUncached` to:

```ts
async function resolveLessonPlaybackUncached(
  lessonSlug: string,
  courseId: number,
  lang: VideoLang,
): Promise<LessonPlaybackResult | null> {
  const [lesson] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
      otherVideoIds: lessonsTable.otherVideoIds,
    })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .where(
      and(
        eq(lessonsTable.slug, lessonSlug),
        inArray(moduleLessonsTable.moduleId, courseModuleIds(courseId)),
      ),
    )
    .limit(1);
  if (!lesson?.videoProvider || !lesson.videoRef) return null;

  // A column that fails the schema (a row written under the old
  // `{ lang: 'FR', videoId }` shape, or by hand) must not take the English
  // video down with it — it simply offers no alternates.
  const alternates = OtherVideoIdsSchema.safeParse(lesson.otherVideoIds);
  const selection = selectVideoForLang({
    primary: {
      provider: lesson.videoProvider as ProviderId,
      ref: lesson.videoRef,
    },
    alternates: alternates.success ? alternates.data : [],
    requested: lang,
  });

  const creds = await resolveCourseProvider(courseId, selection.provider);
  // (keep the existing comment block about why this throws)
  if (!creds) {
    throw new PlaybackError(
      'PROVIDER_NOT_CONFIGURED',
      `This course has no ${selection.provider} credentials configured.`,
    );
  }
  const playback = await resolvePlayback(
    selection.provider,
    selection.ref,
    creds,
  );
  return { ...playback, lang: selection.lang, languages: selection.languages };
}
```

Update the options/reader types and cache key:

```ts
type LessonPlaybackOptions = {
  courseId: number;
  skipCache?: boolean;
  /** The learner's requested language; `en` when absent. */
  lang?: VideoLang;
};

type LessonPlaybackReader = ((
  lessonSlug: string,
  options: LessonPlaybackOptions,
) => Promise<LessonPlaybackResult | null>) & {
  invalidate: (lessonSlug: string) => Promise<void>;
};

const ALL_LANGS: readonly VideoLang[] = [PRIMARY_VIDEO_LANG, ...VIDEO_LANGUAGES];

// Keyed per language as well: a cached French result must never answer an
// English request, and vice versa.
const cacheKey = (courseId: number, lessonSlug: string, lang: VideoLang) =>
  `${CACHE_KEY_PREFIX}:${courseId}:${lessonSlug}:${lang}`;
```

In the reader body: `const lang = options.lang ?? PRIMARY_VIDEO_LANG; const key = cacheKey(options.courseId, lessonSlug, lang);`, type the `redis.get<LessonPlaybackResult>`, and call `resolveLessonPlaybackUncached(lessonSlug, options.courseId, lang)`.

In `invalidate`, replace the `Promise.all` with:

```ts
      // Every language, not just the one that changed: an alternate added or
      // removed changes the `languages` list carried by ALL of them.
      await Promise.all(
        courseIds.flatMap((courseId) =>
          ALL_LANGS.map((lang) => redis.del(cacheKey(courseId, lessonSlug, lang))),
        ),
      );
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/db/__tests__/lesson-playback.test.ts && pnpm exec tsc --noEmit -p .`
Expected: PASS; tsc clean. (`getLessonTranscript` and `db/admin.ts` call `getLessonPlayback`/`.invalidate` with their old signatures, which still typecheck because `lang` is optional.)

- [ ] **Step 5: Commit**

```bash
git add src/db/lesson-playback.ts src/db/__tests__/lesson-playback.test.ts
git commit -m "feat(playback): resolve a lesson's video per language, cached and invalidated per lang"
```

---

### Task 5: `/api/lesson/playback?lang=`

**Files:**
- Modify: `src/routes/api/lesson/playback.ts`
- Test: `src/routes/api/lesson/__tests__/playback-route.test.ts`

**Interfaces:**
- Consumes: `getLessonPlayback(slug, { courseId, skipCache, lang })` (Task 4); `isVideoLang`, `PRIMARY_VIDEO_LANG` (Task 1).

- [ ] **Step 1: Add the failing tests**

Append to `src/routes/api/lesson/__tests__/playback-route.test.ts`:

```ts
describe('lang', () => {
  it('passes a known lang through to getLessonPlayback', async () => {
    await getLessonPlaybackHandler(
      new Request('http://t/api/lesson/playback?lessonSlug=l1&courseSlug=c1&lang=fr-CA'),
    );
    expect(m.getLessonPlayback).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ courseId: 7, lang: 'fr-CA' }),
    );
  });

  it('treats an unknown or absent lang as en rather than refusing', async () => {
    await getLessonPlaybackHandler(
      new Request('http://t/api/lesson/playback?lessonSlug=l1&courseSlug=c1&lang=klingon'),
    );
    expect(m.getLessonPlayback).toHaveBeenLastCalledWith(
      'l1',
      expect.objectContaining({ lang: 'en' }),
    );
    await getLessonPlaybackHandler(req('l1'));
    expect(m.getLessonPlayback).toHaveBeenLastCalledWith(
      'l1',
      expect.objectContaining({ lang: 'en' }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/routes/api/lesson/__tests__/playback-route.test.ts`
Expected: the two new tests FAIL (`lang` not in the call).

- [ ] **Step 3: Implement**

In `src/routes/api/lesson/playback.ts`, import `isVideoLang, PRIMARY_VIDEO_LANG` from `#/lib/video-languages`, and after the `fresh` line add:

```ts
  // The learner's language preference is global and most lessons will not
  // carry it, so an unknown or unattached lang is never a refusal — the
  // resolver falls back to English and reports which language it played.
  const rawLang = url.searchParams.get('lang');
  const lang = isVideoLang(rawLang) ? rawLang : PRIMARY_VIDEO_LANG;
```

and pass it: `getLessonPlayback(lessonSlug, { courseId: gate.courseId, skipCache: fresh, lang })`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/routes/api/lesson/__tests__/playback-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/lesson/playback.ts src/routes/api/lesson/__tests__/playback-route.test.ts
git commit -m "feat(api): lesson playback accepts ?lang="
```

---

### Task 6: Client playback query keyed by language + persisted preference

**Files:**
- Modify: `src/lib/admin-schemas.ts` (after `lessonPlaybackSchema`), `src/hooks/data/keys.ts`, `src/atoms/lesson-video.ts`, `src/hooks/data/use-lesson-video.ts`
- Create: `src/atoms/video-language.ts`
- Test: `src/atoms/__tests__/lesson-video.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // admin-schemas
  export const learnerPlaybackSchema; export type LearnerPlayback = LessonPlayback & { lang: VideoLang; languages: VideoLang[] };
  // keys
  queryKeys.lessonPlayback(lesson: LessonRef, lang: VideoLang) => ['lesson-playback', courseSlug, lessonSlug, lang]
  // atoms/lesson-video
  fetchLessonPlayback(lesson, opts?: { fresh?: boolean; lang?: VideoLang }): Promise<LearnerPlayback>
  lessonPlaybackAtomFamily({ courseSlug, lessonSlug, lang })
  refetchLessonPlaybackFresh(queryClient, lesson, lang = 'en')
  // hooks/data/use-lesson-video
  useLessonVideo(lesson: LessonRef, lang: VideoLang = 'en')
  // atoms/video-language
  export const videoLanguageAtom: WritableAtom<VideoLang>  // atomWithStorage('video-language', 'en')
  ```

- [ ] **Step 1: Update the test**

In `src/atoms/__tests__/lesson-video.test.ts`:
- Add `lang: 'en', languages: ['en']` to `readyBody`.
- Replace `queryKeys.lessonPlayback(lesson)` with `queryKeys.lessonPlayback(lesson, 'en')` in the two existing assertions.
- Append:

```ts
describe('language', () => {
  it('sends lang on the wire and keys the cache entry by it', async () => {
    const body = { ...readyBody, lang: 'fr-CA', languages: ['en', 'fr-CA'] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    await refetchLessonPlaybackFresh(queryClient, lesson, 'fr-CA');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('lang=fr-CA');
    expect(queryClient.getQueryData(queryKeys.lessonPlayback(lesson, 'fr-CA'))).toEqual(body);
    expect(queryClient.getQueryData(queryKeys.lessonPlayback(lesson, 'en'))).toBeUndefined();
  });

  it('rejects a body without lang/languages — the route now always sends them', async () => {
    const { lang: _l, languages: _ls, ...legacy } = readyBody;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => legacy }));
    await expect(fetchLessonPlayback(lesson)).rejects.toThrow();
  });
});
```

(Make sure `fetchLessonPlayback` is imported at the top of the test.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/atoms/__tests__/lesson-video.test.ts`
Expected: FAIL — `lessonPlayback` takes one argument / `lang` not sent.

- [ ] **Step 3: Implement**

`src/lib/admin-schemas.ts` — after `lessonPlaybackSchema`:

```ts
const playbackLanguageFields = {
  lang: videoLangSchema,
  languages: z.array(videoLangSchema).min(1),
};

/**
 * The LEARNER route's body: playback plus which language it is and which
 * the lesson offers. The admin preview route keeps `lessonPlaybackSchema`.
 */
export const learnerPlaybackSchema = z.discriminatedUnion('status', [
  lessonPlaybackReadySchema.extend(playbackLanguageFields),
  lessonPlaybackPendingSchema.extend(playbackLanguageFields),
]);
export type LearnerPlayback = z.infer<typeof learnerPlaybackSchema>;
```

with `import { videoLangSchema } from '#/lib/video-languages';` at the top.

`src/hooks/data/keys.ts`:

```ts
import type { VideoLang } from '#/lib/video-languages';
// …
  // Keyed by course, lesson AND language: the URL is per course, and a
  // French request and an English one are two different videos.
  lessonPlayback: ({ courseSlug, lessonSlug }: LessonRef, lang: VideoLang) =>
    ['lesson-playback', courseSlug, lessonSlug, lang] as const,
```

`src/atoms/video-language.ts`:

```ts
import { atomWithStorage } from 'jotai/utils';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';

/**
 * The learner's video language, across every lesson. A lesson that lacks the
 * chosen language plays English without touching this — the next lesson
 * that has it uses it.
 */
export const videoLanguageAtom = atomWithStorage<VideoLang>(
  'video-language',
  PRIMARY_VIDEO_LANG,
);
```

`src/atoms/lesson-video.ts`:

```ts
import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import { queryKeys } from '#/hooks/data/keys';
import { type LearnerPlayback, learnerPlaybackSchema, playbackErrorSchema } from '#/lib/admin-schemas';
import { type LessonRef, sameLessonRef } from '#/lib/lesson-ref';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';
import { PlaybackError } from '#/lib/video-providers/errors';

export const fetchLessonPlayback = async (
  { courseSlug, lessonSlug }: LessonRef,
  opts?: { fresh?: boolean; lang?: VideoLang },
): Promise<LearnerPlayback> => {
  const params = new URLSearchParams({
    lessonSlug,
    courseSlug,
    lang: opts?.lang ?? PRIMARY_VIDEO_LANG,
  });
  if (opts?.fresh) params.set('fresh', '1');
  const r = await fetch(`/api/lesson/playback?${params.toString()}`);
  if (!r.ok) {
    // (existing coded-error handling unchanged)
  }
  return learnerPlaybackSchema.parse(await r.json());
};

export type LessonPlaybackKey = LessonRef & { lang: VideoLang };

export const lessonPlaybackAtomFamily = atomFamily(
  (key: LessonPlaybackKey) =>
    atomWithQuery<LearnerPlayback>(() => ({
      queryKey: queryKeys.lessonPlayback(key, key.lang),
      queryFn: () => fetchLessonPlayback(key, { lang: key.lang }),
      enabled: !!key.lessonSlug && !!key.courseSlug,
      staleTime: 1000 * 60 * 30,
      gcTime: 1000 * 60 * 60,
      retry: 1,
      // A language switch changes the key. Keeping the previous language's
      // data during the fetch keeps the player mounted (and the playhead
      // capture in VideoPlayerContainer meaningful) instead of dropping to
      // the loading skeleton and back.
      placeholderData: keepPreviousData,
    })),
  (a, b) => sameLessonRef(a, b) && a.lang === b.lang,
);

export const refetchLessonPlaybackFresh = (
  queryClient: QueryClient,
  lesson: LessonRef,
  lang: VideoLang = PRIMARY_VIDEO_LANG,
) =>
  queryClient.fetchQuery({
    queryKey: queryKeys.lessonPlayback(lesson, lang),
    queryFn: () => fetchLessonPlayback(lesson, { fresh: true, lang }),
    retry: false,
  });
```

Keep every existing doc comment in that file; only the shown lines change.

`src/hooks/data/use-lesson-video.ts`:

```ts
import { useAtomValue } from 'jotai';
import { lessonPlaybackAtomFamily } from '#/atoms/lesson-video';
import type { LessonRef } from '#/lib/lesson-ref';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';

export const useLessonVideo = (
  lesson: LessonRef,
  lang: VideoLang = PRIMARY_VIDEO_LANG,
) => useAtomValue(lessonPlaybackAtomFamily({ ...lesson, lang }));
```

- [ ] **Step 4: Run to verify it passes and the tree typechecks**

Run: `pnpm vitest run src/atoms src/components/lesson-main && pnpm exec tsc --noEmit -p .`
Expected: PASS. tsc will flag `compute-lesson-main-state.ts`'s `VideoQueryShape.data: PlaybackResult` against `LearnerPlayback` only if it narrows — `LearnerPlayback` is assignable to `PlaybackResult`, so it should be clean; if not, change that field's type to `LearnerPlayback | undefined` (import from `#/lib/admin-schemas`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-schemas.ts src/hooks/data/keys.ts src/atoms/lesson-video.ts src/atoms/video-language.ts src/hooks/data/use-lesson-video.ts src/atoms/__tests__/lesson-video.test.ts
git commit -m "feat(learner): playback query keyed by language; persisted video-language preference"
```

---

### Task 7: `playbackToState` carries the language and labels the caption track

**Files:**
- Modify: `src/lib/video-providers/playback-to-state.ts`, `src/components/lesson-main/types.ts`
- Test: `src/lib/video-providers/__tests__/playback-to-state.test.ts`

**Interfaces:**
- Produces: `VideoFetchState` ready branch gains `lang: VideoLang; languages: VideoLang[]`. `playbackToState(result: (PlaybackResult & { lang?: VideoLang; languages?: VideoLang[] }) | undefined, onRetry)`.

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/video-providers/__tests__/playback-to-state.test.ts`:

```ts
  it('labels the caption track with the played language and carries the language list', () => {
    const state = playbackToState(
      { ...ready, lang: 'fr-CA', languages: ['en', 'fr-CA'] },
      vi.fn(),
    );
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.lang).toBe('fr-CA');
    expect(state.languages).toEqual(['en', 'fr-CA']);
    expect(state.tracks[0]).toMatchObject({ srcLang: 'fr-CA', label: 'Canadian French' });
  });

  it('defaults to English when a result carries no language (older callers)', () => {
    const state = playbackToState(ready, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.lang).toBe('en');
    expect(state.languages).toEqual(['en']);
  });
```

(Use the same display-name string Task 1's test settled on for `fr-CA`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/video-providers/__tests__/playback-to-state.test.ts`
Expected: FAIL — `state.lang` undefined / TS error on the extra fields.

- [ ] **Step 3: Implement**

`src/components/lesson-main/types.ts` — add to the `ready` branch, after `captionsUnavailable`:

```ts
      /** The language actually playing (`en` when the preference had no match). */
      lang: VideoLang;
      /** Every language this lesson offers, `en` first — drives the player's menu. */
      languages: VideoLang[];
```

with `import type { VideoLang } from '#/lib/video-languages';`.

`src/lib/video-providers/playback-to-state.ts`:

```ts
import {
  labelForLang,
  PRIMARY_VIDEO_LANG,
  type VideoLang,
} from '#/lib/video-languages';
// …
type PlaybackWithLanguage = PlaybackResult & {
  lang?: VideoLang;
  languages?: VideoLang[];
};

export const playbackToState = (
  result: PlaybackWithLanguage | undefined,
  onRetry: () => void,
): VideoFetchState => {
  // (unchanged fetching / pending branches)
  const lang = result.lang ?? PRIMARY_VIDEO_LANG;
  const languages = result.languages ?? [PRIMARY_VIDEO_LANG];
  const tracks: TrackProps[] = result.captions
    ? [
        {
          src: result.captions.vtt,
          srcLang: lang,
          label: labelForLang(lang),
          kind: 'subtitles',
          default: true,
        },
      ]
    : [];
  return {
    status: 'ready',
    src: result.url,
    kind: result.kind,
    poster: result.poster ?? undefined,
    tracks,
    captionsUnavailable: result.captions === null,
    lang,
    languages,
    onRetry,
  };
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/video-providers src/components/lesson-main && pnpm exec tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-providers/playback-to-state.ts src/components/lesson-main/types.ts src/lib/video-providers/__tests__/playback-to-state.test.ts
git commit -m "feat(player): ready video state carries lang and languages; caption track labelled by language"
```

---

### Task 8: `LanguageMenu` in the player

**Files:**
- Create: `src/components/video-player/parts/language-menu.tsx`
- Modify: `src/components/video-player/types.ts`, `labels.ts`, `video-player.tsx`
- Test: `src/components/video-player/__tests__/video-player.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type VideoLanguageOption = { code: string; badge: string; label: string };
  // VideoPlayerProps
  languages?: VideoLanguageOption[]; activeLanguage?: string;
  // VideoPlayerActions
  onLanguageChange?: (code: string) => void;
  // labels
  language: 'Language'
  ```

- [ ] **Step 1: Add the failing tests**

Append to `src/components/video-player/__tests__/video-player.test.tsx` (inside the `describe('VideoPlayer'`):

```ts
  const LANGS = [
    { code: 'en', badge: 'EN', label: 'English' },
    { code: 'fr-CA', badge: 'FR-CA', label: 'Canadian French' },
  ];

  it('hides the language menu when only one language is offered', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        languages={[LANGS[0]]}
        activeLanguage="en"
        actions={{ onLanguageChange: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: /language/i })).toBeNull();
  });

  it('names the active language on the trigger and calls onLanguageChange with the chosen code', async () => {
    const ref = createRef<HTMLVideoElement>();
    const onLanguageChange = vi.fn();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        languages={LANGS}
        activeLanguage="en"
        actions={{ onLanguageChange }}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Language: English' });
    expect(trigger.textContent).toContain('EN');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Canadian French/ }));
    expect(onLanguageChange).toHaveBeenCalledWith('fr-CA');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/video-player/__tests__/video-player.test.tsx`
Expected: the two new tests FAIL (unknown props / no trigger).

- [ ] **Step 3: Implement**

`src/components/video-player/types.ts` — add:

```ts
/** One entry of the player's language menu — already labelled, the player knows no codes. */
export type VideoLanguageOption = { code: string; badge: string; label: string };
```

add `onLanguageChange?: (code: string) => void;` to `VideoPlayerActions`; add `'language'` to `VideoPlayerLabelKey`; add to `VideoPlayerProps`:

```ts
  /** Languages this video is offered in. The menu renders only with two or more. */
  languages?: VideoLanguageOption[];
  /** `code` of the language currently playing. */
  activeLanguage?: string;
```

`src/components/video-player/labels.ts` — add `language: 'Language',` to `DEFAULT_LABELS`.

`src/components/video-player/parts/language-menu.tsx`:

```tsx
import { Menu } from '@base-ui/react/menu';
import { Languages } from 'lucide-react';
import type { VideoLanguageOption } from '../types';

type LanguageMenuProps = {
  languages: VideoLanguageOption[];
  active: string;
  label: string;
  onChange?: (code: string) => void;
};

/**
 * Same chrome as PlaybackRateMenu: an icon button carrying the short badge,
 * a popup listing every language with its full name and a check on the one
 * playing. The trigger's accessible name says which language is on.
 */
export const LanguageMenu = ({
  languages,
  active,
  label,
  onChange,
}: LanguageMenuProps) => {
  const current = languages.find((l) => l.code === active) ?? languages[0];
  return (
    <Menu.Root>
      <Menu.Trigger
        className="vp-icon-button vp-icon-button--text"
        aria-label={`${label}: ${current.label}`}
        disabled={!onChange}
      >
        <Languages size={20} aria-hidden="true" />
        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
          {current.badge}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8}>
          <Menu.Popup
            style={{
              background: 'var(--color-gray-1)',
              color: 'var(--color-gray-12)',
              borderRadius: 'var(--radius-md, 0.375rem)',
              padding: 4,
              boxShadow: '0 8px 24px var(--color-gray-a8)',
              minInlineSize: 180,
            }}
          >
            {languages.map((l) => (
              <Menu.Item
                key={l.code}
                onClick={() => onChange?.(l.code)}
                aria-current={l.code === active ? 'true' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingBlock: 6,
                  paddingInline: 8,
                  borderRadius: 4,
                  cursor: 'pointer',
                  background:
                    l.code === active ? 'var(--color-accent-a4)' : 'transparent',
                }}
              >
                <span aria-hidden="true" style={{ inlineSize: 14 }}>
                  {l.code === active ? '✓' : ''}
                </span>
                <span style={{ flex: 1 }}>{l.label}</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: 'var(--color-gray-11)',
                  }}
                >
                  {l.badge}
                </span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
```

`src/components/video-player/video-player.tsx` — destructure `languages` and `activeLanguage` from props (before `...nativeRest`, so they never reach the `<video>` element), import `LanguageMenu`, and render it immediately **before** `PlaybackRateMenu` in the controls row:

```tsx
          {languages && languages.length > 1 && a.onLanguageChange ? (
            <LanguageMenu
              languages={languages}
              active={activeLanguage ?? languages[0].code}
              label={labels.language}
              onChange={a.onLanguageChange}
            />
          ) : null}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/components/video-player && pnpm exec biome check src/components/video-player`
Expected: PASS, biome clean. If the `menuitem` query fails because Base UI's `Menu.Item` renders with a different role in jsdom, look at how the existing rate-menu test (if any) in this file queries it and mirror that; otherwise query by `screen.findByText('Canadian French')`.

- [ ] **Step 5: Commit**

```bash
git add src/components/video-player
git commit -m "feat(player): language menu beside the playback-rate menu"
```

---

### Task 9: Container pauses, captures and restores the playhead across a language swap

**Files:**
- Create: `src/components/video-player/restore-point.ts`
- Modify: `src/components/video-player/video-player-container.tsx`
- Test: `src/components/video-player/__tests__/restore-point.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RestorePoint = { time: number; resume: boolean };
  export const captureRestorePoint: (video: { currentTime: number; paused: boolean; pause: () => void }) => RestorePoint;
  export const applyRestorePoint: (video: { currentTime: number; duration: number; play: () => Promise<void> | void }, point: RestorePoint) => void;
  // VideoPlayerContainer prop
  onLanguageChange?: (code: string) => void;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/components/video-player/__tests__/restore-point.test.ts
import { describe, expect, it, vi } from 'vitest';
import { applyRestorePoint, captureRestorePoint } from '../restore-point';

describe('restore point', () => {
  it('pauses on capture so the playhead stops advancing while the swap is in flight, and remembers it was playing', () => {
    const pause = vi.fn();
    const point = captureRestorePoint({ currentTime: 42.5, paused: false, pause });
    expect(pause).toHaveBeenCalledOnce();
    expect(point).toEqual({ time: 42.5, resume: true });
  });

  it('does not resume a video that was already paused', () => {
    const point = captureRestorePoint({ currentTime: 3, paused: true, pause: vi.fn() });
    expect(point.resume).toBe(false);
  });

  it('seeks the new source to the captured time, clamped to its duration, and plays if it was playing', () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const video = { currentTime: 0, duration: 30, play };
    applyRestorePoint(video, { time: 42.5, resume: true });
    expect(video.currentTime).toBe(30);
    expect(play).toHaveBeenCalledOnce();
  });

  it('leaves a paused video paused', () => {
    const play = vi.fn();
    const video = { currentTime: 0, duration: Number.NaN, play };
    applyRestorePoint(video, { time: 12, resume: false });
    expect(video.currentTime).toBe(12);
    expect(play).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/video-player/__tests__/restore-point.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

```ts
// src/components/video-player/restore-point.ts
export type RestorePoint = {
  time: number;
  /** Whether to resume playback once the new source is seekable. */
  resume: boolean;
};

/**
 * Taken the moment BEFORE a source swap is requested. The media element
 * resets `currentTime` to 0 synchronously when its `src` changes, so this
 * cannot be read afterwards — and the swap itself waits on a network round
 * trip, so the video is paused here to keep the number honest.
 */
export const captureRestorePoint = (video: {
  currentTime: number;
  paused: boolean;
  pause: () => void;
}): RestorePoint => {
  const resume = !video.paused;
  video.pause();
  return { time: video.currentTime, resume };
};

/**
 * Applied on the new source's `loadedmetadata` — the seekable range is not
 * known before that, and an earlier `currentTime` assignment is discarded.
 */
export const applyRestorePoint = (
  video: {
    currentTime: number;
    duration: number;
    play: () => Promise<void> | void;
  },
  point: RestorePoint,
): void => {
  video.currentTime =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(point.time, video.duration)
      : point.time;
  if (point.resume) void Promise.resolve(video.play()).catch(() => {});
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/components/video-player/__tests__/restore-point.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the container**

In `src/components/video-player/video-player-container.tsx`:

1. Add to `ContainerProps`:
   ```ts
     /**
      * The learner picked another language. The container pauses and records
      * the playhead BEFORE calling this (see `restore-point.ts`); the caller's
      * job is to make a new `src` arrive, on whose `loadedmetadata` the
      * playhead is restored and playback resumed.
      */
     onLanguageChange?: (code: string) => void;
   ```
   and destructure it alongside `onSourceExpired`.
2. Import `applyRestorePoint, captureRestorePoint, type RestorePoint` from `./restore-point`.
3. Add a ref next to `pendingRestoreTimeRef`:
   ```ts
     // A language swap's restore point. Separate from `pendingRestoreTimeRef`
     // (the recovery path), which never resumes playback on its own — a
     // recovery from a fatal error should not auto-play, a language switch
     // should.
     const pendingLanguageRestoreRef = useRef<RestorePoint | null>(null);
   ```
4. In the `onLoadedMetadata` handler, before the existing `pendingRestoreTimeRef` logic:
   ```ts
         const langPoint = pendingLanguageRestoreRef.current;
         if (langPoint) {
           pendingLanguageRestoreRef.current = null;
           applyRestorePoint(video, langPoint);
           return;
         }
   ```
5. Add to the `actions` object:
   ```ts
       onLanguageChange: onLanguageChange
         ? (code) => {
             const v = videoRef.current;
             if (v) pendingLanguageRestoreRef.current = captureRestorePoint(v);
             onLanguageChange(code);
           }
         : undefined,
   ```
   (`undefined` keeps `VideoPlayer` from rendering the menu when no caller handles it.)

- [ ] **Step 6: Typecheck and run the player suite**

Run: `pnpm exec tsc --noEmit -p . && pnpm vitest run src/components/video-player`
Expected: clean and PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/video-player/restore-point.ts src/components/video-player/__tests__/restore-point.test.ts src/components/video-player/video-player-container.tsx
git commit -m "feat(player): a language switch pauses, then restores the playhead and resumes on the new source"
```

---

### Task 10: Wire the learner page: preference → query → player

**Files:**
- Modify: `src/components/lesson-main/lesson-main-wrapper.tsx`, `src/components/lesson-main/parts/lesson-player-container.tsx`

**Interfaces:**
- Consumes: `videoLanguageAtom` (Task 6), `useLessonVideo(lesson, lang)`, `refetchLessonPlaybackFresh(qc, lesson, lang)` (Task 6), `videoState.lang`/`languages` (Task 7), `VideoPlayerContainer`'s `languages`/`activeLanguage`/`onLanguageChange` (Tasks 8–9), `labelForLang`/`badgeForLang`/`isVideoLang` (Task 1).

- [ ] **Step 1: Wrapper reads the preference and keys the query by it**

In `lesson-main-wrapper.tsx`:

```ts
import { useAtomValue, useSetAtom } from 'jotai';
import { videoLanguageAtom } from '#/atoms/video-language';
// …
  const videoLang = useAtomValue(videoLanguageAtom);
  const video = useLessonVideo(lesson, videoLang);
// … in onRetryVideo:
      void refetchLessonPlaybackFresh(queryClient, lesson, videoLang).catch(() => {});
```

- [ ] **Step 2: Player container renders the menu and switches the preference**

In `parts/lesson-player-container.tsx`:

```ts
import { videoLanguageAtom } from '#/atoms/video-language';
import { badgeForLang, isVideoLang, labelForLang } from '#/lib/video-languages';
// …
  const setVideoLanguage = useSetAtom(videoLanguageAtom);
  const languageOptions = videoState.languages.map((code) => ({
    code,
    badge: badgeForLang(code),
    label: labelForLang(code),
  }));
  const onLanguageChange = useCallback(
    (code: string) => {
      if (isVideoLang(code)) setVideoLanguage(code);
    },
    [setVideoLanguage],
  );
```

and pass to `VideoPlayerContainer`:

```tsx
      languages={languageOptions}
      activeLanguage={videoState.lang}
      onLanguageChange={onLanguageChange}
```

- [ ] **Step 3: Typecheck, lint, run the lesson suites**

Run: `pnpm exec tsc --noEmit -p . && pnpm exec biome check src/components/lesson-main && pnpm vitest run src/components/lesson-main src/components/video-player src/atoms`
Expected: all clean/PASS.

- [ ] **Step 4: Manual check in the browser**

Start the dev server (`pnpm dev`, port 5001), open a lesson whose Synthesia video has an FR-CA twin (`CSPS AI Ethical Considerations`, id `16c1e1f9-…`; French id `e9eecce0-f228-4bc1-9c66-af6851605498`) — Task 13's admin UI is needed to attach it, so if that is not built yet, attach it via SQL for this check:

```sql
update lessons set other_video_ids = '[{"lang":"fr-CA","provider":"synthesia","ref":"e9eecce0-f228-4bc1-9c66-af6851605498"}]'
 where video_ref = '16c1e1f9-eae0-4ed1-aed9-d6d4e661d093';
```

Play to ~0:30, open the `EN` menu, pick Canadian French. Expected: the video pauses, swaps, resumes near 0:30 in French with French captions; the badge reads `FR-CA`; reloading the page plays French; a lesson without French plays English with no menu.

- [ ] **Step 5: Commit**

```bash
git add src/components/lesson-main
git commit -m "feat(lesson): the player's language menu switches the learner's persisted video language"
```

---

### Task 11: Admin read/upsert/remove of a lesson's alternate videos

**Files:**
- Modify: `src/db/admin.ts` (after `setLessonVideo`), `src/lib/admin-schemas.ts` (after `setLessonVideoInputSchema`)
- Create: `src/routes/api/admin/lessons.$lessonId.alternate-videos.ts`
- Test: `src/routes/api/admin/__tests__/lesson-alternate-videos-route.test.ts`

**Interfaces:**
- Consumes: `OtherVideoIdsSchema`, `OtherVideoIds` (Task 2); `upsertAlternate`, `removeAlternate`, `alternateLangSchema`, `AlternateLang` (Task 1); the existing `invalidateLessonPlaybackCache`, `invalidateAllCoursesForLesson`, `guard`-style permission helpers.
- Produces:
  ```ts
  // db/admin
  getLessonAlternateVideos(lessonId): Promise<OtherVideoIds | null>   // null = no such lesson
  setLessonAlternateVideo(lessonId, entry: OtherVideoId): Promise<{ id: number } | null>
  removeLessonAlternateVideo(lessonId, lang: AlternateLang): Promise<{ id: number } | null>
  // admin-schemas
  setLessonAlternateVideoInputSchema = OtherVideoIdSchema; removeLessonAlternateVideoInputSchema = { lang: alternateLangSchema }
  // route: GET → OtherVideoIds; PUT body OtherVideoId → { ok: true }; DELETE body { lang } → { ok: true }
  ```

- [ ] **Step 1: Write the failing route test**

```ts
// src/routes/api/admin/__tests__/lesson-alternate-videos-route.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    getDisciplineIdForLessonId: vi.fn(),
    getLessonAlternateVideos: vi.fn(),
    setLessonAlternateVideo: vi.fn(),
    removeLessonAlternateVideo: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({ ForbiddenError: m.ForbiddenError }));
vi.mock('#/lib/permissions.server', () => ({
  requireLessonContentPermission: m.requireLessonContentPermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({
  getDisciplineIdForLessonId: m.getDisciplineIdForLessonId,
}));
vi.mock('#/db/admin', () => ({
  getLessonAlternateVideos: m.getLessonAlternateVideos,
  setLessonAlternateVideo: m.setLessonAlternateVideo,
  removeLessonAlternateVideo: m.removeLessonAlternateVideo,
}));

import {
  deleteAlternateVideoHandler,
  getAlternateVideosHandler,
  putAlternateVideoHandler,
} from '../lessons.$lessonId.alternate-videos';

const json = (method: string, body: unknown) =>
  new Request('http://test/api/admin/lessons/10/alternate-videos', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const entry = { lang: 'fr-CA', provider: 'synthesia', ref: 'e9eecce0' };

beforeEach(() => {
  vi.clearAllMocks();
  m.getDisciplineIdForLessonId.mockResolvedValue({ found: true, disciplineId: 7 });
  m.requireLessonContentPermission.mockResolvedValue(undefined);
  m.absentResourceResponse.mockResolvedValue(new Response(null, { status: 404 }));
  m.getLessonAlternateVideos.mockResolvedValue([entry]);
  m.setLessonAlternateVideo.mockResolvedValue({ id: 10 });
  m.removeLessonAlternateVideo.mockResolvedValue({ id: 10 });
});

describe('GET', () => {
  it('lists the alternates under content:read on the lesson\'s discipline', async () => {
    const res = await getAlternateVideosHandler(new Request('http://test/x'), '10');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([entry]);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(expect.anything(), 7, 'read');
  });
});

describe('PUT', () => {
  it('upserts a valid entry under content:update', async () => {
    const res = await putAlternateVideoHandler(json('PUT', entry), '10');
    expect(res.status).toBe(200);
    expect(m.setLessonAlternateVideo).toHaveBeenCalledWith(10, entry);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(expect.anything(), 7, 'update');
  });

  it('400s an unknown lang or provider without writing', async () => {
    const res = await putAlternateVideoHandler(json('PUT', { ...entry, lang: 'FR' }), '10');
    expect(res.status).toBe(400);
    expect(m.setLessonAlternateVideo).not.toHaveBeenCalled();
  });

  it('403s without permission', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await putAlternateVideoHandler(json('PUT', entry), '10');
    expect(res.status).toBe(403);
    expect(m.setLessonAlternateVideo).not.toHaveBeenCalled();
  });
});

describe('DELETE', () => {
  it('removes by lang', async () => {
    const res = await deleteAlternateVideoHandler(json('DELETE', { lang: 'fr-CA' }), '10');
    expect(res.status).toBe(200);
    expect(m.removeLessonAlternateVideo).toHaveBeenCalledWith(10, 'fr-CA');
  });

  it('404s an unknown lesson', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValueOnce({ found: false });
    const res = await deleteAlternateVideoHandler(json('DELETE', { lang: 'fr-CA' }), '10');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/routes/api/admin/__tests__/lesson-alternate-videos-route.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Schemas**

In `src/lib/admin-schemas.ts`, after `setLessonVideoInputSchema`:

```ts
export const setLessonAlternateVideoInputSchema = OtherVideoIdSchema;
export type SetLessonAlternateVideoInput = z.infer<typeof setLessonAlternateVideoInputSchema>;
export const removeLessonAlternateVideoInputSchema = z.object({
  lang: alternateLangSchema,
});
```

Add `OtherVideoIdSchema` to the existing `#/types` import and `import { alternateLangSchema } from '#/lib/video-languages';`.

- [ ] **Step 4: DB functions**

In `src/db/admin.ts`, after `setLessonVideo`:

```ts
/**
 * A lesson's translated videos, for the Video tab. Same guard as the primary
 * ref (the route's content:read): a bare Mux ref is streamable, so this never
 * rides on a board or library payload. `null` for no such lesson.
 */
export async function getLessonAlternateVideos(
  lessonId: number,
): Promise<OtherVideoIds | null> {
  const [row] = await db
    .select({ otherVideoIds: lessonsTable.otherVideoIds })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId));
  if (!row) return null;
  // A column that fails the schema reads as empty rather than erroring the
  // tab: the admin's fix is to add rows, which overwrite it.
  const parsed = OtherVideoIdsSchema.safeParse(row.otherVideoIds);
  return parsed.success ? parsed.data : [];
}

async function writeLessonAlternateVideos(
  lessonId: number,
  next: (current: OtherVideoIds) => OtherVideoIds,
): Promise<{ id: number } | null> {
  const current = await getLessonAlternateVideos(lessonId);
  if (current === null) return null;
  const [updated] = await db
    .update(lessonsTable)
    .set({ otherVideoIds: next(current), updatedAt: sql`now()` })
    .where(eq(lessonsTable.id, lessonId))
    .returning({ id: lessonsTable.id, slug: lessonsTable.slug });
  if (!updated) return null;
  // The languages list rides on every cached playback entry, in every
  // language — see getLessonPlayback.invalidate.
  await invalidateLessonPlaybackCache(updated.slug);
  return { id: updated.id };
}

/** Attach (or replace) the video for one language. */
export function setLessonAlternateVideo(
  lessonId: number,
  entry: OtherVideoId,
): Promise<{ id: number } | null> {
  return writeLessonAlternateVideos(lessonId, (current) =>
    upsertAlternate(current, entry),
  );
}

export function removeLessonAlternateVideo(
  lessonId: number,
  lang: AlternateLang,
): Promise<{ id: number } | null> {
  return writeLessonAlternateVideos(lessonId, (current) =>
    removeAlternate(current, lang),
  );
}
```

Imports to add in `db/admin.ts`: `OtherVideoIdsSchema, type OtherVideoId, type OtherVideoIds` from `#/types`; `type AlternateLang, removeAlternate, upsertAlternate` from `#/lib/video-languages`.

- [ ] **Step 5: Route**

```ts
// src/routes/api/admin/lessons.$lessonId.alternate-videos.ts
import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import {
  getLessonAlternateVideos,
  removeLessonAlternateVideo,
  setLessonAlternateVideo,
} from '#/db/admin';
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  removeLessonAlternateVideoInputSchema,
  setLessonAlternateVideoInputSchema,
} from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

/**
 * Translated videos are lesson content, exactly like the primary ref — same
 * discipline-scoped guard as `lessons.$lessonId.video.ts`, and the same
 * "no such lesson" handling via `absentResourceResponse`.
 */
async function guard(
  request: Request,
  lessonId: number,
  action: 'read' | 'update',
): Promise<Response | null> {
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  try {
    await requireLessonContentPermission(request.headers, lookup.disciplineId, action);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

function parseLessonId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function getAlternateVideosHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId, 'read');
  if (denied) return denied;
  const rows = await getLessonAlternateVideos(lessonId);
  if (rows === null) return new Response('Not found', { status: 404 });
  return Response.json(rows);
}

export async function putAlternateVideoHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId, 'update');
  if (denied) return denied;
  const parsed = setLessonAlternateVideoInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid alternate video' }, { status: 400 });
  }
  const updated = await setLessonAlternateVideo(lessonId, parsed.data);
  if (!updated) return new Response('Not found', { status: 404 });
  return Response.json({ ok: true });
}

export async function deleteAlternateVideoHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId, 'update');
  if (denied) return denied;
  const parsed = removeLessonAlternateVideoInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid language' }, { status: 400 });
  }
  const updated = await removeLessonAlternateVideo(lessonId, parsed.data.lang);
  if (!updated) return new Response('Not found', { status: 404 });
  return Response.json({ ok: true });
}

export const Route = createFileRoute('/api/admin/lessons/$lessonId/alternate-videos')({
  server: {
    handlers: {
      GET: ({ request, params }) => getAlternateVideosHandler(request, params.lessonId),
      PUT: ({ request, params }) => putAlternateVideoHandler(request, params.lessonId),
      DELETE: ({ request, params }) => deleteAlternateVideoHandler(request, params.lessonId),
    },
  },
});
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm vitest run src/routes/api/admin/__tests__/lesson-alternate-videos-route.test.ts && pnpm exec tsc --noEmit -p .`
Expected: PASS; tsc clean. `routeTree.gen.ts` regenerates when the dev server runs — do **not** hand-edit it; if it is dirty after `pnpm dev` has run, include it in this commit (memory: `routeTree-watcher-trap`).

- [ ] **Step 7: Commit**

```bash
git add src/db/admin.ts src/lib/admin-schemas.ts 'src/routes/api/admin/lessons.$lessonId.alternate-videos.ts' src/routes/api/admin/__tests__/lesson-alternate-videos-route.test.ts src/routeTree.gen.ts
git commit -m "feat(admin): read, attach and remove a lesson's translated videos by language"
```

---

### Task 12: Admin data hooks

**Files:**
- Modify: `src/data-hooks/keys.ts`
- Create: `src/data-hooks/use-lesson-alternate-videos.ts`, `src/data-hooks/use-set-lesson-alternate-video.ts`, `src/data-hooks/use-remove-lesson-alternate-video.ts`
- Test: `src/data-hooks/__tests__/lesson-alternate-videos-hooks.test.ts`

**Interfaces:**
- Produces:
  ```ts
  dataKeys.lessonAlternateVideos(lessonId) => ['admin', 'lesson-alternate-videos', lessonId]
  useLessonAlternateVideos(lessonId: number, enabled: boolean): UseQueryResult<OtherVideoIds>
  useSetLessonAlternateVideo(): UseMutationResult<void, Error, { lessonId: number } & OtherVideoId>
  useRemoveLessonAlternateVideo(): UseMutationResult<void, Error, { lessonId: number; lang: AlternateLang }>
  ```

- [ ] **Step 1: Write the failing test**

Look at an existing hook test in `src/data-hooks/__tests__/` (e.g. the one for `use-set-lesson-video`) for how it renders hooks with a `QueryClientProvider` and stubs `fetch`; mirror that wrapper. The behaviours to pin:

```ts
// src/data-hooks/__tests__/lesson-alternate-videos-hooks.test.ts
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useLessonAlternateVideos } from '#/data-hooks/use-lesson-alternate-videos';
import { useRemoveLessonAlternateVideo } from '#/data-hooks/use-remove-lesson-alternate-video';
import { useSetLessonAlternateVideo } from '#/data-hooks/use-set-lesson-alternate-video';

const entry = { lang: 'fr-CA' as const, provider: 'synthesia' as const, ref: 'x' };
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [entry] }));
});

describe('useLessonAlternateVideos', () => {
  it('GETs the lesson\'s alternates and parses them', async () => {
    const { result } = renderHook(() => useLessonAlternateVideos(10, true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([entry]));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/admin/lessons/10/alternate-videos');
  });
});

describe('useSetLessonAlternateVideo', () => {
  it('PUTs the entry and invalidates the alternates list and every playback for the lesson', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSetLessonAlternateVideo(), { wrapper });
    await act(() => result.current.mutateAsync({ lessonId: 10, ...entry }));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/lessons/10/alternate-videos');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(entry);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dataKeys.lessonAlternateVideos(10) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dataKeys.lessonPlaybacks(10) });
  });
});

describe('useRemoveLessonAlternateVideo', () => {
  it('DELETEs by lang and invalidates the same keys', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRemoveLessonAlternateVideo(), { wrapper });
    await act(() => result.current.mutateAsync({ lessonId: 10, lang: 'fr-CA' }));
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'fr-CA' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dataKeys.lessonAlternateVideos(10) });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/data-hooks/__tests__/lesson-alternate-videos-hooks.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/data-hooks/keys.ts` — next to `lessonVideo`:

```ts
  /** A lesson's translated videos (`{ lang, provider, ref }[]`) — the Video tab's list. */
  lessonAlternateVideos: (lessonId: number) =>
    ['admin', 'lesson-alternate-videos', lessonId] as const,
```

`src/data-hooks/use-lesson-alternate-videos.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { type OtherVideoIds, OtherVideoIdsSchema } from '#/types';
import { dataKeys } from './keys';

/**
 * The translated videos attached to a lesson, per language. Guarded
 * server-side like the primary ref; `enabled` false when the lesson has no
 * primary video — an alternate without a primary has nothing to be an
 * alternate to, and the tab does not show the section.
 */
export function useLessonAlternateVideos(lessonId: number, enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.lessonAlternateVideos(lessonId),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<OtherVideoIds> => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/alternate-videos`);
      if (!res.ok) throw new Error(`Failed to load languages (${res.status})`);
      return OtherVideoIdsSchema.parse(await res.json());
    },
  });
}
```

`src/data-hooks/use-set-lesson-alternate-video.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OtherVideoId } from '#/types';
import { dataKeys } from './keys';

/** Attach (or replace) a lesson's video for one language, then refetch what shows it. */
export function useSetLessonAlternateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, ...entry }: { lessonId: number } & OtherVideoId) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/alternate-videos`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error(`Failed to add language (${res.status})`);
    },
    onSuccess: (_data, { lessonId }) => {
      queryClient.invalidateQueries({ queryKey: dataKeys.lessonAlternateVideos(lessonId) });
      // The languages list rides on every course's playback for this lesson.
      queryClient.invalidateQueries({ queryKey: dataKeys.lessonPlaybacks(lessonId) });
    },
  });
}
```

`src/data-hooks/use-remove-lesson-alternate-video.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AlternateLang } from '#/lib/video-languages';
import { dataKeys } from './keys';

export function useRemoveLessonAlternateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, lang }: { lessonId: number; lang: AlternateLang }) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/alternate-videos`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      if (!res.ok) throw new Error(`Failed to remove language (${res.status})`);
    },
    onSuccess: (_data, { lessonId }) => {
      queryClient.invalidateQueries({ queryKey: dataKeys.lessonAlternateVideos(lessonId) });
      queryClient.invalidateQueries({ queryKey: dataKeys.lessonPlaybacks(lessonId) });
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/data-hooks/__tests__/lesson-alternate-videos-hooks.test.ts && pnpm exec biome check src/data-hooks`
Expected: PASS, biome clean.

- [ ] **Step 5: Commit**

```bash
git add src/data-hooks
git commit -m "feat(admin): data hooks for a lesson's translated videos"
```

---

### Task 13: Admin Video tab — "Other languages" list and add form

**Files:**
- Create: `src/components/admin/lesson-config/alternate-videos-list.tsx`, `alternate-video-form.tsx`, `alternate-videos-container.tsx`
- Modify: `src/components/admin/lesson-config/video-section-container.tsx` (render the container under the URL row when `hasVideo`)
- Test: `src/components/admin/lesson-config/__tests__/alternate-videos-list.test.tsx`, `__tests__/alternate-video-form.test.tsx`

**Interfaces:**
- Consumes: hooks from Task 12; `detectVideoUrl`; `VIDEO_PROVIDERS`; `availableLanguages`, `labelForLang`, `alternateLangSchema`, `AlternateLang` (Task 1); `OtherVideoIds` (Task 2).
- Produces (presentational props):
  ```ts
  AlternateVideosList: { rows: { lang: AlternateLang; label: string; providerLabel: string; removing: boolean }[]; onRemove: (lang: AlternateLang) => void }
  AlternateVideoForm: { onSubmit: FormEventHandler<HTMLFormElement>; lang: AlternateLang | null; langOptions: { code: AlternateLang; label: string }[]; onLangChange: (code: AlternateLang) => void; registerUrl: UseFormRegisterReturn<'url'>; urlError?: string; detectedLabel: string | null; showUnsupported: boolean; isPending: boolean; serverError?: string }
  ```

- [ ] **Step 1: Write the failing render tests**

```tsx
// src/components/admin/lesson-config/__tests__/alternate-videos-list.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlternateVideosList } from '../alternate-videos-list';

describe('AlternateVideosList', () => {
  it('says so, in text, when no languages are attached', () => {
    render(<AlternateVideosList rows={[]} onRemove={vi.fn()} />);
    expect(screen.getByText(/no other languages yet/i)).toBeTruthy();
  });

  it('lists each language with its provider and removes by lang', async () => {
    const onRemove = vi.fn();
    render(
      <AlternateVideosList
        rows={[{ lang: 'fr-CA', label: 'Canadian French', providerLabel: 'Synthesia', removing: false }]}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('Canadian French')).toBeTruthy();
    expect(screen.getByText('Synthesia')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Canadian French' }));
    expect(onRemove).toHaveBeenCalledWith('fr-CA');
  });
});
```

```tsx
// src/components/admin/lesson-config/__tests__/alternate-video-form.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlternateVideoForm } from '../alternate-video-form';

const registerUrl = { name: 'url' as const, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() };
const base = {
  onSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()),
  lang: 'fr-CA' as const,
  langOptions: [{ code: 'fr-CA' as const, label: 'Canadian French' }],
  onLangChange: vi.fn(),
  registerUrl,
  detectedLabel: null,
  showUnsupported: false,
  isPending: false,
};

describe('AlternateVideoForm', () => {
  it('keeps Add disabled until a provider is detected', () => {
    render(<AlternateVideoForm {...base} />);
    expect((screen.getByRole('button', { name: 'Add language' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Add and names the detected provider', () => {
    render(<AlternateVideoForm {...base} detectedLabel="Synthesia" />);
    expect(screen.getByText('Detected: Synthesia')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add language' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('explains an unsupported URL', () => {
    render(<AlternateVideoForm {...base} showUnsupported />);
    expect(screen.getByText(/unsupported url/i)).toBeTruthy();
  });

  it('says why nothing can be added when every language is taken', () => {
    render(<AlternateVideoForm {...base} lang={null} langOptions={[]} />);
    expect(screen.getByText(/every supported language is attached/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add language' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/components/admin/lesson-config/__tests__/alternate-videos-list.test.tsx src/components/admin/lesson-config/__tests__/alternate-video-form.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Presentational list**

```tsx
// src/components/admin/lesson-config/alternate-videos-list.tsx
import { Trash2 } from 'lucide-react';
import type { AlternateLang } from '#/lib/video-languages';

type AlternateVideoRow = {
  lang: AlternateLang;
  label: string;
  providerLabel: string;
  removing: boolean;
};

interface AlternateVideosListProps {
  rows: AlternateVideoRow[];
  onRemove: (lang: AlternateLang) => void;
}

/** The languages a lesson's video is offered in besides English. Pure. */
export const AlternateVideosList = ({ rows, onRemove }: AlternateVideosListProps) => {
  if (rows.length === 0) {
    return (
      <p className="text-tertiary text-sm">
        No other languages yet — learners see this lesson in English only.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-gray-6 rounded-lg border border-gray-6">
      {rows.map((row) => (
        <li key={row.lang} className="flex items-center gap-3 px-3.5 py-2.5">
          <span className="rounded bg-gray-3 px-1.5 py-0.5 font-medium text-secondary text-xs uppercase">
            {row.lang}
          </span>
          <span className="min-w-0 flex-1 truncate text-primary text-sm">{row.label}</span>
          <span className="text-tertiary text-xs">{row.providerLabel}</span>
          <button
            type="button"
            onClick={() => onRemove(row.lang)}
            disabled={row.removing}
            aria-label={`Remove ${row.label}`}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
};
```

- [ ] **Step 4: Presentational form**

```tsx
// src/components/admin/lesson-config/alternate-video-form.tsx
import { Select } from '@base-ui/react/select';
import { CheckCircle2, ChevronDown, Loader2, Plus } from 'lucide-react';
import type { FormEventHandler } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '#/lib/cn';
import type { AlternateLang } from '#/lib/video-languages';

interface AlternateVideoFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** `null` once every supported language is attached. */
  lang: AlternateLang | null;
  langOptions: { code: AlternateLang; label: string }[];
  onLangChange: (code: AlternateLang) => void;
  registerUrl: UseFormRegisterReturn<'url'>;
  urlError?: string;
  detectedLabel: string | null;
  showUnsupported: boolean;
  isPending: boolean;
  serverError?: string;
}

/**
 * Language + URL/ID, saved on Add. The URL feedback mirrors VideoUrlForm's
 * so the same paste (share link, editor link, bare ID) behaves the same.
 */
export const AlternateVideoForm = ({
  onSubmit,
  lang,
  langOptions,
  onLangChange,
  registerUrl,
  urlError,
  detectedLabel,
  showUnsupported,
  isPending,
  serverError,
}: AlternateVideoFormProps) => {
  if (lang === null) {
    return (
      <p className="text-tertiary text-sm">
        Every supported language is attached. Remove one to replace its video.
      </p>
    );
  }
  const current = langOptions.find((o) => o.code === lang) ?? langOptions[0];
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Select.Root value={lang} onValueChange={(v) => onLangChange(v as AlternateLang)} disabled={isPending}>
          <Select.Trigger
            aria-label="Language"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-6 bg-gray-1 px-3 text-primary text-sm transition-colors hover:border-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60 sm:w-48"
          >
            <Select.Value>{() => current.label}</Select.Value>
            <Select.Icon className="ms-auto">
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner sideOffset={4} className="z-50">
              <Select.Popup className="max-h-72 overflow-auto rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg">
                {langOptions.map((o) => (
                  <Select.Item
                    key={o.code}
                    value={o.code}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
                  >
                    <Select.ItemText>{o.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            {...registerUrl}
            id="alternate-video-url"
            type="text"
            autoComplete="off"
            placeholder="Paste the translated video's URL or ID"
            aria-label="Translated video URL or ID"
            aria-invalid={!!urlError}
            aria-describedby="alternate-video-url-hint"
            className={cn(
              'h-10 min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 text-sm text-primary outline-none transition-colors duration-100 placeholder:text-tertiary',
              'focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9',
              urlError ? 'border-error-9' : 'border-gray-6 hover:border-gray-8',
            )}
          />
          {urlError ? (
            <p id="alternate-video-url-hint" role="alert" className="text-error-text text-sm">{urlError}</p>
          ) : detectedLabel ? (
            <p id="alternate-video-url-hint" aria-live="polite" className="flex items-center gap-1.5 text-sm text-success-text">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Detected: {detectedLabel}
            </p>
          ) : showUnsupported ? (
            <p id="alternate-video-url-hint" aria-live="polite" className="text-error-text text-sm">
              Unsupported URL — paste a Mux playback URL/ID or a Synthesia link/ID.
            </p>
          ) : (
            <p id="alternate-video-url-hint" className="text-tertiary text-sm">
              The same video, in {current.label}.
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!detectedLabel || isPending}
          className={cn(
            'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 font-medium text-apple-contrast text-sm',
            'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          Add language
        </button>
      </div>
      {serverError && (
        <p role="alert" className="rounded-lg border border-error-9/40 bg-error-9/15 px-3 py-2.5 text-error-text text-sm">
          {serverError}
        </p>
      )}
    </form>
  );
};
```

- [ ] **Step 5: Run the two render tests**

Run: `pnpm vitest run src/components/admin/lesson-config/__tests__/alternate-videos-list.test.tsx src/components/admin/lesson-config/__tests__/alternate-video-form.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Container**

```tsx
// src/components/admin/lesson-config/alternate-videos-container.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useLessonAlternateVideos } from '#/data-hooks/use-lesson-alternate-videos';
import { useRemoveLessonAlternateVideo } from '#/data-hooks/use-remove-lesson-alternate-video';
import { useSetLessonAlternateVideo } from '#/data-hooks/use-set-lesson-alternate-video';
import {
  type AlternateLang,
  alternateLangSchema,
  availableLanguages,
  labelForLang,
} from '#/lib/video-languages';
import { VIDEO_PROVIDERS } from '#/lib/video-providers';
import { detectVideoUrl } from '#/lib/video-providers/detect';
import { AlternateVideoForm } from './alternate-video-form';
import { AlternateVideosList } from './alternate-videos-list';

const formSchema = z.object({
  lang: alternateLangSchema,
  url: z.string().trim().min(1, 'Paste a video URL or ID'),
});
type FormValues = z.infer<typeof formSchema>;

interface AlternateVideosContainerProps {
  lessonId: number;
}

/**
 * The Video tab's "Other languages": the attached list and an add form.
 * Each add/remove saves immediately, like the primary URL field, and the
 * list refetches. The chosen language lives in the form (react-hook-form),
 * not an atom — it is the form's own draft and nothing else reads it.
 */
export const AlternateVideosContainer = ({ lessonId }: AlternateVideosContainerProps) => {
  const alternates = useLessonAlternateVideos(lessonId, true);
  const setAlternate = useSetLessonAlternateVideo();
  const removeAlternate = useRemoveLessonAlternateVideo();

  const used = (alternates.data ?? []).map((a) => a.lang);
  const options = availableLanguages(used).map((code) => ({ code, label: labelForLang(code) }));

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onSubmit',
    defaultValues: { lang: options[0]?.code ?? 'fr', url: '' },
  });
  const rawLang = form.watch('lang');
  // The default may have been taken by the time the list arrives; fall to
  // the first still-available code without an effect.
  const lang: AlternateLang | null =
    options.length === 0
      ? null
      : options.some((o) => o.code === rawLang)
        ? rawLang
        : options[0].code;
  const urlValue = form.watch('url');
  const detected = urlValue.trim() ? detectVideoUrl(urlValue) : null;

  const onSubmit = form.handleSubmit((values) => {
    const hit = detectVideoUrl(values.url);
    if (!hit || lang === null) return;
    setAlternate.mutate(
      { lessonId, lang, provider: hit.provider, ref: hit.ref },
      { onSuccess: () => form.reset({ lang: options.find((o) => o.code !== lang)?.code ?? lang, url: '' }) },
    );
  });

  const removingLang = removeAlternate.isPending ? removeAlternate.variables?.lang : undefined;

  return (
    <section aria-labelledby="alternate-videos-heading" className="flex flex-col gap-3">
      <h3 id="alternate-videos-heading" className="font-medium text-primary text-sm">
        Other languages
      </h3>
      {alternates.isError ? (
        <p role="alert" className="text-error-text text-sm">
          Couldn't load languages: {alternates.error.message}
        </p>
      ) : (
        <AlternateVideosList
          rows={(alternates.data ?? []).map((a) => ({
            lang: a.lang,
            label: labelForLang(a.lang),
            providerLabel: VIDEO_PROVIDERS[a.provider].label,
            removing: removingLang === a.lang,
          }))}
          onRemove={(l) => removeAlternate.mutate({ lessonId, lang: l })}
        />
      )}
      <AlternateVideoForm
        onSubmit={onSubmit}
        lang={lang}
        langOptions={options}
        onLangChange={(code) => form.setValue('lang', code)}
        registerUrl={form.register('url')}
        urlError={form.formState.errors.url?.message}
        detectedLabel={detected ? VIDEO_PROVIDERS[detected.provider].label : null}
        showUnsupported={urlValue.trim().length > 0 && !detected}
        isPending={setAlternate.isPending}
        serverError={setAlternate.error?.message ?? removeAlternate.error?.message}
      />
    </section>
  );
};
```

- [ ] **Step 7: Mount it in the Video tab**

In `video-section-container.tsx`, import `AlternateVideosContainer` and, inside the returned `<div className="flex flex-col gap-4">`, after the closing `</div>` of the thumbnail/URL row and before the `{hasVideo && (courseId === null ? …` block, add:

```tsx
      {hasVideo && <AlternateVideosContainer lessonId={lesson.id} />}
```

- [ ] **Step 8: Typecheck, lint, full admin suite, browser check**

Run: `pnpm exec tsc --noEmit -p . && pnpm exec biome check src/components/admin/lesson-config && pnpm vitest run src/components/admin`
Expected: clean, PASS.

In the browser (admin → a course board → lesson `CSPS AI Ethical Considerations` → Video tab): "Other languages" shows the empty line; pick Canadian French, paste `https://app.synthesia.io/#/video-edit/e9eecce0-f228-4bc1-9c66-af6851605498`, see "Detected: Synthesia", Add → the row appears with "Synthesia"; the learner page for that lesson now shows the `EN` menu with Canadian French. Remove → row gone, learner menu gone after reload.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/lesson-config
git commit -m "feat(admin): Video tab lists a lesson's translated videos and attaches one per language"
```

---

### Task 14: Full verification

- [ ] **Step 1:** `pnpm exec tsc --noEmit -p . && pnpm exec biome check src && pnpm vitest run` — all green, no new warnings.
- [ ] **Step 2:** Re-read the spec's four sections and tick each against the code: data shape (Task 2), curated list + `Intl.DisplayNames` (1), admin list/add/remove with immediate save (11–13), `?lang=` + fallback + `languages` on the response (3–5), lang-labelled captions (7), persisted global preference (6, 10), menu hidden with only `en` (8), playhead carried across the swap (9).
- [ ] **Step 3:** Confirm nothing ships alternates to learners: `grep -rn otherVideoIds src/routes/api/course src/lib/course-details-shape.ts` still strips the field; the learner playback body has only `lang`/`languages`.
