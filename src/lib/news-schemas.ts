import { z } from 'zod';

/**
 * Wire schemas for the student news feed. Separate from the shaping logic in
 * `news-feed-shaping.ts` so that file stays a pure function with no
 * dependencies, matching `library-schemas.ts` / `library-gating.ts`.
 */

/** The publication an article came from, as the feed renders it. */
export const NewsFeedSourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  /**
   * Ready-made logo, usually SVG. Lowest precedence of the three — render it
   * as a plain `<img>` source, never inside a typed `<source>`.
   */
  imageUrl: z.string().nullable(),
  tintColor: z.string().nullable(),
});
export type NewsFeedSource = z.infer<typeof NewsFeedSourceSchema>;

/** A source in the course, with whether this student has muted it. */
export const NewsSourceChoiceSchema = NewsFeedSourceSchema.extend({
  /** True when the student has an exclusion row for this source. */
  muted: z.boolean(),
});
export type NewsSourceChoice = z.infer<typeof NewsSourceChoiceSchema>;

export const NewsArticleSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  /** The canonical URL. `originalUrl` stays server-side as a debugging aid. */
  url: z.string(),
  imageUrl: z.string().nullable(),
  publishedAt: z.coerce.date(),
  /**
   * True when `publishedAt` is when we DISCOVERED the article, because its page
   * carried no usable date. Must reach the client: rendering an estimate as a
   * precise publication time is the exact failure this flag exists to prevent.
   */
  publishedAtEstimated: z.boolean(),
  source: NewsFeedSourceSchema,
  /**
   * Other sources that covered the same story, already filtered to ones this
   * student can see. A source they muted is deliberately absent — naming it
   * would tell them what they chose to hide.
   */
  alsoCoveredBy: z.array(z.object({ id: z.number(), name: z.string() })),
});
export type NewsArticle = z.infer<typeof NewsArticleSchema>;

export const NewsFeedResponseSchema = z.object({
  articles: z.array(NewsArticleSchema),
  /**
   * Every source in the course, muted or not. Shipped alongside `articles` so
   * a picker cannot show a source as unmuted while the feed has already
   * dropped it — two endpoints could disagree, one cannot.
   */
  sources: z.array(NewsSourceChoiceSchema),
  /**
   * Most recent `firstSeenAt` among visible articles, or null when there are
   * none. The cheapest signal that the scraper has died: without it, a broken
   * cron looks identical to a quiet news week until the page empties a week
   * later.
   */
  lastUpdatedAt: z.coerce.date().nullable(),
  /**
   * Whether the caller read this course without a subscription because they
   * are an admin. Returned rather than swallowed, matching `LibraryResponse` —
   * a silent bypass makes the feature untestable.
   */
  adminBypass: z.boolean(),
});
export type NewsFeedResponse = z.infer<typeof NewsFeedResponseSchema>;

/** POST body for muting or unmuting one source. */
export const SetNewsSourceMutedInputSchema = z
  .object({
    sourceId: z.number().int().positive(),
    muted: z.boolean(),
  })
  .strict();
export type SetNewsSourceMutedInput = z.infer<
  typeof SetNewsSourceMutedInputSchema
>;

export const SetNewsSourceMutedResponseSchema = z.object({
  sourceId: z.number(),
  muted: z.boolean(),
});
export type SetNewsSourceMutedResponse = z.infer<
  typeof SetNewsSourceMutedResponseSchema
>;
