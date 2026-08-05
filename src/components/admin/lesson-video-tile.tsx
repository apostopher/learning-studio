import { Play, Video } from 'lucide-react';

type LessonVideoTileProps = {
  /** Whether a video is assigned to this lesson. */
  hasVideo: boolean;
  /** Lesson name, for the play control's accessible name. */
  lessonName: string;
  /** Poster frame from the video provider. Absent for a lesson whose provider
   *  exposes none, or before the posters query resolves. */
  posterUrl?: string | null;
  /** Omitted when the board has no way to play (e.g. the drag overlay). */
  onPlay?: () => void;
};

const TILE =
  'relative flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-3';

/**
 * The frame itself. Decorative — the play button already carries the lesson
 * name, and alt text here would announce it twice.
 *
 * There is no `onError` handler and no loading state. If the provider token
 * has expired the request 403s, the image never paints, and the tile's own
 * `bg-gray-3` shows through — which is exactly the tile the board drew before
 * posters existed. Building the fallback out of stacking order rather than
 * state is not a shortcut: presentational components here must stay hookless
 * (react-compiler nulls the dispatcher under vitest), and a fallback that
 * cannot run is a fallback that cannot break.
 */
const PosterFrame = ({ src }: { src: string }) => (
  <img
    src={src}
    alt=""
    className="absolute inset-0 h-full w-full object-cover"
  />
);

/**
 * The glyph, on a disc when it sits over a frame.
 *
 * A translucent scrim cannot guarantee contrast over an arbitrary photograph —
 * the maths depends on the frame. A near-opaque disc holds white at ≥4.5:1
 * against any frame AND against the grey tile beneath it, which is what makes
 * the silent image failure above safe. This is the one place the themed Radix
 * scale can't be used: no scale step is defined against unknown imagery.
 */
const PlayGlyph = ({ onPoster }: { onPoster: boolean }) =>
  onPoster ? (
    <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors group-hover:bg-black/75">
      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
    </span>
  ) : (
    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
  );

/**
 * 16:9 video tile on a lesson card, 80×45.
 *
 * It used to be a deliberately blank 56×32 marker, on the grounds that a frame
 * that small is an unreadable smudge and that posters would cost a provider
 * round trip per lesson. Both held. Both were addressed rather than overruled:
 * 80×45 is legible, Mux thumbnails are signed locally, and Synthesia exposes
 * thumbnails through its list endpoint (100 videos a call), so a course costs
 * one or two requests rather than one per lesson.
 *
 * With no video this is a plain element rather than a disabled button: there
 * is nothing to play, so a control that looks pressable and opens an empty
 * modal would be an affordance that lies.
 *
 * At 45px tall the tile clears the 44px hit target on its own, so the
 * `-m-1.5 p-1.5` trick that used to grow it is gone.
 */
export const LessonVideoTile = ({
  hasVideo,
  lessonName,
  posterUrl,
  onPlay,
}: LessonVideoTileProps) => {
  const poster = hasVideo && posterUrl ? posterUrl : null;

  if (!hasVideo || !onPlay) {
    return (
      <span
        className={`${TILE} text-gray-8`}
        // Not `aria-hidden`: "no video" is real information about the lesson,
        // and the dot this replaced was invisible to screen readers entirely.
        role="img"
        aria-label={hasVideo ? 'Has a video' : 'No video'}
      >
        {poster && <PosterFrame src={poster} />}
        {/* `alt=""` makes the frame presentational, so this stays the only
            element with an img role and the label above still resolves. */}
        {hasVideo ? (
          <PlayGlyph onPoster={Boolean(poster)} />
        ) : (
          <Video className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${lessonName} video`}
      className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
    >
      <span
        className={`${TILE} group text-gray-11 transition-colors hover:bg-gray-4 hover:text-primary`}
      >
        {poster && <PosterFrame src={poster} />}
        <PlayGlyph onPoster={Boolean(poster)} />
      </span>
    </button>
  );
};
