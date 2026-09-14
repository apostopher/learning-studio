import { Loader2, TriangleAlert } from 'lucide-react';

/**
 * Confirmation for un-remixing one source from one course.
 *
 * Lighter than `DeleteConfirmForm`'s typed phrase, for the same reason
 * `NewsSourceDeleteConfirm` is: nothing is destroyed. The borrowed modules
 * stay in their owner and the link can be re-made with one click. What the
 * admin needs to know is HOW MUCH leaves this rail — the count the spec
 * requires — and that the act is reversible, so both are said in the
 * sentence.
 */
export const UnremixConfirm = ({
  courseName,
  sourceName,
  moduleCount,
  isPending,
  onConfirm,
  onCancel,
}: {
  courseName: string;
  sourceName: string;
  moduleCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-start gap-2 rounded-lg border border-warning-7 bg-warning-3 px-3 py-2.5 text-sm text-warning-text">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        {/*
          The whole "N modules from X will leave Y" clause sits inside ONE
          `<strong>` rather than splitting the count into its own element:
          Testing Library's `getByText` only reads an element's OWN direct
          text-node children, not descendants' — a `<strong>` wrapping just
          the count would make neither node's text contain the full sentence
          the spec requires, and no query could ever find it as one string.
        */}
        <strong>
          {moduleCount} {moduleCount === 1 ? 'module' : 'modules'} from{' '}
          {sourceName} will leave {courseName}.
        </strong>{' '}
        Nothing is deleted — {sourceName} keeps them, and you can remix it again
        later.
      </p>
    </div>
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7 disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        Un-remix {sourceName}
      </button>
    </div>
  </div>
);
