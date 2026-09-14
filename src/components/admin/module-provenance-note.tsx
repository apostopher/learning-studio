import type { ReactNode } from 'react';
import { Chip } from '../ui/chip';

/**
 * Where a BORROWED module is edited, drawn as one quiet line inside the
 * module's body — never in its header row.
 *
 * The header of every module on a rail must read the same way: name, lesson
 * count, drag handle. A chip and a link in that row pushed the name and the
 * count off the edge of a borrowed module, so the borrowed rows looked like a
 * different kind of thing. They are not: position is this course's, the
 * cards below are the same cards. What differs is who may edit them, and that
 * sentence belongs next to the locked cards it explains.
 */
export const ModuleProvenanceNote = ({
  ownerName,
  editLinkSlot,
}: {
  ownerName: string;
  /** The router link the container builds; carries reason + remedy in its name. */
  editLinkSlot: ReactNode;
}) => (
  <div className="flex items-center gap-2 text-xs">
    <Chip tone="soft-apple">from {ownerName}</Chip>
    {editLinkSlot}
  </div>
);
