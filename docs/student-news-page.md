# Shared understanding: student News page

## Goal

Replace the `SectionStub` at `/course/$courseSlug/news` with a newspaper-styled
feed: two lead stories given real space, the rest in a dense printed-newspaper
treatment, plus the source picker that finally exercises the mute API.

Consumes [student-news-api.md](./student-news-api.md). Live data: course 2 has
27 articles from 9 contributing sources; course 1 has none.

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |
| 1   | Serif typeface | Add a fourth font slot `VITE_FONT_SERIF` = **Newsreader**. Touches `.env`, `env.ts`, `scripts/generate-theme-css.ts` + its test, and the Google Fonts link. | "Newspaper" is carried almost entirely by type. Newsreader is variable (optical size + weight), designed for news, and narrow enough that a 96-character headline survives a column measure. |
| 2   | Type roles | Newsreader for headlines and standfirsts. Inter for metadata, kickers, bylines, dates, UI. Bebas Neue for the masthead **only**. | Bebas is all-caps condensed — a masthead face, unreadable at 96 characters. Confining it to one element stops three faces competing. |
| 3   | Layout of the remaining ~25 | CSS **Grid**, 3 columns desktop, reading row-major. NOT `column-count`. | Real newsprint flows in columns because a page has fixed height. On a scrolling page, flowed columns mean reading order is "bottom of column 1, back to top of column 2" — and DOM order stops matching visual order, breaking keyboard and screen-reader traversal. |
| 4   | Newsprint feel | Hairline rules between columns (`border-inline-start`) and rows, tight leading, uppercase Inter source kicker at 10–11px, consistent gutters. | The look comes from treatment, not from flow. |
| 5   | Top 2 | Asymmetric: dominant lead (~2/3, large image, display headline, standfirst) beside a smaller second (~1/3, smaller image, clamped deck). | A front page always has one lead. Two equal heroes create a tie the reader must resolve and discard the ranking the feed already encodes. |
| 6   | Width | Lead region uses `.breakout`; the grid returns to `.content`. Never `.full-width`. | The breakout step is what makes "more space" read structurally. A full-bleed lead eats the entire first screen and kills the density. |
| 7   | Empty states | Four distinct: no sources configured · sources but no articles · all sources muted · 1–2 articles (render lead/second, omit grid). | All four are `articles.length === 0` but call for different responses — an admin task, patience, a setting the student changed, and fine. `sources` is on the wire precisely so they can be told apart. |
| 8   | Theme | Fully theme-aware via semantic tokens. No forced "paper" surface. | Newsprint at night is light-on-dark with the same structure. A cream surface inside a dark shell reads as a broken theme, and would be the only screen ignoring the toggle. |
| 9   | `tintColor` | Ignored on this page. | Only 2 of 14 sources have one and one is `#000000`. Styling 2 of 14 differently looks like a bug, and an admin-supplied colour can't be guaranteed AA against anything. |
| 10  | Source picker | Ships with the page. Collapsed "Sources" disclosure under the masthead showing "Showing 9 of 14 sources"; expanded, a toggle per source wired to `POST /api/course/news/mute`, optimistic with rollback. | Forced by #7: without a writer the all-muted state is unreachable. It also belongs where the stories are, not two screens away in settings. |
| 11  | Dateline | Masthead carries today's full date + "Updated N hours ago" from `lastUpdatedAt`. | The most newspaper-ish element available, free from data already on the wire, and it puts the dead-cron signal in front of real eyes. |
| 12  | Article times | Relative under 24h ("3 hours ago"), absolute beyond ("6 Aug"). Estimated dates: **absolute only, labelled "Added"**, never relative, never with an hour. | "3 hours ago" on an article whose page carried no date is fabricated precision — exactly what `publishedAtEstimated` exists to prevent. |
| 13  | Missing image | No placeholder graphic. Text-led treatment: the headline grows, the standfirst carries the weight. | Newspapers run text-only stories constantly. A grey box announces a failure that isn't one. 1 of 27 articles is affected. |
| 14  | Long headlines | Lead never truncates. Grid items clamp at 3 lines. | Row rhythm matters in a grid; the lead is the story. `line-clamp` truncates visually but leaves full text in the DOM, so the accessible name stays complete. |
| 15  | Link target | The whole card is one link. `target="_blank"`, `rel="noopener noreferrer"`, with a visually-hidden "(opens in a new tab)". | One interactive element per card, so no nesting problem, and the tap target is the card rather than a line of text. |
| 16  | Article images | Plain `<img>` — **not** `OptimizedPicture`, which is for our AVIF/WebP pairs. `referrerpolicy="no-referrer"`, `loading="lazy"`, `decoding="async"`, fixed aspect-ratio box, `onError` falls back to the text-led treatment. | These are hotlinked publisher URLs (accepted in the cron ledger). `no-referrer` was the mitigation promised there; the aspect box prevents CLS; 404s and hotlink blocks are expected. |
| 17  | Publisher text | Titles and descriptions rendered as **text**. Never `dangerouslySetInnerHTML`. | Publisher-controlled strings scraped from arbitrary pages. React escaping is the whole defence. |
| 18  | Responsive | 1 column mobile (lead, second, then list), 2 tablet, 3 desktop. Lead stacks above second on mobile. | |
| 19  | Data hook | New `use-course-news.ts`, `staleTime` 5 minutes. Mute mutation invalidates it. | Not the library's `staleTime: 0` — nothing consequential is gated on freshness, and the underlying data changes once a day. |
| 20  | Component shape | `news-page-container.tsx` → `compute-news-state.ts` (pure) → `news-page.tsx`, with `news-masthead`, `news-lead`, `news-grid-item`, `news-sources-picker` (+ container), `news-empty-state`. Presentational components stay hookless. | Mirrors the library trio. Hookless because react-compiler + vitest nulls the dispatcher in render tests. |
| 21  | `alsoCoveredBy` | Rendered as a small line when non-empty; invisible today. | Costs a few lines and the data is already on the wire. See Accepted risks. |

