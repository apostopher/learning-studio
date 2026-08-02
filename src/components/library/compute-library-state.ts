import type { LibraryFile } from '#/lib/library-gating';

export type LibraryPageState =
  | { kind: 'loading' }
  | { kind: 'error' }
  /** The course has no library files at all. */
  | { kind: 'empty' }
  | {
      kind: 'files';
      files: readonly LibraryFile[];
      total: number;
      unlocked: number;
      /**
       * Files exist but none are earned yet. A distinct branch from `empty`:
       * a wall of padlocks with no preamble reads as broken, so the page says
       * what unlocks them.
       */
      allLocked: boolean;
    };

/**
 * Map one query's state onto what the page renders. Pure, so every branch —
 * including the two that are hard to reach with real data — is testable
 * without a QueryClient.
 */
export function computeLibraryState({
  isLoading,
  isError,
  files,
}: {
  isLoading: boolean;
  isError: boolean;
  files: readonly LibraryFile[] | undefined;
}): LibraryPageState {
  // Error before loading: a refetch that fails leaves `isLoading` false and
  // `isError` true, but a background refetch of already-good data must not
  // blank the page — hence checking data presence in the error branch.
  if (isError && !files) return { kind: 'error' };
  if (isLoading || !files) return { kind: 'loading' };
  if (files.length === 0) return { kind: 'empty' };

  const unlocked = files.filter((f) => f.lock.kind === 'open').length;
  return {
    kind: 'files',
    files,
    total: files.length,
    unlocked,
    allLocked: unlocked === 0,
  };
}
