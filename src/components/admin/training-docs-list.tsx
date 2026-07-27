import { Search } from 'lucide-react';
import { TrainingDocRow } from './training-doc-row';

interface TrainingDocsListProps {
  docs: { sourcePath: string; count: number }[];
  search: string;
  onSearchChange: (value: string) => void;
  onDelete: (sourcePath: string) => void;
  deletingSourcePath: string | null;
  isLoading: boolean;
}

/** "Training Documents" card: count, search, rows, empty/loading states. */
export const TrainingDocsList = ({
  docs,
  search,
  onSearchChange,
  onDelete,
  deletingSourcePath,
  isLoading,
}: TrainingDocsListProps) => {
  const filtered = docs.filter((d) =>
    d.sourcePath.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section className="mt-6 rounded-xl border border-gray-6 bg-gray-2 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-semibold text-primary text-lg">
          Training Documents{' '}
          <span className="font-normal text-tertiary text-sm">
            {docs.length} documents
          </span>
        </h2>
        <div className="relative">
          <Search
            className="-translate-y-1/2 absolute start-3 top-1/2 h-4 w-4 text-tertiary"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents…"
            aria-label="Search documents"
            className="rounded-lg border border-gray-6 bg-gray-1 py-2 ps-9 pe-3 text-primary placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {isLoading ? (
          <p className="py-8 text-center text-tertiary text-sm">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="py-8 text-center text-tertiary text-sm">
            No training documents yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-tertiary text-sm">
            No documents match "{search}".
          </p>
        ) : (
          filtered.map((doc) => (
            <TrainingDocRow
              key={doc.sourcePath}
              sourcePath={doc.sourcePath}
              count={doc.count}
              onDelete={() => onDelete(doc.sourcePath)}
              isDeleting={deletingSourcePath === doc.sourcePath}
            />
          ))
        )}
      </div>
    </section>
  );
};
