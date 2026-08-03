/**
 * Pure selection and dedup rules for the scrape pipeline.
 *
 * Deliberately free of network, database and model calls: these are the
 * decisions that determine what a reader ends up seeing, and they are the ones
 * worth testing directly.
 */

/** Similarity at or above which two articles are judged the same story. */
export const DEDUPE_THRESHOLD = 0.85;

/**
 * Lower bound of the band worth logging. Matches between this and
 * `DEDUPE_THRESHOLD` are the ones that would flip if the threshold moved, so
 * they are what a week of real hauls should be tuned against.
 */
export const DEDUPE_NEAR_MISS_FLOOR = 0.75;

export interface CandidateArticle {
  canonicalUrl: string;
  originalUrl: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  /** Null when the page published no usable date. */
  publishedAt: Date | null;
}

export interface RankedArticle extends CandidateArticle {
  /** `publishedAt` when present, else `firstSeenAt`. Always set. */
  effectivePublishedAt: Date;
  publishedAtEstimated: boolean;
}

/**
 * Resolve each candidate's ranking timestamp, newest first, and take `limit`.
 *
 * An article with no usable date falls back to `firstSeenAt` rather than being
 * dropped. Dropping is what the old implementation did, and it meant a
 * publisher that omits dates contributed nothing, forever, with no signal.
 * The fallback degrades the guarantee to "most recently discovered", which is
 * a defensible approximation, and `publishedAtEstimated` keeps the UI from
 * presenting a discovery time as a publication time.
 */
export function selectTopArticles(
  candidates: readonly CandidateArticle[],
  firstSeenAt: Date,
  limit: number,
): RankedArticle[] {
  const ranked: RankedArticle[] = candidates.map((candidate) => ({
    ...candidate,
    effectivePublishedAt: candidate.publishedAt ?? firstSeenAt,
    publishedAtEstimated: candidate.publishedAt === null,
  }));

  return ranked
    .slice()
    .sort((a, b) => {
      const delta =
        b.effectivePublishedAt.getTime() - a.effectivePublishedAt.getTime();
      if (delta !== 0) return delta;
      // Stable, meaningful tiebreak: a dated article beats an estimated one at
      // the same instant, since the estimate is only a floor.
      if (a.publishedAtEstimated !== b.publishedAtEstimated) {
        return a.publishedAtEstimated ? 1 : -1;
      }
      return a.canonicalUrl.localeCompare(b.canonicalUrl);
    })
    .slice(0, limit);
}

/** Cosine similarity of two equal-length vectors; 0 when either is degenerate. */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** The text a story's embedding is computed over. */
export function embeddingText(article: {
  title: string;
  description: string | null;
}): string {
  return [article.title, article.description].filter(Boolean).join('\n\n');
}

export interface SimilarityCandidate {
  id: number;
  similarity: number;
}

export interface DedupeVerdict {
  /** Id of the article this one duplicates, or null when it is original. */
  dedupeOfId: number | null;
  /** Set when the best match landed in the tunable band, for logging. */
  nearMiss: SimilarityCandidate | null;
}

/**
 * Decide whether a candidate duplicates something already accepted.
 *
 * `matches` must be ordered best-first. The caller supplies matches from two
 * places — rows already in the database (earlier runs) and articles accepted
 * earlier in this run — and because the run processes sources in `rank` order,
 * "first match wins" produces exactly the agreed rule: first-seen wins across
 * runs, and within a single run the better-ranked source wins.
 */
export function judgeDuplicate(
  matches: readonly SimilarityCandidate[],
  threshold: number = DEDUPE_THRESHOLD,
): DedupeVerdict {
  const best = matches[0];
  if (!best) return { dedupeOfId: null, nearMiss: null };
  if (best.similarity >= threshold) {
    return { dedupeOfId: best.id, nearMiss: null };
  }
  if (best.similarity >= DEDUPE_NEAR_MISS_FLOOR) {
    return { dedupeOfId: null, nearMiss: best };
  }
  return { dedupeOfId: null, nearMiss: null };
}
