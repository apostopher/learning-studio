# Shared understanding: course-scoped news sources

## Goal

`news_sources` is currently a global catalogue inherited from `airmanship-web`, with
no reader anywhere in rmtp-studio — the News route is a `SectionStub`. Scope it to a
course so each course owns a sandboxed set of sources, and give admins a way to
manage them from the course edit modal.

Schema and admin CRUD only. The scraper, the cron, the Redis cache, and the News
page itself stay out.

## Decisions

| #   | Decision                                        | Chosen                                                                                                                             | Rationale                                                                                                                       |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope                                           | Schema + admin CRUD. No scraper, cron, or News page.                                                                                 | A `courseId` with no write path is a dead column; the scraper blocks nothing and is a much bigger lift.                           |
| 2   | Model                                           | `courseId` column on `news_sources`. Each course sandboxed. No join table, no cross-course sharing.                                  | Owner's call, reversing an earlier join-table decision. Dissent recorded under Accepted risks.                                    |
| 3   | Nullability                                     | `courseId integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE`                                                                 | "Sandboxed" and "no global" both imply it. Nullable would create rows no course lists and nothing can reach.                      |
| 4   | Global sources                                  | No such concept. Every source belongs to exactly one course.                                                                         | An outlet relevant to several courses is entered per course.                                                                     |
| 5   | Uniqueness                                      | Drop `unique(url)`. Add `unique(course_id, url)`.                                                                                    | Same feed twice in one course is always a mistake; the DB is the only thing that can catch two admins racing.                     |
| 6   | `rank` / `active`                               | Stay on `news_sources` (they are already per-row, and a row is now per-course).                                                      | Falls out of the sandboxed model.                                                                                                |
| 7   | Admin surface                                   | New section in the existing `SectionedConfigModal` in `EditCourseDialogContainer`, alongside Onboarding and Video integrations.       | Section owns its own save, matching the other sections.                                                                          |
| 8   | CRUD shape                                      | Create, edit, delete, reorder — all scoped to the open course. No picker, no attach/detach.                                           | There is no shared catalogue to attach from.                                                                                     |
| 9   | Delete                                          | Permanent, immediate. Nothing else references the row.                                                                               | Safe by construction under the sandboxed model — deleting from course A cannot affect course B.                                  |
| 10  | Logo                                            | Upload via `ImageUploadFieldContainer`. Replace `imageURL` with `imageUrlAvif` / `imageUrlWebp`; render via `OptimizedPicture`.       | Hotlinked publisher logos rot silently and leak learner IPs to the publisher. Matches `courses` and `modules`. Table is empty.    |
| 11  | Blob sweep                                      | Same commit: add `'news-sources/'` to `SWEPT_PREFIXES` **and** collect news-source image URLs in `sweepOrphanBlobs`.                  | The function's own comment: sweep a prefix without gathering its references and live blobs get deleted. Both halves or neither.   |
| 12  | v1 form fields                                  | `name`, `url`, image upload, `tintColor`, `active`. `selectors` deferred, column kept with a comment naming the scraper.              | Tint is verifiable when set. A CSS selector is not, with no scraper to test against; empty selectors degrade to whole-page scrape. |
| 13  | Reordering                                      | Drag-reorder using the existing midpoint mutation (`src/db/admin.ts:603`). Create at `max + 1`.                                       | Rank is what orders the feed; no reorder means reaching for SQL. Reuses the module/lesson pattern rather than inventing one.       |
| 14  | Rank precision                                  | Widen `rank` from `numeric(10, 5)` to `numeric(30, 15)`, matching modules and lessons.                                                | Midpoint splits exhaust 5 decimal places after ~17 drags between the same neighbours, then ranks collide silently. Free now.       |
| 15  | URL validation                                  | Zod at write time: valid URL, `http` or `https` only, reject loopback / private / link-local hosts, trim before storing.              | The scraper will fetch this server-side months later with no review between write and fetch. Owner allowed `http` alongside `https`. |
| 16  | Auth                                            | Every news-source server fn self-guards with `requireAdmin`.                                                                          | Existing project convention.                                                                                                     |
| 17  | Data flow                                       | TanStack Query data-hooks for all reads/writes, jotai for modal state, react-hook-form + zod resolver for the form.                    | Project standard.                                                                                                                |

## Failure behaviour

