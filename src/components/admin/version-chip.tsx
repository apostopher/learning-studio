import { Tooltip } from '@base-ui/react/tooltip';
import { ArrowUp } from 'lucide-react';
import { formatVersion } from '#/lib/lesson-version';
import { chipClassName } from '../ui/chip';
import { IconButtonTooltip } from '../ui/tooltip-icon-button';

export type VersionChipProps = {
  /** The version this course is on. */
  version: string;
  /** The version Disciplines is on. */
  disciplineVersion: string;
  /** The course whose column the lesson is removed from and added to. */
  editedIn: string;
};

/**
 * Which version of a lesson a course is on. Green when Disciplines is on the
 * same one; gold, with an arrow, when it is on another. A flag only: whoever
 * sees it decides, and updates by removing the lesson and dragging it in again.
 *
 * A button, inert by `aria-disabled` rather than `disabled`, so the tooltip
 * that says so can be reached by keyboard: see `tooltip-icon-button.tsx`. The
 * accessible name starts with the version the chip shows, so it is read out.
 */
export const VersionChip = ({
  version,
  disciplineVersion,
  editedIn,
}: VersionChipProps) => {
  const isCurrent = version === disciplineVersion;
  const tooltip = isCurrent
    ? 'Up to date with Disciplines'
    : `Disciplines has ${formatVersion(disciplineVersion)}. To update, remove this lesson from the ${editedIn} column in the knowledge library and drag it in again`;
  return (
    // Closes as soon as the pointer leaves — see `tooltip-icon-button.tsx`.
    <Tooltip.Root disableHoverablePopup>
      <Tooltip.Trigger
        render={<button type="button" />}
        aria-disabled
        aria-label={`${formatVersion(version)}. ${tooltip}`}
        className={chipClassName(
          // Not `solid-success`: its text is under 7:1 in the light theme.
          isCurrent ? 'soft-success' : 'solid-accent',
          'cursor-default gap-1 normal-case tabular-nums focus-visible:outline-2 focus-visible:outline-apple-9 focus-visible:outline-offset-2',
        )}
      >
        {formatVersion(version)}
        {!isCurrent && <ArrowUp className="h-3 w-3" aria-hidden="true" />}
      </Tooltip.Trigger>
      <IconButtonTooltip label={tooltip} />
    </Tooltip.Root>
  );
};
