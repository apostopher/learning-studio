/**
 * Planning half of `migrate-other-video-ids-run.ts`, split out so it can be
 * unit-tested with a hand-built video index — the runner opens a real
 * `pg.Pool` and calls the Synthesia API at import time.
 *
 * What the old platform stored under `other_video_ids` was a Synthesia SHARE
 * link to the ENGLISH video with `?language=fr` — the share page picks the
 * translation. This app resolves playback through the API instead, where
 * that root id only ever yields the English download; the French render is
 * a separate video in the account, titled `FR - <English title>`. So a row
 * is migrated by finding that video, not by re-parsing the old URL.
 */

export type LegacyAlternate = { lang: string; videoId: string };

export type LessonToMigrate = {
  slug: string;
  /** The lesson's English video id — the title lookup key. */
  videoRef: string;
  legacy: LegacyAlternate[];
};

/** Every video in the Synthesia account, by id → title. */
export type SynthesiaVideoIndex = { titleById: Map<string, string> };

export type ResolvedAlternate = {
  lang: 'fr' | 'fr-CA';
  provider: 'synthesia';
  ref: string;
  title: string;
  /** `direct`: the old link already named the French video. `by-title`: found via `FR - <title>`. */
  how: 'direct' | 'by-title';
};

export type LessonPlan = {
  slug: string;
  resolved: ResolvedAlternate[];
  unresolved: { lang: string; reason: string }[];
};

/** The old `{ lang, videoId }` shape — what `import-course.ts` copied over verbatim. */
export function isLegacyAlternates(value: unknown): value is LegacyAlternate[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (v) =>
        v &&
        typeof v === 'object' &&
        typeof (v as LegacyAlternate).videoId === 'string' &&
        typeof (v as LegacyAlternate).lang === 'string',
    )
  );
}

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const FRENCH_TITLE_RE = /^(FR|FR-CA) - (.*)$/;

const codeForPrefix = (prefix: string): 'fr' | 'fr-CA' =>
  prefix === 'FR-CA' ? 'fr-CA' : 'fr';

/**
 * One lesson's plan. Only `FR` is understood — the old platform never stored
 * anything else, and a code this function has to guess at is not one it
 * should write.
 */
export function planLessonAlternates(
  lesson: LessonToMigrate,
  index: SynthesiaVideoIndex,
): LessonPlan {
  const plan: LessonPlan = { slug: lesson.slug, resolved: [], unresolved: [] };
  for (const entry of lesson.legacy) {
    if (entry.lang !== 'FR') {
      plan.unresolved.push({
        lang: entry.lang,
        reason: `only FR is migrated; got "${entry.lang}"`,
      });
      continue;
    }

    // The old link may already name the French render (a few rows did).
    const linked = UUID_RE.exec(entry.videoId)?.[0];
    const linkedTitle = linked ? index.titleById.get(linked) : undefined;
    const direct = linkedTitle ? FRENCH_TITLE_RE.exec(linkedTitle) : null;
    if (linked && linkedTitle && direct) {
      plan.resolved.push({
        lang: codeForPrefix(direct[1]),
        provider: 'synthesia',
        ref: linked,
        title: linkedTitle,
        how: 'direct',
      });
      continue;
    }

    // Otherwise: the lesson's OWN English video's title, prefixed. Its own,
    // not the link's — one old row pointed at another lesson's English video.
    const englishTitle = index.titleById.get(lesson.videoRef);
    if (!englishTitle) {
      plan.unresolved.push({
        lang: entry.lang,
        reason: `lesson video ${lesson.videoRef} is not in the account`,
      });
      continue;
    }
    const candidates: ResolvedAlternate[] = [];
    for (const [id, title] of index.titleById) {
      const m = FRENCH_TITLE_RE.exec(title);
      if (m && m[2] === englishTitle) {
        candidates.push({
          lang: codeForPrefix(m[1]),
          provider: 'synthesia',
          ref: id,
          title,
          how: 'by-title',
        });
      }
    }
    // `fr` first when both exist: it is what the old `?language=fr` meant.
    const pick =
      candidates.find((c) => c.lang === 'fr') ?? candidates[0] ?? null;
    if (pick) plan.resolved.push(pick);
    else
      plan.unresolved.push({
        lang: entry.lang,
        reason: `no FR render of "${englishTitle}" in the account`,
      });
  }
  return plan;
}
