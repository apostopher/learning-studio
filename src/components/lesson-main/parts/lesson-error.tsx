import { AlertCircle, RotateCcw } from 'lucide-react';

type LessonErrorProps = {
  message: string;
  onRetry: () => void;
  /**
   * What failed to load. Defaults to the course so existing call sites read
   * unchanged; the material error passes its own so the copy and the retry
   * button's accessible name name the right thing. One error style for both —
   * a second card design for the same shape of failure would just drift.
   */
  subject?: string;
};

export const LessonError = ({
  message,
  onRetry,
  subject = 'the course',
}: LessonErrorProps) => (
  <div className="lesson-card" role="alert">
    <AlertCircle
      size={32}
      aria-hidden="true"
      style={{ color: 'var(--color-accent-9)' }}
    />
    <h2 className="lesson-card__heading">Couldn&rsquo;t load {subject}</h2>
    <p>{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="lesson-card__retry"
      aria-label={`Retry loading ${subject}`}
    >
      <RotateCcw size={16} aria-hidden="true" />
      <span>Retry</span>
    </button>
  </div>
);
