/**
 * Whether a lesson can offer this pilot a debrief at all — the client's copy
 * of the generator's own rule (spec call 11). `resolveDebriefSource` builds a
 * debrief from the material's body text when there is any (`if
 * (material?.text)`), and otherwise from the video's caption transcript. So
 * a material row with an EMPTY body still falls through to the transcript.
 *
 * The one predicate every debrief surface asks — the Debrief tab, the
 * transcript-only section on a material-less lesson, prepare-on-play and
 * prepare-on-visit. When they each kept their own copy, a lesson with an
 * empty-bodied material row and a captioned video was prepared (so the SQL
 * counted it debrief-bearing and the ring showed a red D) but offered no tab
 * and no section, so the course could never reach 100%.
 *
 * Read-only (call 12) is deliberately not part of it: that is a per-pilot
 * state of the lesson, not a property of whether a debrief exists, and each
 * surface applies it alongside.
 *
 * Client-safe: no server imports.
 */
export type DebriefOfferArgs = {
  /** `lessons.has_debrief` — the admin's switch, authoritative as everywhere else. */
  hasDebrief: boolean;
  /** The material row's body text; null/undefined when there is no row (or it is not loaded). */
  materialText: string | null | undefined;
  /** The video has a caption track to transcribe — see `playbackHasCaptions`. */
  transcriptUsable: boolean;
};

export function canOfferDebrief({
  hasDebrief,
  materialText,
  transcriptUsable,
}: DebriefOfferArgs): boolean {
  return hasDebrief && (Boolean(materialText) || transcriptUsable);
}
