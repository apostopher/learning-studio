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
    <div>
      <p>{message ?? defaultMessage}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="vp-icon-button"
          aria-label={retryLabel}
          style={{ marginBlockStart: 'calc(var(--spacing) * 2)' }}
        >
          <RotateCcw size={20} aria-hidden="true" />
          <span style={{ marginInlineStart: 'calc(var(--spacing) * 2)' }}>
            {retryLabel}
          </span>
        </button>
      ) : null}
    </div>
  </div>
);
