import { FolderOpen, Info } from 'lucide-react';
import type { LibraryPageState } from './compute-library-state';
import { LibraryFileTile } from './library-file-tile';
import { LibraryIconSprite } from './library-icon-sprite';

type LibraryPageProps = {
  state: LibraryPageState;
  courseSlug: string;
};

/**
 * The student library: every file attached to this course, with the ones the
 * learner has earned downloadable and the rest explaining what unlocks them.
 *
 * Flat grid rather than grouped by module, matching the old page. Ordering
 * carries the meaning instead: unlocked first, then course order.
 *
 * The <h1> lives here, not in the app header — the header's trailing nav
 * already shows "Library" as the active destination, and repeating it as a
 * pinned title would read as "Library ......... Library". The nav item marks
 * WHERE you are; the heading names WHAT you are looking at.
 */
const Shell = ({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: { unlocked: number; total: number };
}) => (
  <div className="content-grid py-8">
    <div className="content flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold text-primary">Library</h1>
        {count && (
          <span className="text-sm text-secondary">
            {count.unlocked === count.total
              ? `${count.total} ${count.total === 1 ? 'file' : 'files'}`
              : `${count.unlocked} of ${count.total} available`}
          </span>
        )}
      </header>
      {children}
    </div>
  </div>
);

export const LibraryPage = ({ state, courseSlug }: LibraryPageProps) => {
  if (state.kind === 'loading') {
    return (
      <Shell>
        <p className="text-sm text-secondary">Loading library…</p>
      </Shell>
    );
  }

  if (state.kind === 'error') {
    return (
      <Shell>
        <p className="text-sm text-error-text">
          Failed to load your library. Please try again.
        </p>
      </Shell>
    );
  }

  if (state.kind === 'empty') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 rounded-element border border-dashed border-border bg-muted px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-gray-a3 text-secondary">
            <FolderOpen className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-primary">
            No library files for this course yet
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell count={{ unlocked: state.unlocked, total: state.total }}>
      <LibraryIconSprite />

      {state.allLocked && (
        <p className="flex items-center gap-2 rounded-inner border border-border bg-muted px-3 py-2 text-sm text-secondary">
          <Info className="size-4 shrink-0" aria-hidden="true" />
          Files unlock as you complete the lessons they belong to.
        </p>
      )}

      <ul className="library-grid grid-auto-fit list-none p-0">
        {state.files.map((file, index) => (
          <LibraryFileTile
            key={file.id}
            file={file}
            courseSlug={courseSlug}
            index={index}
          />
        ))}
      </ul>
    </Shell>
  );
};