## Failure behaviour

| Scenario | What happens | User sees |
| -------- | ------------ | --------- |
| Course has no sources (course 1 today) | No fetch of articles server-side | "No news sources have been set up for this course yet." No spinner, no retry |
| Sources exist, cron hasn't produced anything | — | "No stories yet. This page updates each morning." |
| Student has muted every source | Feed empty, `sources` all muted | "You've hidden all sources," with the picker open and unmute available |
| Exactly 1 article | Lead only | A single lead, no second slot, no grid |
| Exactly 2 articles | Lead + second | No grid, no filler tiles |
| Article has no image | Text-led card | Larger headline, standfirst carries it. No grey box |
| Publisher image 404s or blocks hotlinking | `onError` swaps to text-led | Same as above, no broken-image icon |
| Article has an estimated date | Absolute date, "Added" label | "Added 6 Aug" — never an hour, never relative |
| Cron has been dead for days | Articles age out, feed thins then empties | Masthead reads "Updated 4 days ago" |
| API 500 | Query errors | Error message with retry, matching the library's treatment |
| Mute toggle fails | Optimistic update rolls back | Toggle returns to its previous state, toast explains |
| Offline | React Query error state | Same as API failure |

## Accepted risks

- **`alsoCoveredBy` ships unverified.** Zero duplicates exist today, so the treatment cannot be seen or tested against real data until two sources cover one story.
- **Three typefaces on one page** (Bebas masthead, Newsreader headlines, Inter metadata). Mitigated by confining Bebas to a single element, but it's a real risk of looking busy.
- **Adding a font slot changes global theme config**, not just this page. Any other consumer of the generated CSS inherits the new variable.
- **Hotlinked publisher images** can disappear or be blocked at any time; the page degrades but the story's thumbnail is gone.
- **4 of 14 sources are `fetch_failed` and 1 `no_links_found`** — the page will look thinner than the source count suggests, and by decision #14 of the API ledger students are told nothing about why.

## Assumed (not confirmed)

- Masthead shows the course name as the paper's title, not a fabricated publication name.
- The lead is `articles[0]` and the second is `articles[1]` — feed order, no re-ranking.
- Grid gutters and rule weight tuned by eye against the real 27 articles rather than specified numerically here.
- "Showing 9 of 14 sources" counts unmuted vs total; it disappears when nothing is muted.
- Loading state is a skeleton mirroring the layout (lead block + two rows of three), not a spinner.
- Section heading is visually the masthead but semantically an `<h1>` for the page.

## Out of scope

| Parked | What brings it back |
| ------ | ------------------- |
| Changing the cron or the API | — |
| Per-article save/bookmark/hide | A product decision |
| "Also covered by" as a rich treatment | Real duplicate data existing |
| Surfacing per-source scrape status to students | Decided against in the API ledger |
| Search or filtering within the feed | If a course's feed regularly exceeds a screen or two |

## Open

| Deferred decision | Trigger |
| ----------------- | ------- |
| Whether 3 columns is right at 1500px | Looking at the real 27 articles rendered |
| Whether the picker should stay collapsed by default | If mute usage turns out to be common |
| Whether estimated-date articles should be down-ranked | If "Added" articles cluster at the top and push real news down |
