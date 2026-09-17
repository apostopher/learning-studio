# Video languages — design

Date: 2026-09-17

## Problem

Synthesia lessons are being translated (the account holds 87 `XX - Title`
translated videos; e.g. `CSPS AI Ethical Considerations` has an `FR-CA`
twin). The learner player only ever plays the English video. The Synthesia
API does not link a root video to its translations' IDs
(`GET /v2/translations/{id}` returns languages, not video IDs), so the app
has to be told which video is which.

Speed and captions already exist in the player (`PlaybackRateMenu`,
`CaptionsButton`) and are out of scope.

## Decisions

- **Explicit assignment.** An admin attaches each translated video to the
  lesson by language. No title-based auto-discovery.
- **Curated language list.** `VIDEO_LANGUAGES` in code (BCP-47 codes
  Synthesia uses); display names via `Intl.DisplayNames`. The primary video
  is always `en`.
- **Alternates stay server-secret**, like `videoRef`. Learners receive only
  the list of available language codes per lesson.
- **Global preference.** A learner's chosen language is a persisted jotai
  atom that applies to every lesson that has that language.

## Data

`lessons.other_video_ids` (jsonb, already exists, every row is `[]`, nothing
reads it) keeps its name and column; its element shape becomes:

```ts
{ lang: VideoLang; provider: ProviderId; ref: string }
```

`OtherVideoIdSchema` in `src/types.ts` changes accordingly; the old
`{ lang: 'FR' | 'JP', videoId: url }` shape is dropped, not migrated. One
row per language (enforced by the write path and the schema's refinement).

`src/lib/video-languages.ts`:

```ts
export const PRIMARY_VIDEO_LANG = 'en';
export const VIDEO_LANGUAGES = ['fr', 'fr-CA', 'es', 'de', 'pt-BR', 'ja', 'zh', 'tr', 'af', 'ar', 'hi'] as const;
export const videoLangSchema = z.enum([PRIMARY_VIDEO_LANG, ...VIDEO_LANGUAGES]);
export type VideoLang = z.infer<typeof videoLangSchema>;
export const labelForLang = (code: VideoLang) => string; // Intl.DisplayNames('en'), falls back to the code
export const badgeForLang = (code: VideoLang) => string; // 'EN', 'FR', 'FR-CA'
```

## Admin — Video tab

Shown under the existing URL row, only once the lesson has a primary video:

- **"Other languages"** list: one row per alternate — language name,
  provider label, Remove button. Empty state: one quiet line.
- **Add form**: language `<select>` (codes not yet used) + URL/ID input with
  the same `detectVideoUrl` feedback as the primary field, and an "Add"
  button disabled until detection succeeds. Saves immediately (same pattern
  as `setLessonVideo`), then the list refetches.
- Server functions (each self-guarded with `requireAdmin`, per memory):
  `getLessonAlternateVideos(lessonId)`, `setLessonAlternateVideo({ lessonId, lang, provider, ref })`
  (upsert by lang), `removeLessonAlternateVideo({ lessonId, lang })`.
- Data hooks: `useLessonAlternateVideos`, `useSetLessonAlternateVideo`,
  `useRemoveLessonAlternateVideo`, invalidating the alternates query and
  the lesson's playback query.

## Playback

- `resolveLessonPlayback(lessonSlug, courseId, lang)`. For `en` the current
  path. Otherwise the alternate row is read from `other_video_ids`; missing
  lang → `null` (the route's uniform 403). Resolved via `resolvePlayback`
  with the course's credentials for **that row's** provider. Redis cache key
  includes the lang.
- The playback response adds `languages: VideoLang[]` — `['en', ...alternate langs]`,
  always in `VIDEO_LANGUAGES` order — so the menu renders on first load.
- `/api/lesson/playback` accepts `?lang=`; invalid or absent → `en`.
- `playbackToState` labels the caption track with the played lang
  (`srcLang`, `label`) instead of the hard-coded English.

## Player

- `videoLanguageAtom = atomWithStorage<VideoLang>('video-language', 'en')`.
- Effective language for a lesson = preference if in `languages`, else `en`.
  The preference itself is never rewritten by a lesson that lacks it.
- `LanguageMenu` presentational part (Base UI `Menu`, styled like
  `PlaybackRateMenu`): trigger shows `badgeForLang(active)`; items show
  badge + `labelForLang`, check on the active one. Not rendered when only
  `en` is available.
- Switching sets the atom; the playback query key includes the lang, so the
  container receives a new `src`. `VideoPlayerContainer` carries
  `currentTime` and `paused` across a `src` change on the same lesson
  (extending the existing `pendingRestoreTimeRef` mechanism), so the learner
  resumes in place.
- Milestones are per lesson, not per video: no change.

## Testing

- `video-languages.test.ts`: `labelForLang`, `badgeForLang`, schema.
- `types` / write path: one row per lang, provider must be a known id.
- `lesson-playback.test.ts`: `lang` picks the alternate row and that row's
  provider creds; unknown lang → null; cache key includes lang.
- `playback-to-state.test.ts`: track label follows the lang.
- `language-menu` render test: items, active check, hidden with only `en`.
- Container test: switching language calls the player with the previous
  `currentTime` restored — asserting on what the consumer received.
- Admin: `compute-*` style pure helper for "codes still available" +
  a render test for the list/add form.
