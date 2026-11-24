import {
  getHomeCourseIdForVersion,
  getPinnedSnapshot,
} from '#/db/course-lesson-content';
import { getDerivedKeyPoints } from '#/db/derived-key-points';
import { getLessonTranscript } from '#/db/lesson-transcript';

export type DebriefSource = {
  /**
   * Which input the questions were built from. Reported for logging only — the
   * learner is never shown a different debrief depending on this.
   */
  kind: 'material' | 'material-derived' | 'transcript';
  keyPoints: string[];
  /**
   * What chunk generation and the debrief questions read alongside the key
   * points: the home-course transcript when there is one, else the material
   * text.
   */
  context: string;
  /**
   * Set when an authored lesson's transcript lookup FAILED (threw or timed
   * out), so `context` fell back to the material text. Not a changed
   * source: `ensureLessonChunks` keeps the stored chunks rather than
   * regenerating from it (and again when the provider recovers).
   */
  degraded?: true;
};

/** How long the transcript lookup may take before it counts as failed. */
export const TRANSCRIPT_LOOKUP_TIMEOUT_MS = 8_000;

/** `promise`, or a rejection once `ms` have passed without it settling. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Transcript lookup timed out after ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
 *
 * `courseId` is the course the gate resolved for this request; everything
 * comes from the version of the lesson that course is pinned to. Null when it
 * has none.
 */
export async function resolveDebriefSource(
  lessonSlug: string,
  courseId: number,
): Promise<DebriefSource | null> {
  // One read for everything below, so it is all of one version.
  const snapshot = await getPinnedSnapshot(lessonSlug, courseId);
  if (!snapshot) return null;

  // Two courses on one version must get the same transcript, so it comes from
  // the version's home course (see `getHomeCourseIdForVersion`). Authored
  // material never needed the transcript before, so for it a failed lookup (an
  // error, or no answer within `TRANSCRIPT_LOOKUP_TIMEOUT_MS`) degrades to the
  // material text instead of breaking the lesson, and says so (`degraded`);
  // with no material the transcript is the source and the error propagates as
  // it always did.
  const lookupTranscript = async (): Promise<string | null> => {
    const versionId = snapshot.id;
    return getLessonTranscript(lessonSlug, {
      courseId: (await getHomeCourseIdForVersion(versionId)) ?? courseId,
      versionId,
    });
  };
  let transcript: string | null;
  let degraded = false;
  if (snapshot.text) {
    try {
      transcript = await withTimeout(
        lookupTranscript(),
        TRANSCRIPT_LOOKUP_TIMEOUT_MS,
      );
    } catch (error) {
      console.warn(
        `Transcript lookup failed for ${lessonSlug}; using material text:`,
        error,
      );
      transcript = null;
      degraded = true;
    }
  } else {
    transcript = await lookupTranscript();
  }

  if (snapshot.text) {
    const context = transcript ?? snapshot.text;
    const flag = degraded ? { degraded: true as const } : {};
    if (snapshot.keyPoints?.length) {
      return {
        kind: 'material',
        keyPoints: snapshot.keyPoints,
        context,
        ...flag,
      };
    }
    const derived = await getDerivedKeyPoints(snapshot.text);
    if (derived.length > 0) {
      return { kind: 'material-derived', keyPoints: derived, context, ...flag };
    }
  }

  if (!transcript) return null;
  const keyPoints = await getDerivedKeyPoints(transcript);
  if (keyPoints.length === 0) return null;
  return { kind: 'transcript', keyPoints, context: transcript };
}
