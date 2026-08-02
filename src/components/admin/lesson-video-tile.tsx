import { Play, Video } from 'lucide-react';

type LessonVideoTileProps = {
  /** Whether a video is assigned to this lesson. */
  hasVideo: boolean;
  /** Lesson name, for the play control's accessible name. */
  lessonName: string;
  /** Omitted when the board has no way to play (e.g. the drag overlay). */
  onPlay?: () => void;
};

/**
 * 16:9 video marker on a lesson card, 32px tall.
 *
 * Deliberately NOT a poster frame. At this size the tile is ~57×32, where a
 * real video still is an unreadable smudge that communicates nothing beyond
 * "there is a video" — which the board already knows from `isConfigured`.
 * Fetching real posters would also mean a provider resolution per lesson (an
 * HTTP round trip each, for Synthesia) on an unvirtualized board, refreshing
 * hourly as Mux's poster tokens expire.
 *
 * With no video this is a plain element rather than a disabled button: there
 * is nothing to play, so a control that looks pressable and opens an empty
 * modal would be an affordance that lies.
 *
 * The drawn size stays 32px while padding takes the hit area past 44px — the
 * bar the rest of the app holds (see binary-toggle.tsx). Padding does not
 * change the rendered tile, so the layout is unaffected.
 */
export const LessonVideoTile = ({
  hasVideo,
  lessonName,
  onPlay,
}: LessonVideoTileProps) => {
  const tile =
    'flex h-8 w-[3.5rem] shrink-0 items-center justify-center rounded bg-gray-3';

  if (!hasVideo || !onPlay) {
    return (
      <span
        className={`${tile} text-gray-8`}
        // Not `aria-hidden`: "no video" is real information about the lesson,
        // and the dot this replaced was invisible to screen readers entirely.
        role="img"
        aria-label={hasVideo ? 'Has a video' : 'No video'}
      >
        <Video className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${lessonName} video`}
      // -m-1.5 + p-1.5 grows the hit area to 44px without moving anything: the
      // negative margin absorbs the padding the tile would otherwise add.
      className="-m-1.5 shrink-0 rounded p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
    >
      <span
        className={`${tile} group relative text-gray-11 transition-colors hover:bg-gray-4 hover:text-primary`}
      >
        <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      </span>
    </button>
  );
};
