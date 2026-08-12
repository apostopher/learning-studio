import { getDerivedKeyPoints } from '#/db/derived-key-points';
import { getLessonMaterial } from '#/db/lesson';
import { getLessonTranscript } from '#/db/lesson-transcript';

export type DebriefSource = {
  /**
   * Which input the questions were built from. Reported for logging only — the
   * learner is never shown a different debrief depending on this.
   */
  kind: 'material' | 'material-derived' | 'transcript';
  keyPoints: string[];
  text: string;
};

/**
 * What a lesson's debrief is generated FROM, resolved on the server.
 *
 * Authored material wins whenever there is any, and the transcript is the
 * fallback — in preference order:
 *
 *  1. material with authored key points and body text — used verbatim;
 *  2. material with body text but no key points — points derived from that text
 *     (cached by content hash), so the authored lesson is still the source;
 *  3. the video's caption transcript, with points derived from it the same way;
 *  4. nothing — null.
 *
 * Both AI endpoints used to take `keyPoints` and `text` from the request body,
 * which meant only the material panel could start a debrief: the client had to
 * already hold the source, and a lesson with no material row has none to hold.
 * Resolving here also means the prompt's source material is no longer whatever
 * the caller chose to post.
 *
 * Null is answered with a 422, and the UI does not offer a debrief it cannot
 * generate, so it should not be reachable in practice.
 */
export async function resolveDebriefSource(
  lessonSlug: string,
): Promise<DebriefSource | null> {
  const material = await getLessonMaterial(lessonSlug);

  if (material?.text) {
    if (material.keyPoints?.length) {
      return {
        kind: 'material',
        keyPoints: material.keyPoints,
        text: material.text,
      };
    }
    const derived = await getDerivedKeyPoints(material.text);
    if (derived.length > 0) {
      return {
        kind: 'material-derived',
        keyPoints: derived,
        text: material.text,
      };
    }
  }

  const transcript = await getLessonTranscript(lessonSlug);
  if (!transcript) return null;
  const keyPoints = await getDerivedKeyPoints(transcript);
  if (keyPoints.length === 0) return null;
  return { kind: 'transcript', keyPoints, text: transcript };
}
