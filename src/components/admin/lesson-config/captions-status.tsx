import { Button } from '@base-ui/react/button';
import type { LessonCaptions } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';

export interface CaptionsStatusProps {
  status: LessonCaptions['status'];
  languageLabel: string;
  error: string | null;
  onRequest?: () => void;
  isRequesting?: boolean;
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
    <output className="flex flex-wrap items-center gap-2 text-tertiary text-sm">
      <span>{text}</span>
      {action && props.onRequest && (
        <Button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-apple-9 px-3.5 py-2 font-medium text-apple-contrast text-sm',
            'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
            'disabled:opacity-60',
          )}
          onClick={props.onRequest}
          disabled={props.isRequesting}
        >
          {props.isRequesting ? 'Requesting…' : action}
        </Button>
      )}
    </output>
  );
}
