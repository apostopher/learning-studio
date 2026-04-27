import { VideoOff } from 'lucide-react';

type LessonNoVideoProps = {
  lessonName: string;
};

export const LessonNoVideo = ({ lessonName }: LessonNoVideoProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <div className="lesson-card" role="status">
    <VideoOff
      size={32}
      aria-hidden="true"
      style={{ color: 'var(--color-gray-9)' }}
    />
    <h2 className="lesson-card__heading">No video for this lesson yet</h2>
    <p>
      <strong>{lessonName}</strong> is published, but the video hasn't been
      uploaded.
    </p>
  </div>
);
