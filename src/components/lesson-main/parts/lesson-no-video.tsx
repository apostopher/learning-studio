import { BookOpen, VideoOff } from 'lucide-react';

type LessonNoVideoProps = {
  lessonName: string;
  /**
   * Whether a video was expected here. `needsVideoWatch` is the admin's own
   * statement that this lesson should have one, so it is the only honest way
   * to tell "still being built" apart from "deliberately reading-only".
   */
  videoExpected: boolean;
  /** Whether the lesson has a Debrief tab below — named in the heading. */
  withDebrief: boolean;
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
 * No Debrief button: it was a shortcut to the Debrief tab, like the post-video
 * button, and both went when the debrief moved to opening 24h after the
 * lesson is done. The tab below says when it opens.
 */
export const LessonNoVideo = ({
  lessonName,
  videoExpected,
  withDebrief,
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
        : `${lessonName} is reading${withDebrief ? ' and debrief' : ''}`}
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
  </div>
);
