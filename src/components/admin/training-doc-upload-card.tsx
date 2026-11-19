import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Upload } from 'lucide-react';
import {
  DOC_SOURCE_LABELS,
  type DocSource,
  DocSourceSchema,
} from '#/lib/doc-source';

export type UploadStatus = 'idle' | 'uploading' | 'processing';

interface TrainingDocUploadCardProps {
  fileName: string | null;
  onPickFile: (file: File) => void;
  docName: string;
  onDocNameChange: (value: string) => void;
  onSubmit: () => void;
  status: UploadStatus;
  error: string | null;
  /**
   * When given, a required "Source" choice (ITPS / 3D Airmanship) with nothing
   * picked by default: the shared training docs have no course to imply one,
   * so the admin must say which set a document belongs to before it uploads.
   */
  source?: {
    value: DocSource | null;
    onChange: (value: DocSource) => void;
  };
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: 'Upload Document',
  uploading: 'Uploading…',
  processing: 'Processing embeddings…',
};

/**
 * "Upload Training Document" card: dropzone + name + submit. Presentational and
 * HOOKLESS — the dropzone is a `<label>` wrapping a hidden file input (clicking
 * the label opens the picker natively; no `useRef`).
 */
export const TrainingDocUploadCard = ({
  fileName,
  onPickFile,
  docName,
  onDocNameChange,
  onSubmit,
  status,
  error,
  source,
}: TrainingDocUploadCardProps) => {
  const busy = status !== 'idle';
  // A missing source or file blocks the upload, and the button says which in
  // its own visible label — which is its accessible name too. Source first:
  // it is the choice with no default, and the first thing a reader scanning
  // the card for "why can't I upload?" should be pointed at.
  const needsSource = source !== undefined && source.value === null;
  const label = busy
    ? STATUS_LABEL[status]
    : needsSource
      ? 'Choose a source first'
      : !fileName
        ? 'Choose a file first'
        : STATUS_LABEL.idle;

  return (
    <section className="rounded-xl border border-gray-6 bg-gray-2 p-6">
      <h2 className="font-semibold text-primary text-lg">
        Upload Training Document
      </h2>

      <span className="mbs-4 block text-secondary text-sm">
        Select Document
      </span>
      <label
        className={`mbs-2 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-gray-6 border-dashed px-6 py-12 text-center transition-colors hover:border-gray-8 focus-within:ring-2 focus-within:ring-apple-9 ${
          busy ? 'pointer-events-none bg-gray-2' : ''
        }`}
      >
        <input
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickFile(file);
            e.currentTarget.value = '';
          }}
        />
        <Upload className="h-6 w-6 text-tertiary" aria-hidden="true" />
        <span className="font-medium text-primary">
          {fileName ?? 'Click to upload PDF or Word document'}
        </span>
        <span className="text-tertiary text-sm">
          Only .pdf and .docx files are supported
        </span>
      </label>

      <label
        htmlFor="training-doc-name"
        className="mbs-6 block text-secondary text-sm"
      >
        Document Name
      </label>
      <input
        id="training-doc-name"
        value={docName}
        onChange={(e) => onDocNameChange(e.target.value)}
        placeholder="Enter a name for this document"
        disabled={busy}
        className="mbs-2 w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary placeholder:text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:bg-gray-2 disabled:text-secondary"
      />
      <p className="mbs-1 text-tertiary text-xs">
        Optional — defaults to the file name. Identifies the document in the
        system.
      </p>

      {source ? (
        <div className="mbs-6">
          <span
            id="training-doc-source-label"
            className="block text-secondary text-sm"
          >
            Source
          </span>
          <RadioGroup
            aria-labelledby="training-doc-source-label"
            aria-required="true"
            required
            disabled={busy}
            value={source.value}
            onValueChange={(next) => source.onChange(next as DocSource)}
            className="mbs-2 flex flex-wrap gap-2"
          >
            {DocSourceSchema.options.map((value) => (
              <Radio.Root
                key={value}
                value={value}
                className="cursor-pointer rounded-lg border border-gray-6 bg-gray-1 px-4 py-2 font-medium text-primary text-sm transition-colors hover:border-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 data-[checked]:border-apple-9 data-[checked]:bg-apple-9 data-[checked]:text-apple-contrast data-[disabled]:cursor-not-allowed"
              >
                {DOC_SOURCE_LABELS[value]}
              </Radio.Root>
            ))}
          </RadioGroup>
          <p className="mbs-1 text-tertiary text-xs">
            Which training set this document belongs to.
          </p>
        </div>
      ) : null}

      {error ? <p className="mbs-3 text-error-text text-sm">{error}</p> : null}

      <div className="mbs-6 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!fileName || busy || needsSource}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-3 px-4 py-2 font-medium text-primary transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:bg-gray-2 disabled:text-secondary disabled:hover:bg-gray-2"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      </div>
    </section>
  );
};
