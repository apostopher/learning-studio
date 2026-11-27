type LockedModulePreviewProps = {
  modules: readonly { slug: string; name: string }[];
  /** Why the modules are closed and what opens them. */
  note: string;
};

/**
 * The 3D Airmanship modules for a pilot with no level: their names only, read
 * only and fading out, under a note saying how to get them (user,
 * 2026-11-27). The note sits on a solid, rounded panel so the faded rows
 * behind it never run through its text.
 *
 * The rows are not links: with no level the pilot can open none of these
 * lessons (`#/lib/level-visibility`).
 */
export const LockedModulePreview = ({
  modules,
  note,
}: LockedModulePreviewProps) => (
  // A floor on the height, so even one faded row leaves the note room.
  <div className="relative min-h-32">
    <ol
      aria-label="3D Airmanship modules, not open to you yet"
      className="flex flex-col gap-sidebar-row-gap select-none [mask-image:linear-gradient(to_bottom,black,transparent)]"
    >
      {modules.map((module, index) => (
        <li
          key={module.slug}
          className="flex items-center gap-2 px-sidebar-row-inline py-sidebar-row-block text-sm text-secondary"
        >
          <span className="tabular-nums text-tertiary text-xs font-medium shrink-0">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="flex-1 min-w-0 truncate">{module.name}</span>
        </li>
      ))}
    </ol>
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-sidebar-row-inline">
      <p className="rounded-lg border border-gray-6 bg-gray-2 px-3 py-2.5 text-center text-sm text-primary shadow-sm">
        {note}
      </p>
    </div>
  </div>
);
