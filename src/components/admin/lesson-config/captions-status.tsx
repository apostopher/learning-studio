import { Button } from '@base-ui/react/button';
import { Loader2 } from 'lucide-react';
import type { LessonCaptions } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';

export interface CaptionsStatusProps {
  status: LessonCaptions['status'];
  languageLabel: string;
  error: string | null;
  onRequest?: () => void;
  isRequesting?: boolean;
  /** Why the last generate/retry request failed, if it did. */
  requestError?: string | null;
}

function message({
  status,
  languageLabel,
  error,
}: CaptionsStatusProps): string | null {
  switch (status) {
    case 'generating':
      return `Generating ${languageLabel} captions… usually a few minutes`;
    case 'ready':
      return `${languageLabel} captions ready`;
    case 'failed':
      return `${languageLabel} captions failed: ${error ?? 'unknown reason'}`;
    case 'unsupported':
      return `Mux can't generate ${languageLabel} captions`;
    case 'no_token':
      return "Add a Mux API token to this course's Mux credentials to generate captions";
    case 'none':
      return 'No captions yet';
    case 'not_mux':
      return null;
  }
}

/** One line under the preview: where this video's Mux captions stand, and the way forward. */
export function CaptionsStatus(props: CaptionsStatusProps) {
  const text = message(props);
  if (text === null) return null;
  const action =
    props.status === 'failed'
      ? 'Retry'
      : props.status === 'none'
        ? 'Generate captions'
        : null;
  return (
    <div className="flex flex-col gap-1">
      <output className="flex flex-wrap items-center gap-2 text-tertiary text-sm">
        <span>{text}</span>
        {action && props.onRequest && (
          <Button
            type="button"
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-apple-9 px-3.5 py-2 font-medium text-apple-contrast text-sm',
              'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
              'disabled:cursor-wait',
            )}
            onClick={props.onRequest}
            disabled={props.isRequesting}
            aria-busy={props.isRequesting || undefined}
          >
            {props.isRequesting && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            )}
            {props.isRequesting ? 'Requesting…' : action}
          </Button>
        )}
      </output>
      {props.requestError && (
        // Outside the <output>: a live region must not nest in another.
        <p role="alert" className="text-error-text text-sm">
          {props.requestError}
        </p>
      )}
    </div>
  );
}

/** The status line when the status itself couldn't be read — never silence. */
export function CaptionsStatusLoadError() {
  return (
    <output className="text-tertiary text-sm">
      Couldn't load captions status
    </output>
  );
}
