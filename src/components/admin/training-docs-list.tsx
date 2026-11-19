import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Search } from 'lucide-react';
import {
  DOC_SOURCE_LABELS,
  type DocSource,
  DocSourceSchema,
} from '#/lib/doc-source';
import { TrainingDocRow } from './training-doc-row';

export type DocSourceFilter = DocSource | 'all';

const FILTER_OPTIONS: { value: DocSourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...DocSourceSchema.options.map((value) => ({
    value,
    label: DOC_SOURCE_LABELS[value],
  })),
];

interface TrainingDocsListProps {
  docs: { sourcePath: string; count: number; source?: DocSource }[];
  search: string;
  onSearchChange: (value: string) => void;
  /**
   * When given, an All / ITPS / 3D Airmanship control sits beside the search
   * and narrows the list together with it. Absent in the course dialog, whose
   * docs all belong to one course.
   */
  sourceFilter?: {
    value: DocSourceFilter;
    onChange: (value: DocSourceFilter) => void;
  };
  onDelete: (sourcePath: string) => void;
  deletingSourcePath: string | null;
  isLoading: boolean;
}

/** "Training Documents" card: count, search, rows, empty/loading states. */
export const TrainingDocsList = ({
  docs,
  search,
  onSearchChange,
  sourceFilter,
  onDelete,
  deletingSourcePath,
  isLoading,
}: TrainingDocsListProps) => {
  const term = search.trim().toLowerCase();
  const source = sourceFilter?.value ?? 'all';
  const filtered = docs.filter(
    (d) =>
      (source === 'all' || d.source === source) &&
      d.sourcePath.toLowerCase().includes(term),
  );
  const noMatch =
    source === 'all'
      ? `No documents match "${search}".`
      : search.trim()
        ? `No ${DOC_SOURCE_LABELS[source]} documents match "${search}".`
        : `No ${DOC_SOURCE_LABELS[source]} documents yet.`;

  return (
    <section className="mt-6 rounded-xl border border-gray-6 bg-gray-2 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-semibold text-primary text-lg">
          Training Documents{' '}
          <span className="font-normal text-tertiary text-sm">
            {docs.length} documents
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {sourceFilter ? (
            <RadioGroup
              aria-label="Filter by source"
              value={sourceFilter.value}
              onValueChange={(next) =>
                sourceFilter.onChange(next as DocSourceFilter)
              }
              className="flex rounded-lg border border-gray-6 bg-gray-1 p-0.5"
            >
              {FILTER_OPTIONS.map((option) => (
                <Radio.Root
                  key={option.value}
                  value={option.value}
                  className="cursor-pointer rounded-md px-3 py-1.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 data-[checked]:bg-gray-4 data-[checked]:text-primary"
                >
                  {option.label}
                </Radio.Root>
              ))}
            </RadioGroup>
          ) : null}
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
              className="rounded-lg border border-gray-6 bg-gray-1 py-2 ps-9 pe-3 text-primary placeholder:text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            />
          </div>
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
          <p className="py-8 text-center text-tertiary text-sm">{noMatch}</p>
        ) : (
          filtered.map((doc) => (
            <TrainingDocRow
              key={doc.sourcePath}
              sourcePath={doc.sourcePath}
              count={doc.count}
              source={doc.source}
              onDelete={() => onDelete(doc.sourcePath)}
              isDeleting={deletingSourcePath === doc.sourcePath}
            />
          ))
        )}
      </div>
    </section>
  );
};
