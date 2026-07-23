# Onboarding Questions Auto-Save

**Date:** 2026-07-23
**Status:** Approved design, pending implementation plan

## Goal

Replace the onboarding section's manual **Save** button with **auto-save**:
debounce edits and save automatically, and flush a final best-effort save when
the dialog closes (or the page unloads) using `navigator.sendBeacon`. Extend the
update data-hook with a reusable `fireAndForget` mode.

Builds on the shipped course-onboarding feature (`CourseOnboardingContainer`,
`useUpdateCourseOnboarding`, `courses.$courseId.onboarding` route).

## Resolved decisions

- **Manual Save button → removed**, replaced by an auto-save status
  (`Saving…` / `All changes saved` / `Couldn't save — Retry`).
- **Save-on-close scope:** container unmount (dialog close / tab-away) **and**
  browser `pagehide` (tab/window close, navigation).
- **Debounce:** 800 ms after the last edit.
- **Save verb:** consolidate to **POST** (full replace) so `sendBeacon` (POST-only)
  can be used; drop PUT.
- **fireAndForget:** `method === 'POST' && navigator.sendBeacon` → `sendBeacon`;
  else `fetch` (with `keepalive` when fire-and-forget). Both paths run through the
  same TanStack Query `useMutation`.

## Architecture & files

### Route (modify)
- `src/routes/api/admin/courses.$courseId.onboarding.ts`: rename the save handler
  `putOnboardingHandler → postOnboardingHandler` and expose it as `POST` (same
  admin-guard + `parseCourseId` + `OnboardingQuestionsSchema.safeParse(body.questions)`
  + `updateCourseOnboarding` full-replace logic). GET unchanged. Remove PUT.
- Its test (`course-onboarding-route.test.ts`): PUT cases → POST (same assertions).

### Shared request helper (new)
- `src/data-hooks/save-json.ts`:
  ```ts
  export interface SaveJsonArgs<T> {
    url: string;
    method: 'POST' | 'PUT';
    body: unknown;
    fireAndForget?: boolean;
    parse?: (json: unknown) => T;
  }
  export async function saveJson<T>(args: SaveJsonArgs<T>): Promise<T | undefined>;
  ```
  Behavior: when `fireAndForget && method === 'POST'` and `navigator.sendBeacon`
  exists, send a `Blob([JSON.stringify(body)], { type: 'application/json' })` via
  `navigator.sendBeacon(url, blob)`; if it returns `true`, resolve `undefined`
  (best-effort, no response to parse). Otherwise `fetch(url, { method, headers:
  { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive:
  Boolean(fireAndForget) })`; throw on `!res.ok`; return `parse?(await res.json())`.
- Test (`save-json.test.ts`): fireAndForget+POST+sendBeacon → `sendBeacon` called
  with url + a Blob, no `fetch`, resolves undefined; fireAndForget when
  `sendBeacon` absent → `fetch` with `keepalive: true`; normal → `fetch` POST,
  parses, throws on non-ok.

### Data-hook (modify)
- `src/data-hooks/use-update-course-onboarding.ts`: mutation variables become
  `{ questions: OnboardingQuestion[]; fireAndForget?: boolean }`. `mutationFn`
  calls `saveJson({ url, method: 'POST', body: { questions }, fireAndForget,
  parse: (j) => OnboardingQuestionsSchema.parse(j) })`; for the fire-and-forget
  (beacon) path `saveJson` resolves `undefined`, so return `questions`
  optimistically. `onSuccess` invalidates `dataKeys.courseOnboarding(courseId)`.
- Test: normal → POST fetch + parse + invalidate; fireAndForget → `sendBeacon`
  used (mocked), no fetch, mutation resolves.

### Container (modify) — `src/components/admin/course-onboarding-container.tsx`
- Keep `useCourseOnboarding` seed + RHF `useForm`/`useFieldArray`. Drop the
  manual `onSave`/`handleSubmit`/`toast` Save flow.
- **Refs:** `lastSavedRef` (JSON of last-persisted questions, seeded from
  `query.data` when it loads) and `currentRef` (latest questions, updated on every
  watched change) so unmount/`pagehide` handlers read fresh values.
- **Debounced auto-save:** subscribe to form changes (`form.watch`/`useWatch`);
  on change update `currentRef`, then (800 ms debounce via a `setTimeout` ref) if
  `current !== lastSavedRef` call `update.mutate({ questions })`; `onSuccess` set
  `lastSavedRef = current`.
- **Flush-on-close:** a `flush()` that clears the debounce timer and, when
  `currentRef !== lastSavedRef`, calls `update.mutate({ questions, fireAndForget:
  true })`. Wire it to: the effect cleanup (unmount) and a `pagehide` window
  listener (added/removed in the same effect).
- **Status (derived, no `useState`):** `update.isPending → 'saving'`; else
  `update.isError → 'error'`; else `current !== lastSaved → 'unsaved'`; else
  `'saved'`. Pass to the editor; `onRetry` re-fires `update.mutate({ questions })`.

### Editor (modify) — `src/components/admin/onboarding-questions-editor.tsx`
- Replace the Save button with a status line: `saving` → spinner + "Saving…";
  `saved`/`unsaved` → "All changes saved" (muted); `error` → "Couldn't save —"
  + a **Retry** button (`onRetry`). Props: drop `isSaving`/`isDirty`/`onSave`,
  add `status: 'saving' | 'saved' | 'unsaved' | 'error'` and `onRetry`.

## UX & states

- Typing/adding/removing/reordering triggers a debounced save 800 ms later; the
  status shows "Saving…" then "All changes saved". Typing is never interrupted
  (no `form.reset` during auto-save).
- Closing the dialog / leaving the tab / closing the browser flushes a final
  `sendBeacon` save if there are unsaved changes.
- On failure the status shows "Couldn't save — Retry"; Retry re-attempts. The
  next debounced change also retries naturally.

## Risks / notes

- **Auth on beacon:** `sendBeacon` sends same-origin cookies, so the better-auth
  session reaches `requireAdmin` — verify no header-only CSRF check blocks a
  cookie-authenticated POST (the guard reads the session cookie, so it should pass).
- **Body size:** `sendBeacon`/`keepalive` bodies cap ~64 KB; ≤50 questions ×
  ≤2000 chars can approach but rarely exceed this — acceptable edge case, the
  normal debounced fetch (no cap) covers the common path.
- **Duplicate final save:** the flush compares `current !== lastSaved`, so it
  no-ops when the last debounced save already persisted the current state.

## Testing

- `saveJson` unit test (beacon vs fetch vs keepalive-fallback).
- Route handler test (POST replaces PUT).
- Hook test (normal POST + fireAndForget beacon).
- The container's debounce/unmount/`pagehide` wiring is hook-based → not
  render-tested (repo's react-compiler+Vitest constraint); covered by the util +
  hook tests and a live browser check. Extract no new render-tested component.

## Out of scope

- Offline queue / retry-with-backoff beyond the simple Retry action.
- Per-field save granularity (the whole array is saved as a unit).
- Changing the learner-facing side (still none).
