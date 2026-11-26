import { LESSON_VERSION_NOTES_MAX } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';

/**
 * Notes on what changed in the version above: the SME's own reference.
 *
 * Custom because Base UI has no textarea part; it is styled to match the
 * Version input beside it.
 */
export const VersionNotesField = ({
  id,
  value,
  onChange,
  readOnly,
  isLoading,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  /** A save is in flight. Not `disabled`, which would drop keyboard focus. */
  readOnly: boolean;
  /** The saved notes have not arrived; typing now would be overwritten. */
  isLoading: boolean;
}) => {
  const hintId = `${id}-hint`;
  const locked = readOnly || isLoading;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-primary text-sm">
        What changed in this version{' '}
        <span className="font-normal text-secondary">(optional)</span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={locked}
        aria-busy={isLoading || undefined}
        aria-describedby={hintId}
        maxLength={LESSON_VERSION_NOTES_MAX}
        rows={4}
        placeholder={isLoading ? 'Loading notes…' : undefined}
        className={cn(
          'w-full resize-y rounded-lg border border-gray-6 px-3.5 py-2.5 text-base outline-none transition-colors duration-100 sm:text-sm',
          'hover:border-gray-8 focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
          locked
            ? 'cursor-default bg-gray-3 text-secondary'
            : 'bg-gray-1 text-primary',
        )}
      />
      <p id={hintId} className="text-secondary text-sm">
        For your reference only. Starts empty when you change the version.
      </p>
    </div>
  );
};
