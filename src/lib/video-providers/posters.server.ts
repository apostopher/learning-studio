import Mux from '@mux/mux-node';
import { getVideoThumbnailsWithCache } from '../../integrations/synthesia/thumbnails';
import { muxCredentialSchema } from './mux';
import { synthesiaCredentialSchema } from './synthesia';
import type { ProviderId } from './types';

const mux = new Mux();

/**
 * 6h — deliberately longer than the 1h stream token in resolve.server.ts. A
 * thumbnail token is low-value, and a board tab left open across a morning
 * should not fill with broken images.
 */
const POSTER_TTL_SECONDS = 6 * 60 * 60;

/** 2x the 80px the board draws. The unsized default is a ~1920px JPEG. */
const POSTER_WIDTH = '160';

export interface PosterLesson {
  id: number;
  provider: ProviderId;
  ref: string;
}

/**
 * Poster frames for a course's lessons, as `lessonId → url`.
 *
 * A lesson is ABSENT rather than null when it has no poster — no credential,
 * no thumbnail, or a provider that refused. Absence is the tile's cue to draw
 * its grey icon, and there is no error state because a missing poster is not
 * something an admin can act on.
 *
 * Credentials arrive through `loadCredentials` rather than a courseId lookup so
 * this stays testable without rebuilding the Drizzle schema.
 */
export async function buildLessonPosters({
  courseId,
  lessons,
  loadCredentials,
}: {
  courseId: number;
  lessons: PosterLesson[];
  loadCredentials: (provider: ProviderId) => Promise<unknown | null>;
}): Promise<Record<number, string>> {
  const muxLessons = lessons.filter((l) => l.provider === 'mux');
  const synthesiaLessons = lessons.filter((l) => l.provider === 'synthesia');

  // Concurrent and independently guarded: neither provider can take the other
  // down, and a course using one never pays for the other.
  const [muxPosters, synthesiaPosters] = await Promise.all([
    muxLessons.length > 0 ? signMuxPosters(muxLessons, loadCredentials) : {},
    synthesiaLessons.length > 0
      ? fetchSynthesiaPosters(courseId, synthesiaLessons, loadCredentials)
      : {},
  ]);

  return { ...muxPosters, ...synthesiaPosters };
}

async function signMuxPosters(
  lessons: PosterLesson[],
  loadCredentials: (provider: ProviderId) => Promise<unknown | null>,
): Promise<Record<number, string>> {
  try {
    const creds = await loadCredentials('mux');
    if (!creds) return {};
    const { keyId, privateKey } = muxCredentialSchema.parse(creds);

    const entries = await Promise.all(
      lessons.map(async (lesson) => {
        try {
          // Signing is local, so this is N milliseconds and zero round trips.
          const token = await mux.jwt.signPlaybackId(lesson.ref, {
            keyId,
            keySecret: privateKey,
            expiration: `${POSTER_TTL_SECONDS}s`,
            // `t` audience: image.mux.com rejects the `v` token the stream URL
            // carries. Same split resolve.server.ts documents.
            type: 'thumbnail',
            // For a signed playback id every query param must be in the claims
            // too, or Mux refuses the request.
            params: { width: POSTER_WIDTH },
          });
          // No `time` param: Mux defaults to mid-video, which beats the black
          // frame or title card that time=0 usually lands on.
          return [
            lesson.id,
            `https://image.mux.com/${lesson.ref}/thumbnail.jpg?width=${POSTER_WIDTH}&token=${token}`,
          ] as const;
        } catch (error) {
          // One unusable ref must not cost the rest of the board its
          // posters. But the likelier cause isn't an isolated bad ref — it's
          // a schema-valid, cryptographically unusable stored key, which
          // throws for EVERY ref. That makes this catch fire N times with
          // nothing surfaced anywhere: the provider-level catch below never
          // runs because signing itself doesn't throw, just each per-ref
          // sign call. Logging the ref (a Mux playback ID, not a secret —
          // never log the credential or anything derived from it) gives a
          // debugging admin the one thing they'd need to tell "one bad
          // lesson" apart from "the whole course's key is broken".
          console.error('Mux poster signing failed for ref', lesson.ref, error);
          return null;
        }
      }),
    );

    return Object.fromEntries(entries.filter((entry) => entry !== null));
  } catch (error) {
    console.error('Mux poster signing failed for the course', error);
    return {};
  }
}

async function fetchSynthesiaPosters(
  courseId: number,
  lessons: PosterLesson[],
  loadCredentials: (provider: ProviderId) => Promise<unknown | null>,
): Promise<Record<number, string>> {
  try {
    const creds = await loadCredentials('synthesia');
    if (!creds) return {};
    const { apiKey } = synthesiaCredentialSchema.parse(creds);
    const thumbnails = await getVideoThumbnailsWithCache({ courseId, apiKey });

    return Object.fromEntries(
      lessons
        .map((lesson) => [lesson.id, thumbnails[lesson.ref]] as const)
        .filter((entry): entry is readonly [number, string] =>
          Boolean(entry[1]),
        ),
    );
  } catch (error) {
    console.error('Synthesia thumbnail sweep failed for the course', error);
    return {};
  }
}
