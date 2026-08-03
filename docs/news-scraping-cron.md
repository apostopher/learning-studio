# Shared understanding: daily news scraping cron

## Goal

A daily Vercel cron that walks every row in `news_sources`, extracts a few recent
articles from each, deduplicates stories several sources covered, and writes the
result to Postgres for a course's News page to read later.

Builds on [course-scoped-news-sources.md](./course-scoped-news-sources.md) —
sources are sandboxed per course, so articles are too.

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |
| 1   | Store of record | Postgres `news_articles`, course-scoped, with a `vector(3072)` embedding column. Redis is a scrape cache only, never the store. | Dedup needs a queryable store with vector similarity; pgvector is already wired. A table makes reruns idempotent and lets a failed run degrade to yesterday's news instead of an empty page. |
| 2   | Retention | Delete rows whose `firstSeenAt` is older than 7 days, in the same cron run. | Owner's requirement. Keyed on `firstSeenAt`, never `publishedAt` — see #7. |
| 3   | What the AI does | Extracts **candidate article links** from the index page. Nothing else. | Every site's HTML differs, so link extraction genuinely needs a model. Title/image/description/date are structured facts on the article page; a model asked for them can hallucinate undetectably. |
| 4   | Article metadata | OG / Twitter Card / JSON-LD meta tags on each article page, via `extractSocialMeta`-style parsing ported from `airmanship-web`. | Structured, verifiable, and the only reliable way to get a per-article **image**. |
| 5   | "Top 3" | The 3 most recently published per source, computed deterministically from dates. Not a model judgment. | Reproducible run to run, explainable to the admin, and no second model call. |
| 6   | Timestamps | `firstSeenAt` (always set) + `publishedAt` (nullable, from meta tags) + `publishedAtEstimated` boolean. Rank on `publishedAt ?? firstSeenAt`. | The old repo dropped undated articles outright, so a publisher omitting dates contributed nothing, forever, silently. |
| 7   | Retention predicate | `firstSeenAt`. | Only timestamp guaranteed present and monotonic. On `publishedAt`, an undated article is immortal and one dated `1970-01-01` is deleted on arrival. |
| 8   | Dedup scope | Within a course, for display. Separately, the **scrape** is cached by URL across courses. | Nobody sees two courses at once. But two courses tracking AVweb are two rows with one URL — fetching and AI-parsing it twice a day is pure waste. |
| 9   | Dedup layer 1 | Canonical URL match: strip `utm_*` and fragments, honour `<link rel="canonical">` (already in hand from the OG fetch). | Collapses syndicated reprints for free, before any embedding call. |
| 10  | Dedup layer 2 | Cosine similarity over `title + description` embeddings (`gemini-embedding-001`, 3072 dims), threshold **0.85** to start. | Two publishers covering one FAA rule change write different headlines, so string matching fails. This is the case the whole feature is for. |
| 11  | Threshold tuning | Log every near-miss in the 0.75–0.85 band. | The threshold is a guess until real hauls exist. Logging makes it tunable in a week instead of permanently arbitrary. |
| 12  | Dedup survivor | Across runs, **first-seen wins**. Within a single run, ties break on the source's `rank` in that course (lower rank wins). Losers are kept with `dedupeOfId` set, not deleted. | Letting a better-ranked source retroactively displace an article already shown would rewrite yesterday's feed under the reader. Reusing `rank` needs no new UI. Keeping losers makes a wrong merge diagnosable and leaves room for "also covered by Flying". |
| 13  | Timeout strategy | Explicit `maxDuration` on the route; run works to ~80% of it as a wall-clock budget; sources processed **stalest first** via a new `lastScrapedAt`. Skipped sources are `console.warn`ed by name. | A timeout is the failure that reports nothing — killed mid-flight, some sources written, some not. Staleness ordering turns data loss into a self-correcting delay and stops the last source being starved daily. |
| 14  | Extracted-link guard | Every model-returned link must pass `isBlockedNewsHost` **and** match the source's registrable domain. | The model reads an attacker-influencable page and hands back URLs the server then fetches. Same-domain collapses the injection surface to "a host we already trusted". |
| 15  | Fetch hardening | `AbortSignal.timeout`, ~2MB response ceiling enforced **while streaming**, `content-type: text/html` check before parsing. | `res.text()` on a hostile or broken endpoint buffers until the function dies. |
| 16  | `robots.txt` | Respected. Checked once per domain per run, verdict cached in Redis 24h. | Asymmetric downside: a training company disregarding publishers' stated wishes is a bad story, and the practical version is a silent IP block. |
| 17  | Per-source status | `lastScrapeStatus` + `lastScrapeMessage` on `news_sources`: `ok`, `blocked_by_robots`, `fetch_failed`, `no_links_found`, `no_dated_articles`. | Otherwise every distinct failure presents identically as an empty feed and the admin can only guess. Natural home for a future "not crawling: robots.txt disallows it" notice. |
| 18  | Article images | Hotlinked from the publisher's `og:image`, rendered `referrerpolicy="no-referrer"` + `loading="lazy"` with a fallback. | Unlike a source logo (set once, must live years), a thumbnail lives 7 days and an `og:image` exists to be embedded. Copying would re-arm the `SWEPT_PREFIXES` hazard for rot that cannot happen inside a week. |
| 19  | Model | `geminiFlash` for link extraction, `gemini-embedding-001` for dedup embeddings. | Matches what the old repo used (`gemini-2.5-flash`) and what `src/ai/embeddings.ts` already uses. Link extraction is a cheap structured-output task. |
| 20  | Failure isolation | Per-source `try`/`catch`; one source failing never aborts the run or other sources. | Carried over from `scrapeAllLinks`. |

