import { Loader2, Upload } from 'lucide-react';
import { useRef } from 'react';

/** .docx picker for the Material tab. Forwards the chosen file; reflects state. */
export const MaterialUpload = ({
  onFileSelected,
  isPending,
  error,
}: {
  onFileSelected: (file: File) => void;
  isPending: boolean;
  error?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-6 px-3.5 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending ? 'Generating…' : 'Fill form from Word doc (.docx)'}
      </button>
      <p className="text-tertiary text-xs">
        Extracts text, key points, pro tips, and quiz into the form below for
        review. Overwrites the current form values.
      </p>
      {error && (
        <p role="alert" className="text-error-text text-sm">
          {error}
        </p>
      )}
    </div>
  );
};
