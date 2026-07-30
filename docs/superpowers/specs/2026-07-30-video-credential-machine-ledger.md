# Shared understanding: video provider credential machine

## Goal

Model the per-course video-provider credential lifecycle as an XState machine so
the Video tab and the course-edit dialog stop hand-rolling divergent copies of
the same flow, and so "the stored key no longer works" becomes a first-class
state the admin can act on instead of an opaque 500.

The interview was cut short at the second question ("build the credential
machine"), so most rows below are **my defaults, not your decisions**. Everything
in _Assumed_ is individually vetoable.

## What was built

| File                                              | What                                                            |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `src/atoms/credential.ts`                         | `credentialKey`, save-error and rejection atom families         |
| `src/machines/credential-machine.ts`              | The machine + injected implementations + error message mapping  |
| `src/machines/__tests__/credential-machine.test.ts` | 15 tests, all passing                                         |

Steps 1–2 added the presentational layer and rewired the course dialog:

| File                                                | What                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `lesson-config/credential-notice.tsx`               | Info / error notice (no Base UI equivalent exists)                |
| `lesson-config/credential-summary.tsx`              | Stored-key line + `formatCredentialDisplay`                       |
| `lesson-config/credential-not-connected.tsx`        | `absent.idle` row                                                 |
| `lesson-config/credential-provider-row.tsx`         | Card chrome per provider                                          |
| `lesson-config/credential-fields.ts`                | Shared per-provider field builder (never memoize — see its docs)  |
| `lesson-config/credential-flow-container.tsx`        | One actor per course+provider; no chrome of its own               |
| `admin/course-video-integrations-container.tsx`      | Now thin: owns the query, maps providers, wraps each in a card     |
| `lesson-config/video-section-container.tsx`          | Credential half deleted (−101 lines), delegates to the flow        |
| `lesson-config/provider-credential-form.tsx`         | Gained optional `onCancel`                                        |

The container is surface-agnostic — it returns a bare fragment, so the course
dialog wraps it in `CredentialProviderRow` while the Video tab drops it into an
existing panel. Two props tune it per surface: `openFormImmediately` (Video tab —
the admin is already blocked on the key, so skip "Not connected") and
`allowRemove` (course dialog only — deletion affects every lesson).

Step 4 made `rejected` reachable end to end:

| File                                              | What                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `lib/video-providers/errors.ts`                   | `PlaybackError` + the three failure codes, shared by server and client   |
| `integrations/synthesia/videos.ts`                | `SynthesiaRequestError` carries the HTTP status                          |
| `lib/video-providers/resolve.server.ts`           | Classifies provider failures into codes                                  |
| `routes/api/admin/lessons.$lessonId.video-playback.ts` | 502 + `code`; named handler export so it is testable              |
| `data-hooks/use-lesson-video-playback.ts`         | Rethrows as `PlaybackError`; no retry on a refused key                   |
| `lesson-config/video-preview.tsx`                 | `onForbidden` for the Mux case                                           |
| `atoms/admin.ts`                                  | `videoPlaybackForbiddenAtom`                                             |

Note on imports: new files use `#/…`, not `@/…`. Vitest cannot resolve the `@/`
alias, so anything in a tested module's import graph must use `#/`
(`provider-how-to.tsx` and `admin-schemas.ts` were switched for this reason).

```
loading ──LOADED──▶ absent{idle, form, saving}
                └─▶ configured{summary, editing, saving}
                      │ PROVIDER_REJECTED
                      ▼
                    rejected{notice, editing, saving}
```

## Verified, as asked

**Credentials are encrypted safely.** `src/lib/crypto.server.ts` uses
AES-256-GCM with a fresh `randomBytes(12)` IV per encryption and a verified auth
tag, stored as a `{v,iv,tag,ct}` envelope in `course_video_providers.secrets`
(jsonb). The key comes from `CREDENTIALS_ENCRYPTION_KEY`, declared in the
**server-only** block of `createEnv` (`env.ts:85`) and asserted to be 32 raw
bytes at module load. Plaintext never leaves the server: the client receives only
`{provider, configured: true, display, lastValidatedAt}`, and credential inputs
are write-only, never prefilled. No notes.

## Decisions

| #   | Decision                                | Chosen                                                                                                     | Rationale                                                                                                                                                       |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Machine scope                           | Credential lifecycle only; video-URL entry untouched                                                       | The credential is course-scoped and long-lived; the video ref is lesson-scoped. Fusing them drags a course resource into a lesson modal's reset logic.           |
| 2   | Where flow data lives                   | jotai atom families; **no** XState context                                                                 | Matches `authLoginMachine`, the only other machine in this codebase.                                                                                             |
| 3   | Atom key                                | `${courseId}:${provider}`                                                                                  | The course dialog renders every provider at once; a provider-only key would leak one provider's save error into another's banner.                                 |
| 4   | `rejected` as a state, not just a flag  | Real top-level state                                                                                       | The UI branches on state, so it cannot render a healthy-looking summary over a dead key; and "a successful save clears the rejection" becomes a testable transition. |
| 5   | Cancel returns to origin                | `saving`/`editing` duplicated inside `configured` and `rejected`                                            | Explicit sibling targets beat history states for readability and testability. Cost: one repeated 12-line invoke block.                                            |
| 6   | Failed update returns to `editing`      | Not to `summary`                                                                                           | Falling back to `summary` would discard the typed key and orphan the error from the field that caused it.                                                        |
| 7   | Validation stays in the container       | Machine receives pre-validated values                                                                      | Field-level errors have to route through react-hook-form's `setError` to land on the right input; the machine can't do that.                                     |
| 8   | Provider error copy                     | Rewrite recognised 401/403 into actionable text; pass anything else through verbatim                        | "Synthesia returned 401" is accurate and useless. Flattening _everything_ into a generic message would hide real validation feedback.                            |
| 9   | Course dialog disclosure (step 2, yours) | Drop the accordion; explicit Connect / Update key buttons, machine gains `absent.idle`                      | The chevron and the Update key button were two affordances for one action. `EDIT` now means "open the form" identically on both surfaces, and `expandedVideoProviderAtom` is deleted. Several providers can now be edited at once. |
| 10  | Form-open derivation                    | `isCredentialFormOpen` / `isCredentialSaving` exported from the machine module                              | The container resets its RHF form on the closed→open edge; `saving` must count as open or a failed save wipes the typed key. Extracting it makes that invariant testable without a DOM. |
| 11  | Failed credentials query                | Treated as "we don't know", not "no key"                                                                   | `data` is `undefined` for both, and claiming "Not connected" would prompt the admin to re-enter a key they already have.                                          |
| 12  | Playback failure taxonomy (step 4)      | Three codes — `PROVIDER_AUTH_REJECTED`, `VIDEO_NOT_AVAILABLE`, `PROVIDER_UNAVAILABLE` — on a 502; 404 still means "nothing configured" | All three previously arrived as an identical unhandled 500, so a revoked key was indistinguishable from a deleted video. `code`, not the status, is the contract. |
| 13  | Mux revocation detected client-side     | `VideoPreview.onForbidden`, from hls.js's 401/403                                                            | Mux JWTs are signed locally, so the server never learns a key was revoked — Mux only rejects the token at its edge when the browser fetches the manifest.        |
| 14  | No retry on a refused credential        | `retry: false` for `PROVIDER_AUTH_REJECTED`                                                                  | Nothing changes until the admin enters a new key; retrying only delays the prompt telling them to.                                                                |

## Failure behaviour

| Scenario                                        | What happens                                                        | Admin sees                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| First save refused by provider (401/403)        | `absent.saving` → `absent.form`, save-error atom set                | "That key was refused by the provider. Check you copied it in full and that it hasn't been revoked." |
| First save fails for another reason             | Same transition, message passed through                             | The provider's own message, e.g. "Signing key ID must be 16 characters"                            |
| Update fails                                    | `configured.saving` → `configured.editing`, typed values preserved  | Error banner above the still-open form                                                             |
| Stored key revoked at the provider              | `configured.summary` → `rejected.notice`                            | "The stored key is no longer accepted by the provider (…). Enter a new key to restore playback."   |
| Replacement key also refused                    | `rejected.saving` → `rejected.editing`                              | Both the rejection notice **and** the save error                                                   |
| Replacement key accepted                        | `rejected.saving` → `configured.summary`, rejection cleared         | Clean summary, no stale banner                                                                     |
| Key removed elsewhere (other tab, course dialog) | `configured`/`rejected` → `absent`, rejection cleared               | Back to the how-to + setup form                                                                    |
| Refetch lands mid-edit                          | `LOADED` ignored in `editing`/`saving`                              | Nothing — the form is not yanked away                                                              |
| Rejection arrives mid-edit                      | `PROVIDER_REJECTED` ignored outside `summary`                       | Nothing — they are already fixing it                                                               |

## Assumed (not confirmed)

1. **One machine, two surfaces.** Built to be rendered by both the Video tab
   (first-time setup, in the moment of discovery) and the course dialog
   (rotation). If you'd rather the Video tab only deep-link to course settings,
   the machine still works — you'd just render fewer of its states.
2. **`PROVIDER_REJECTED` is ignored unless in `configured.summary`.** Rationale:
   an admin already typing a replacement doesn't need to be told the old key is
   bad. Cheap to widen to the whole `configured` parent.
3. **`LOADED` is ignored while editing or saving.** A concurrent refetch will not
   destroy a half-typed key. Consequence: if the key is removed in another tab
   mid-edit, the admin's save re-creates it (the unique index makes it an upsert).
4. **Delete is not in the machine.** The course dialog's Remove button stays a
   plain mutation; the resulting `LOADED{configured:false}` drives the machine to
   `absent`. No confirmation step was added.
5. **Info-bar copy** for the update form, for when the UI is wired:
   _"A key is already saved for this course. Saving a new one replaces it — the
   existing key can't be shown again."_ Replaces the vaguer "there is already a
   key configued".
6. **No optimistic UI, no retry/backoff on save.** One attempt, explicit error,
   admin retries by pressing the button.

## Open

| Deferred                                                                                                                                                                                                                                                    | Trigger that forces it                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Safari cannot detect a revoked Mux key.** Client-side detection reads the HTTP status off hls.js's error event. Browsers that play HLS natively (Safari/WebKit) surface a `MediaError` with no status, so a revoked key there still looks like a broken video. | Someone reports a stuck preview on Safari. A fix means probing the manifest URL with `fetch` before handing it to the player. |
| **`lastValidatedAt` is written on save and never refreshed.** Now labelled "saved" rather than "verified" in the new UI, so it no longer overclaims — but it is still not driven by real validation.                                                            | Wanting a proactive "your key expired" signal instead of a reactive one.        |
| **Rejection is session-local.** Nothing persists that a key was refused, so the `rejected` state is rediscovered on each playback attempt and the course dialog (which never attempts playback) never shows it.                                                | Wanting the course dialog to flag dead keys, which needs a column on `course_video_providers`. |

## Accepted risks

- **The row container has no render test.** This repo's vitest setup ends up
  with two React copies once real hooks run under the react-compiler transform
  (`Invalid hook call` → `Cannot read properties of null (reading 'useCallback')`),
  so a hook-driven container cannot be mounted. `config-section-container` only
  passes because its single hook is mocked away. Mitigation: the risky logic
  (`isCredentialFormOpen`) was extracted to a pure helper and is tested against
  a real actor, mutation-verified. The remaining untested surface is JSX
  branching on `state.matches`, which `tsc` covers for shape but not behaviour.
- **`formatCredentialDisplay` renders `apiKeyLast4` as "Api Key Last 4".**
  Carried over verbatim so the refactor changes nothing visible. It is clumsy
  copy and worth fixing separately.

- **Key rotation bricks every credential.** `SecretEnvelope.v` is carried but
  never read, so rotating `CREDENTIALS_ENCRYPTION_KEY` makes every stored secret
  undecryptable with no fallback. Worse, `credentialDisplay` calls `schema.parse`
  on the decrypted blob, so **one** undecryptable row 500s the entire credentials
  list for that course rather than degrading that one entry.
- **`course_video_providers` is in no migration.** It exists only in `schema.ts`,
  applied via `pnpm db:push`. `db:migrate` alone will not create it.
- **Playback URLs are bearer capabilities.** The signed Mux URL and the
  pre-signed Synthesia download URL let anyone holding the JSON stream until
  `expiresAt`.
- **`expiresAt` is inconsistent across providers.** Mux returns an absolute epoch
  second; Synthesia returns _seconds remaining_. Both are typed
  `expiresAt: number | null`.
- ~~**A second, unauthenticated Synthesia path exists.**~~ — session gate added
  to `src/routes/api/lesson/video.ts` (any signed-in user; the only caller sits
  under `routes/_authed/`, so no learner behaviour changed). **Still open:**
  authenticated ≠ authorized — any signed-in user can request any `videoId` in
  the Synthesia account, and the route still uses the global
  `env.SYNTHESIA_API_KEY` rather than the per-course encrypted credential.
  Failures are deliberately uniform so it is not an enumeration oracle.
- ~~**`expiresAt` is dead and internally inconsistent.**~~ — fixed: renamed to
  `expiresInSeconds` (a TTL, not a timestamp) so both providers agree, and it is
  now *consumed* rather than dead. Mux returns `MUX_TTL_SECONDS`; Synthesia's
  seconds-remaining is clamped to ≥ 0. `playbackRefetchDelayMs` drives
  `refetchInterval`, so a mounted preview re-resolves a minute before its URL
  dies. `VideoPreview`'s effect keys on the URL rather than the object identity,
  so a refetch returning the same URL no longer remounts the player.
  **Residual:** a TTL at or below the 30s polling floor is re-resolved at or just
  after expiry (one failed segment before recovery). No provider in use issues
  URLs that short — Mux is 1h, Synthesia hours. Also relative-vs-absolute means
  the value is only meaningful next to the time it was received; react-query's
  `dataUpdatedAt` supplies that if anything ever needs the absolute deadline.
- **Mux `display` exposes the full `keyId`** unredacted (an identifier, not a
  secret) where Synthesia exposes only `apiKeyLast4`.

None of the above is caused by this change; all predate it.

## Out of scope

- Video URL entry / detection flow (`videoDraftDetectionAtom`, `videoReplaceModeAtom`).
- Playback signing and caching.
- ~~Fixing the `credentialFields` `useMemo` bug in `video-section-container.tsx`~~
  — resolved in step 3: the offending code was deleted along with the rest of
  that container's duplicated credential handling.