| Scenario                                              | What happens                                                                                     | User sees                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| URL already exists in this course                     | `unique(course_id, url)` rejects; server maps the constraint violation to a field error.           | Field-level error on the URL input: "This course already has a source with this URL." Form stays open, input intact. |
| URL is malformed, non-`http(s)`, or a private host    | Zod rejects before the write.                                                                      | Field-level error on the URL input naming the reason.                                          |
| Image upload fails mid-dialog                         | Upload field surfaces the error; form cannot submit without an image.                              | Inline error on the image field, retry available.                                              |
| Admin uploads an image then abandons the dialog       | Blob is orphaned; `sweepOrphanBlobs` deletes it after the grace period.                            | Nothing.                                                                                       |
| Course deleted while another admin has the modal open | `ON DELETE CASCADE` removes the sources; the mutation 404s.                                        | Error state in the section; modal closes on dismissal.                                         |
| Two admins reorder simultaneously                     | Last write wins, same as modules and lessons.                                                      | The loser's ordering is replaced on next refetch. No warning.                                  |
| Course has no sources yet                             | Empty list.                                                                                        | Empty state explaining what a news source is and how to add the first one.                     |
| Delete pressed                                        | Row deleted immediately, list refetches.                                                           | Confirmation prompt first, then the row disappears. No undo.                                   |
| Mutation fails (network, 500)                         | React Query surfaces the error, cache untouched.                                                   | Toast, and the form retains its input.                                                         |

## Accepted risks

- **Duplicate scraping.** Three courses tracking AVweb means three rows and three LLM-backed scrapes of the same page. Owner's decision (Q9); my dissent recorded and dropped.
- **Fragmented per-outlet data.** The same outlet in two courses is two unrelated rows — editing one does not touch the other. Follows from the sandboxed model.
- **Free-form `tintColor`.** Nothing constrains it to a contrast-safe value. Whatever the future News page renders against it could fall below AA. To be handled when that page is built, not here.
- **Last-write-wins on concurrent admin edits.** No optimistic locking, consistent with modules and lessons.
- **Admin surface is trusted** beyond the URL scheme/host guard. An admin can still point a source at any public page.

## Decided during implementation

| Decision | Chosen | Rationale |
| --- | --- | --- |
| Cropper aspect ratio | `ImageCropper` / `ImageUploadField` / `ImageUploadFieldContainer` gained optional `aspect`, `fit` and `subjectLabel` props, defaulting to the existing 16:9 cover behaviour. News sources pass `aspect={1}`, `fit="contain"`, `subjectLabel="logo"`. | The crop frame was hardcoded to 16:9 in three places. Forcing a publication wordmark into a 16:9 crop either letterboxes or clips it. Additive props keep course and module covers byte-identical. |
| Reorder neighbour validation | `reorderNewsSource` verifies both neighbours belong to the course before writing, and only then computes the midpoint in SQL. | Passing a neighbour id from another course makes the rank subquery return NULL; `rank` is NOT NULL, so the write would have died as an unhandled 500. Computing the midpoint in JS instead would cap split depth at double precision — the exact exhaustion the widened column removes. |
| PATCH carries two payload shapes | One endpoint; presence of `prevSourceId`/`nextSourceId` selects the reorder branch, checked before the field parse. | A reorder payload has no `name`, so parsing fields first would reject every drag as a validation error. |

## Assumed (not confirmed)

- Delete uses a lightweight confirmation prompt, **not** the typed `"permanently delete"` phrase from `DeleteConfirmForm` — a news source is three fields and a logo, cheap to recreate. (Q6's answer was voided by the Q9 reversal.)
- `active` defaults to `true` on create.
- Section is titled "News sources" and sits after "Video integrations" in the modal.
- Reordering persists immediately, with no explicit save, matching module reorder.
- The `active` toggle's off state states what it means and how to reverse it, per the project's locked-state rule.
- Existing `newsSourcesTable` rows: assumed none. rmtp-studio's `DATABASE_URL` (`ep-flat-voice`) is a different Neon endpoint from `OLD_DATABASE_URL` (`ep-still-cake`), there is no news seed, and no code in this repo reads the table. **Verify the table is empty before running the migration** — `NOT NULL` and the dropped `unique(url)` both depend on it.

## Out of scope

| Parked                                       | What brings it back                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Scraper, cron, Redis cache, News page UI     | A separate piece of work, once sources exist to scrape.                       |
| `userNewsSourcesTable` changes               | See Open below.                                                               |
| `selectors` editing UI                       | When the scraper lands and can validate a selector.                           |
| Cross-course / global sources                | See Open below.                                                               |

## Open

| Deferred decision                                                                                          | Trigger                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Is `user_news_sources` keyed `(userId, newsSourceId)` or `(userId, courseId, newsSourceId)`? Its current "no rows = user gets everything" convention is unsafe once sources are course-scoped. | The first commit that **reads** user news preferences. Table gets a comment saying so; it is otherwise untouched here. |
| `selectors` input shape.                                                                                    | Scraper ported into rmtp-studio.                                                                            |
| Many-to-many sources.                                                                                       | Duplicate-URL scrape cost becomes measurable, or a source needs to differ per course beyond `rank`/`active`. |
