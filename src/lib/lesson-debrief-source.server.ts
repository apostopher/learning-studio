import { getDerivedKeyPoints } from '#/db/derived-key-points';
import { getLessonMaterial } from '#/db/lesson';
import { getLessonIdBySlug } from '#/db/lesson-access';
import { getLessonTranscript } from '#/db/lesson-transcript';
import { getHomeCourseIdForLesson } from '#/db/placements';

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
 *
 * `courseId` is the course the gate resolved for this request: the transcript
 * fallback resolves playback through that course's provider credentials.
 */
export async function resolveDebriefSource(
  lessonSlug: string,
  courseId: number,
): Promise<DebriefSource | null> {
  const material = await getLessonMaterial(lessonSlug);

  // Chunks are per lesson, not per course, so the transcript comes from the
  // lesson's home course (see `getHomeCourseIdForLesson`), falling back to the
  // course being served when the lesson is unplaced. Authored material never
  // needed the transcript before, so for it a failed lookup degrades to the
  // material text instead of breaking the lesson; with no material the
  // transcript is the source and the error propagates as it always did.
  const lookupTranscript = async (): Promise<string | null> => {
    const lessonId = await getLessonIdBySlug(lessonSlug);
    const homeCourseId =
      (lessonId === null ? null : await getHomeCourseIdForLesson(lessonId)) ??
      courseId;
    return getLessonTranscript(lessonSlug, { courseId: homeCourseId });
  };
  let transcript: string | null;
  if (material?.text) {
    try {
      transcript = await lookupTranscript();
    } catch (error) {
      console.warn(
        `Transcript lookup failed for ${lessonSlug}; using material text:`,
        error,
      );
      transcript = null;
    }
  } else {
    transcript = await lookupTranscript();
  }

  if (material?.text) {
    const context = transcript ?? material.text;
    if (material.keyPoints?.length) {
      return { kind: 'material', keyPoints: material.keyPoints, context };
    }
    const derived = await getDerivedKeyPoints(material.text);
    if (derived.length > 0) {
      return { kind: 'material-derived', keyPoints: derived, context };
    }
  }

  if (!transcript) return null;
  const keyPoints = await getDerivedKeyPoints(transcript);
  if (keyPoints.length === 0) return null;
  return { kind: 'transcript', keyPoints, context: transcript };
}
