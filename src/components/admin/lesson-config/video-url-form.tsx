import { CheckCircle2, Loader2 } from 'lucide-react';
import type { FormEventHandler } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '@/lib/cn';

interface VideoUrlFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  registerUrl: UseFormRegisterReturn<'url'>;
  urlError?: string;
  /** Provider label (e.g. "Mux") once `detectVideoUrl` matches the current value, else null. */
  detectedLabel: string | null;
  /** True once the field has a non-empty value that no provider recognizes. */
  showUnsupported: boolean;
  isPending: boolean;
  serverError?: string;
  submitLabel?: string;
  onCancel?: () => void;
}

export const VideoUrlForm = ({
  onSubmit,
  registerUrl,
  urlError,
  detectedLabel,
  showUnsupported,
  isPending,
  serverError,
  submitLabel = 'Use this video',
  onCancel,
}: VideoUrlFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="video-url" className="font-medium text-gray-12 text-sm">
          Video URL or ID
        </label>
        <input
          {...registerUrl}
          id="video-url"
          type="text"
          autoFocus
          autoComplete="off"
          placeholder="Paste a Mux playback URL/ID or Synthesia link/ID"
          aria-invalid={!!urlError}
          aria-describedby={urlError ? 'video-url-error' : 'video-url-hint'}
          className={cn(
            'min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none transition-colors duration-100 placeholder:text-gray-8',
            'focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9',
            urlError
              ? 'border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9'
              : 'border-gray-6 hover:border-gray-8',
          )}
        />
        {urlError ? (
          <p
            id="video-url-error"
            role="alert"
            aria-live="polite"
            className="text-red-11 text-sm"
          >
            {urlError}
          </p>
        ) : detectedLabel ? (
          <p
            id="video-url-hint"
            aria-live="polite"
            // Only gray/apple(accent)/red semantic scales exist in this project's
            // theme (see src/styles/theme.generated.css) — accent stands in for
            // the "success/detected" state since there's no green scale.
            className="flex items-center gap-1.5 text-apple-11 text-sm"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Detected: {detectedLabel}
          </p>
        ) : showUnsupported ? (
          <p
            id="video-url-hint"
            aria-live="polite"
            className="text-red-11 text-sm"
          >
            Unsupported URL — see the setup steps below for a supported format.
          </p>
        ) : (
          <p id="video-url-hint" className="text-gray-10 text-sm">
            Supported: Mux playback URLs/IDs, Synthesia video URLs/IDs.
          </p>
        )}
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-red-9/40 bg-red-9/15 px-3 py-2.5 text-red-11 text-sm"
        >
          {serverError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 font-medium text-gray-11 text-sm transition-colors hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!detectedLabel || isPending}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm',
            'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {submitLabel}
        </button>
      </div>
    </form>
  );
};
