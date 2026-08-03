# Shared understanding: student news API

## Goal

A read endpoint that serves one course's scraped news to a subscribed student,
filtered by that student's muted sources, plus the endpoint that mutes and
unmutes a source. This is the consumer the previous two pieces were built for.

Follows [course-scoped-news-sources.md](./course-scoped-news-sources.md) and
[news-scraping-cron.md](./news-scraping-cron.md).

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |
| 1   | Scope | API only. The News page stays a `SectionStub`. | Owner's call. Dissent recorded under Accepted risks. |
| 2   | Honour student preferences | Yes — the feed filters on muted sources. | Owner's call, overriding a recommendation to defer until a picker exists. |
| 3   | Preference key | `(userId, newsSourceId)`, unchanged. **The open item from the first ledger is resolved, not deferred.** | `news_sources.course_id` is NOT NULL and a source belongs to exactly one course, so `newsSourceId` already determines the course. `(userId, courseId, newsSourceId)` would be denormalized. |
| 4   | Row semantics | A row is an **exclusion** — the student muted that source. No rows means the full feed. | The inherited inclusion model ("empty means all") cannot express "show me nothing": unticking every source yields zero rows, which reads as "show everything". Exclusion has no ambiguous state and needs no `customized` flag. |
| 5   | Write endpoint | In scope. Mute/unmute one source for the signed-in student. | A read filter with no writer can never be exercised — the same dead-code shape as the previous pieces, one level down. |
| 6   | Inactive sources | Excluded from the feed. | Otherwise flipping a source to Hidden in admin leaves up to 7 days of its stories on the student page. |
| 7   | Retention window | The read applies its own 7-day `firstSeenAt` window. | Defence in depth: the reader must not depend on the cron's sweep having run. |
| 8   | Duplicate handling | Resolve the cluster at read time. Group by `COALESCE(dedupe_of_id, id)`; return the best **visible** member (active source, not muted, in window), ordered by source rank. | A flat `dedupe_of_id IS NULL` makes muting one source silently delete another source's coverage of the same story, invisibly. Dedup promises "you see this once", not "only if you kept the source we picked". |
| 9   | Ordering | Effective published date descending, ties broken by source rank ascending, then id. | Matches the old app's day-then-rank ordering; the id keeps it deterministic. |
| 10  | Payload | `{ articles, sources, lastUpdatedAt, adminBypass }` in one response. | Shipping `sources` beside `articles` is what stops the picker showing a source as unmuted while the feed has already dropped it. |
| 11  | Article shape | `id`, `title`, `description`, `url`, `imageUrl`, `publishedAt`, `publishedAtEstimated`, `source {id, name, imageUrlAvif, imageUrlWebp, tintColor}`, `alsoCoveredBy [{id, name}]`. | `publishedAtEstimated` must reach the client or the UI renders a discovery time as a publication time — the flag exists for exactly that. `alsoCoveredBy` is free once clusters are computed. |
| 12  | Pagination | None. Hard `LIMIT 300` as a backstop, logged if it trips. | Bounded by construction at ~`sources × 3 × 7`; ten sources tops out near 210 rows. |
| 13  | Freshness | `lastUpdatedAt` = most recent `firstSeenAt` among visible articles. | The cheapest way to notice a dead cron. Without it, the first symptom of a broken scraper is an empty page a week later with nothing to say whether that is a bug or a quiet news week. |
| 14  | Per-source scrape status | **Not** exposed to students. | "AVweb's robots.txt disallows crawling" is an admin's operational fact; to a learner it is noise about a system they cannot affect, and it advertises which sources are misconfigured. |
| 15  | Auth | Session via `auth.api.getSession`; the helper re-checks `isSubscribedToCourse` rather than trusting the route guard. | Exactly `getLibraryForUser`'s posture — the API is independently reachable. |
| 16  | Admin bypass | Admins read any course's feed without a subscription; `adminBypass` is returned, not swallowed. | Matches `LibraryResponse`. A silent bypass makes the feature untestable. |
| 17  | Mute authorization | The source must belong to a course the caller is subscribed to (or the caller is admin). A single 404 covers both "no such source" and "not yours". | Distinguishing them lets a student enumerate other courses' sources — the same reasoning as the course-slug redirect in `_authed/course.$courseSlug.tsx`. |
| 18  | Mute idempotency | Insert `onConflictDoNothing`, delete by `(userId, newsSourceId)`. Both directions succeed when already in the target state. | The unique index already exists; a double-tap must not 500. |
| 19  | Caching | No server-side cache. | The response is per-user (muted flags change the body), so a per-course cache would be wrong, and a per-user cache buys nothing over a bounded indexed query. |
| 20  | Schema changes | **None.** Only the doc comment on `userNewsSourcesTable` changes, to record exclusion semantics and drop the resolved OPEN note. | The key was already correct; exclusion is a reinterpretation, not a migration. |

