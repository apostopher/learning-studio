import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import type { ChangeEventHandler } from 'react';
import { cn } from '@/lib/cn';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

interface CourseImageFieldProps {
  /** URL to preview (the uploaded WebP), or null when nothing is set. */
  previewUrl: string | null;
  status: 'idle' | 'busy' | 'error';
  errorMessage?: string;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
}

/** Cover-image picker: click to select, shows preview + optimize/upload state. */
export const CourseImageField = ({
  previewUrl,
  status,
  errorMessage,
  onSelectFile,
  onRemove,
}: CourseImageFieldProps) => {
  const busy = status === 'busy';

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (file) onSelectFile(file);
    // Reset so selecting the same file again still fires change.
    event.target.value = '';
  };

  return (
    <div className="flex flex-col gap-1.5">
      {previewUrl ? (
        <div className="relative aspect-video overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
          <img
            src={previewUrl}
            alt="Course cover preview"
            className="h-full w-full object-cover"
          />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-1/60">
              <Loader2
                className="h-5 w-5 animate-spin text-gray-12"
                aria-hidden="true"
              />
            </div>
          )}
          {!busy && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove cover image"
              className="absolute end-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-1/80 text-gray-11 backdrop-blur transition-colors hover:bg-gray-1 hover:text-red-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-9"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <label
          className={cn(
            'flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-6 bg-gray-1 text-center text-gray-11 transition-colors',
            'hover:border-gray-8 hover:text-gray-12 focus-within:ring-2 focus-within:ring-apple-9',
            busy && 'pointer-events-none opacity-70',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span className="text-sm">Optimizing &amp; uploading…</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6" aria-hidden="true" />
              <span className="text-sm font-medium">
                Click to upload a cover
              </span>
              <span className="text-xs text-gray-10">
                JPEG, PNG, WebP or AVIF · up to 8MB
              </span>
            </>
          )}
          <input
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={handleChange}
            disabled={busy}
          />
        </label>
      )}
      {status === 'error' && (
        <p role="alert" className="text-sm text-red-11">
          {errorMessage ?? 'Upload failed.'}
        </p>
      )}
    </div>
  );
};
