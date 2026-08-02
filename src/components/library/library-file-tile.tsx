import { Link } from "@tanstack/react-router";
import { Download, Lock } from "lucide-react";
import { fileTypeIconKind, formatFileSize } from "#/lib/library-file-display";
import type { LibraryFile } from "#/lib/library-gating";
import { FileTypeIcon } from "./file-type-icon";

type LibraryFileTileProps = {
  file: LibraryFile;
  courseSlug: string;
  /** Position in the grid, for the capped CSS entrance stagger (D19). */
  index: number;
};

/**
 * One file in the library grid.
 *
 * A locked tile states its reason in visible text and links to the lesson that
 * clears it (D16). It is deliberately NOT dimmed to 60% opacity the way the old
 * page did: that put the explanation itself below AA contrast, and a reason
 * nobody can read is the same as no reason. The locked state reads as locked
 * through the padlock and the absent download button instead.
 */
export const LibraryFileTile = ({
  file,
  courseSlug,
  index,
}: LibraryFileTileProps) => {
  const isOpen = file.lock.kind === "open";

  return (
    <li
      className="library-tile flex flex-col justify-between gap-2 rounded-element border border-border bg-card p-3 transition-colors hover:border-border-emphasized"
      // The stagger index. A custom property rather than an inline
      // animation-delay so the cap and the timing live in one place in CSS.
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <FileTypeIcon kind={fileTypeIconKind(file.type, file.name)} />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="line-clamp-2 text-sm font-medium text-primary">
            {decodeURIComponent(file.name)}
          </h3>
          <span className="text-xs text-secondary">
            {formatFileSize(file.size)}
          </span>
        </div>

        {isOpen ? (
          <a
            href={`/api/library/download/${file.id}`}
            className="library-tile__download flex shrink-0 items-center justify-center rounded-inner bg-accent p-2 text-on-accent transition-opacity hover:opacity-90"
            aria-label={`Download ${file.name}`}
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
        ) : (
          <span
            className="flex shrink-0 items-center justify-center p-2 text-secondary"
            aria-hidden="true"
          >
            <Lock className="size-4" />
          </span>
        )}
      </div>

      {file.lock.kind === "lesson-locked" && (
        <p className="text-xs text-secondary">
          <Link
            to="/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug"
            params={{
              courseSlug,
              moduleSlug: file.lock.moduleSlug,
              lessonSlug: file.lock.lessonSlug,
            }}
            className="underline decoration-dotted underline-offset-2 hover:text-primary"
          >
            {`Watch the video in ${file.lock.lessonName} to unlock`}
          </Link>
        </p>
      )}

      {file.lock.kind === "module-locked" && (
        // No link: a module has no page of its own to send anyone to.
        <p className="text-xs text-secondary">
          {`Finish every lesson in ${file.lock.moduleName} to unlock`}
        </p>
      )}
    </li>
  );
};
