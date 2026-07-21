import { Upload } from 'lucide-react';

export type UploadStatus = 'idle' | 'uploading' | 'processing';

interface TrainingDocUploadCardProps {
  fileName: string | null;
  onPickFile: (file: File) => void;
  docName: string;
  onDocNameChange: (value: string) => void;
  onSubmit: () => void;
  status: UploadStatus;
  error: string | null;
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
}: TrainingDocUploadCardProps) => {
  const busy = status !== 'idle';

  return (
    <section className="rounded-xl border border-gray-6 bg-gray-2 p-6">
      <h2 className="font-semibold text-gray-12 text-lg">
        Upload Training Document
      </h2>

      <span className="mt-4 block text-gray-11 text-sm">Select Document</span>
      <label
        className={`mt-2 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-gray-6 border-dashed px-6 py-12 text-center transition-colors hover:border-gray-8 focus-within:ring-2 focus-within:ring-apple-9 ${
          busy ? 'pointer-events-none opacity-60' : ''
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
        <Upload className="h-6 w-6 text-gray-10" aria-hidden="true" />
        <span className="font-medium text-gray-12">
          {fileName ?? 'Click to upload PDF or Word document'}
        </span>
        <span className="text-gray-10 text-sm">
          Only .pdf and .docx files are supported
        </span>
      </label>

      <label
        htmlFor="training-doc-name"
        className="mt-6 block text-gray-11 text-sm"
      >
        Document Name
      </label>
      <input
        id="training-doc-name"
        value={docName}
        onChange={(e) => onDocNameChange(e.target.value)}
        placeholder="Enter a name for this document"
        disabled={busy}
        className="mt-2 w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
      />
      <p className="mt-1 text-gray-10 text-xs">
        Optional — defaults to the file name. Identifies the document in the
        system.
      </p>

      {error ? <p className="mt-3 text-red-11 text-sm">{error}</p> : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!fileName || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-3 px-4 py-2 font-medium text-gray-12 transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {STATUS_LABEL[status]}
        </button>
      </div>
    </section>
  );
};
