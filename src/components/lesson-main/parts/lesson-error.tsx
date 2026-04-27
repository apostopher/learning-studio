import { AlertCircle, RotateCcw } from 'lucide-react';

type LessonErrorProps = {
  message: string;
  onRetry: () => void;
};

export const LessonError = ({ message, onRetry }: LessonErrorProps) => (
  <div className="lesson-card" role="alert">
    <AlertCircle
      size={32}
      aria-hidden="true"
      style={{ color: 'var(--color-accent-9)' }}
    />
    <h2 className="lesson-card__heading">Couldn't load the course</h2>
    <p>{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="lesson-card__retry"
      aria-label="Retry loading the course"
    >
      <RotateCcw size={16} aria-hidden="true" />
      <span>Retry</span>
    </button>
  </div>
);