## Schema changes

**New `news_articles`:** `id`, `courseId` (NOT NULL, cascade), `newsSourceId` (NOT
NULL, cascade), `canonicalUrl`, `originalUrl`, `title`, `description`,
`imageUrl` (nullable), `publishedAt` (nullable), `publishedAtEstimated`,
`firstSeenAt`, `embedding vector(3072)`, `dedupeOfId` (self-ref, nullable),
`createdAt`. Unique on `(courseId, canonicalUrl)`; index on
`(courseId, publishedAt DESC)` and on `firstSeenAt` for the cleanup sweep.

**`news_sources` gains:** `lastScrapedAt`, `lastScrapeStatus`,
`lastScrapeMessage`.

**New dependencies:** `cheerio`, `robots-parser`, `p-limit` — none currently in
this repo.

## Failure behaviour

| Scenario | What happens | Admin/user sees |
| -------- | ------------ | --------------- |
| Source's `robots.txt` disallows crawling | Source skipped, no fetch | `lastScrapeStatus = blocked_by_robots` |
| Index page 404s / times out / DNS fails | That source skipped, run continues | `lastScrapeStatus = fetch_failed` with the reason |
| Index page renders links client-side | Model finds nothing in the server HTML | `lastScrapeStatus = no_links_found` |
| Model returns an off-domain or private-host link | Link discarded before any fetch | Nothing; counted in logs |
| Article page exceeds 2MB or isn't HTML | That article skipped | Nothing; other articles unaffected |
| No article on a source has a usable date | Ranked by `firstSeenAt`, `publishedAtEstimated` set | Feed populated; dates read as "found today" |
| Run exceeds its time budget | Stops cleanly; unprocessed sources are stalest, so next run takes them first | `console.warn` naming skipped sources |
| Cron retried while a run is in flight | `unique(courseId, canonicalUrl)` upsert makes inserts idempotent | Nothing |
| Every source fails | Yesterday's rows are still present (cleanup only removes >7d) | Feed shows slightly stale news, not an empty page |
| A source is deleted in admin | `ON DELETE CASCADE` removes its articles | Feed shrinks immediately |

## Accepted risks

- **Duplicate scraping across courses is avoided, duplicate _storage_ is not.** Two courses tracking AVweb store two copies of the same article. Follows from the sandboxed model; storage is trivial at this scale.
- **JS-rendered index pages will simply not work.** Many modern news sites ship an empty shell. Surfaced as `no_links_found` rather than fixed — headless rendering is a different order of infrastructure.
- **Dedup threshold is unvalidated** until real data exists. Near-miss logging is the mitigation, not a fix.
- **Hotlinked images can 404 or be hotlink-blocked**; the UI degrades to no thumbnail.
- **Storing publisher titles and descriptions** is standard aggregator behaviour, but it is republishing third-party snippets. Deliberate.
- **Model cost grows linearly with sources** — one flash call per source per day plus ~3 embeddings. At 100 sources that is still small; the time budget, not the bill, is the binding constraint.
- **Nothing reads `news_articles` yet.** The News page is still a `SectionStub`. This is the second feature in a row that produces data with no consumer; if the News page slips, this cron burns model spend to fill a table nobody queries.

## Assumed (not confirmed)

- Cron runs daily at 04:00 UTC (offset from `blob-sweep`'s 03:00 so they don't contend).
- Concurrency: `pLimit(3)` for sources and for article fetches, matching the old repo.
- Candidate links capped at 20 per source before fetching, as the old repo did; top 3 selected after metadata resolution, so a dateless or failed fetch doesn't cost a slot.
- Cleanup runs at the **end** of the same cron, after writes, so a failed scrape never deletes without replacing.
- Scrape cache TTL ~20h in Redis, keyed by canonical source URL.
- `lastScrapeStatus` is not surfaced in the admin UI in this piece of work — the column is written, the display comes with the News page.

## Out of scope

| Parked | What brings it back |
| ------ | ------------------- |
| News page UI (still `SectionStub`) | The next piece of work; it is what makes this table worth filling |
| `user_news_sources` keying decision | Still open from the previous ledger — forced by the first commit that reads user preferences |
| `selectors` admin UI | Now unblocked, since the scraper exists and can validate a selector — but deliberately not in this scope |
| Relevance-ranked "top 3" via a second AI pass | If recency-ordered feeds prove low-quality for a course |
| Headless rendering for JS-only sites | If `no_links_found` turns out to be common across real sources |

## Open

| Deferred decision | Trigger |
| ----------------- | ------- |
| Final dedup threshold | One week of near-miss logs against real sources |
| Whether `maxDuration` needs raising | First run where the budget is actually hit |
| Whether to show "also covered by X" | When `dedupeOfId` has enough real matches to be worth surfacing |
