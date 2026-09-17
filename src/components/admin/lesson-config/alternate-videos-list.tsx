import { Trash2 } from 'lucide-react';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import type { AlternateLang } from '#/lib/video-languages';

type AlternateVideoRow = {
  lang: AlternateLang;
  label: string;
  providerLabel: string;
  removing: boolean;
};

interface AlternateVideosListProps {
  rows: AlternateVideoRow[];
  onRemove: (lang: AlternateLang) => void;
}

/** The languages a lesson's video is offered in besides English. Pure. */
export const AlternateVideosList = ({
  rows,
  onRemove,
}: AlternateVideosListProps) => {
  if (rows.length === 0) {
    return (
      <p className="text-tertiary text-sm">
        No other languages yet — learners see this lesson in English only.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-gray-6 rounded-lg border border-gray-6">
      {rows.map((row) => (
        <li key={row.lang} className="flex items-center gap-3 px-3.5 py-2.5">
          <span className="rounded bg-gray-3 px-1.5 py-0.5 font-medium text-secondary text-xs uppercase">
            {row.lang}
          </span>
          <span className="min-w-0 flex-1 truncate text-primary text-sm">
            {row.label}
          </span>
          <span className="text-tertiary text-xs">{row.providerLabel}</span>
          <button
            type="button"
            onClick={() => onRemove(row.lang)}
            disabled={row.removing}
            aria-label={`Remove ${row.label}`}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
};
