import { RotateCcw } from 'lucide-react';

type ErrorOverlayProps = {
  message?: string;
  defaultMessage: string;
  retryLabel: string;
  onRetry?: () => void;
};

export const ErrorOverlay = ({
  message,
  defaultMessage,
  retryLabel,
  onRetry,
}: ErrorOverlayProps) => (
  <div className="vp-overlay vp-error" role="alert">
    <div className="vp-error__body">
      <p className="vp-error__message">{message ?? defaultMessage}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="vp-error__retry"
          aria-label={retryLabel}
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span>{retryLabel}</span>
        </button>
      ) : null}
    </div>
  </div>
);