## Files

- `src/lib/news-schemas.ts` — wire schemas, mirroring `library-schemas.ts`.
- `src/lib/news.server.ts` — `getNewsForUser`, `setSourceMuted`. Imported **only** by API routes. (`library.server.ts` proves this is safe from an API route; the `.server.ts` build trap applies to page routes with `beforeLoad`, which this is not.)
- `src/db/news-feed.ts` — the clustered query.
- `src/routes/api/course/news.ts` — `GET`.
- `src/routes/api/course/news.mute.ts` — `POST`.

## Failure behaviour

| Scenario | What happens | Caller sees |
| -------- | ------------ | ----------- |
| Not signed in | No query runs | `401` |
| `courseSlug` missing | No query runs | `400` |
| Course does not exist | — | `404` |
| Signed in, not subscribed, not admin | No article query runs | `200` with empty `articles`, empty `sources` |
| Course has no sources | — | `200`, `sources: []` — the client can say "no sources configured yet" rather than "no news" |
| Sources exist, cron never ran | — | `200`, `articles: []`, `lastUpdatedAt: null` |
| Student muted every source | — | `200`, `articles: []`, every `sources[].muted === true` — honestly empty, which the inclusion model could not express |
| Cron has been dead for days | Stale articles, then empty | `lastUpdatedAt` visibly old |
| Story's winning copy is muted or inactive | Cluster resolves to the next visible member | The story still appears, attributed to the source the student kept |
| Every source covering a story is muted/inactive | Cluster has no visible member | Story absent — correct, the student follows nobody who ran it |
| Mute a source from another course | Nothing written | `404` |
| Mute an already-muted source | `onConflictDoNothing` | `200` |
| Unmute a source that was never muted | Delete matches nothing | `200` |
| Article count exceeds 300 | Truncated at the limit | `200`, and a server-side warn naming the course |

## Accepted risks

- **Still no consumer.** Third piece in a row shipping without one. The chain is now four layers deep and has never run end to end — nothing is migrated, the cron has never executed, and no source exists. My dissent, recorded and dropped.
- **Preference filtering serves zero users** until a picker UI exists. Mitigated by shipping the write endpoint, so it is at least exercisable by hand.
- **Cluster resolution is unproven against real data** — with 0 articles, the window function's behaviour is only covered by tests using fabricated rows.
- **`LIMIT 300` truncates silently to the client**, loudly only in server logs.
- **Muting is per-source, not per-story.** A student cannot hide one article.

## Assumed (not confirmed)

- No data-hook (`use-course-news.ts`) in this piece — it would be dead code without the page. Wire schemas are exported so the hook is a thin wrapper later.
- Mute endpoint takes `{ sourceId, muted: boolean }` rather than separate mute/unmute routes.
- `alsoCoveredBy` lists only sources visible to this student, not every source in the cluster — naming a source they muted would be a small leak of what they chose to hide.
- `articles[].url` is `canonicalUrl`; `originalUrl` stays server-side as a debugging aid.
- A non-subscriber gets empty arrays rather than 403, matching `getLibraryForUser`'s "empty list is a truthful answer" posture.

## Out of scope

| Parked | What brings it back |
| ------ | ------------------- |
| The News page | Next piece |
| Source picker UI | Next piece; the write endpoint is ready for it |
| "Also covered by" display | The page; the data is already on the wire |
| Per-article hide/save/bookmark | A product decision, not a gap |
| Mobile app consumption | If `airmanship-mobile` is pointed at this database |

## Open

| Deferred decision | Trigger |
| ----------------- | ------- |
| Client `staleTime` and refetch policy | The data-hook, built with the page |
| Whether an empty feed needs a server-supplied reason string | If the page's empty states cannot be derived from `sources` + `lastUpdatedAt` alone |
| Whether to surface a "source unavailable" hint | If `no_links_found` proves common enough that students notice a source going quiet |
