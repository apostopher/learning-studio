import { BookOpen, NotebookPen, VideoOff } from 'lucide-react';

type LessonNoVideoProps = {
  lessonName: string;
  /**
   * Whether a video was expected here. `needsVideoWatch` is the admin's own
   * statement that this lesson should have one, so it is the only honest way
   * to tell "still being built" apart from "deliberately reading-only".
   */
  videoExpected: boolean;
  /** Omitted when no debrief can be started — the tab would not exist either. */
  onDebrief?: () => void;
};

/**
 * The slot where the video player would be, on a lesson that has no video.
 *
 * This used to say only "the video hasn't been uploaded", which framed every
 * video-less lesson as an admin oversight. Plenty of them are reading-and-
 * debrief by design and complete perfectly well without one, so the card now
 * describes what the lesson IS, and keeps the missing-video note for the case
 * where the admin's own config says a video was expected.
 *
 * The Debrief button is a shortcut, not the only door — the Debrief tab below
 * carries the same action. It sits here because this is exactly where the
 * post-video overlay's button appears on lessons that do have a video.
 */
export const LessonNoVideo = ({
  lessonName,
  videoExpected,
  onDebrief,
}: LessonNoVideoProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <div className="lesson-card" role="status">
    {videoExpected ? (
      <VideoOff
        size={32}
        aria-hidden="true"
        style={{ color: 'var(--color-gray-9)' }}
      />
    ) : (
      <BookOpen
        size={32}
        aria-hidden="true"
        style={{ color: 'var(--color-gray-9)' }}
      />
    )}

    <h2 className="lesson-card__heading">
      {videoExpected
        ? 'No video for this lesson yet'
        : `${lessonName} is reading${onDebrief ? ' and debrief' : ''}`}
    </h2>

    <p>
      {videoExpected ? (
        <>
          <strong>{lessonName}</strong> is published, but the video hasn't been
          uploaded. Everything else in the lesson is below.
        </>
      ) : (
        'Work through the material below.'
      )}
    </p>

    {onDebrief ? (
      <button
        type="button"
        onClick={onDebrief}
        className="mt-2 inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10"
      >
        <NotebookPen size={16} aria-hidden="true" />
        Debrief
      </button>
    ) : null}
  </div>
);
