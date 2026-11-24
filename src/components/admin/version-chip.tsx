import { Tooltip } from '@base-ui/react/tooltip';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '#/lib/cn';
import { formatVersion } from '#/lib/lesson-version';
import { chipClassName } from '../ui/chip';
import { IconButtonTooltip } from '../ui/tooltip-icon-button';

export type VersionChipProps = {
  /** The version this course is on. */
  version: string;
  /** The version Disciplines is on: what updating takes. */
  disciplineVersion: string;
  onUpdate?: () => void;
  /** This course is being moved: the chip goes inert and says so. */
  isPending?: boolean;
};

function chipTooltip({
  version,
  disciplineVersion,
  onUpdate,
  isPending,
}: VersionChipProps): string {
  const latest = formatVersion(disciplineVersion);
  if (version === disciplineVersion) return 'Up to date with Disciplines';
  if (isPending) return `Updating to ${latest}…`;
  return onUpdate
    ? `Disciplines has ${latest}. Update this lesson`
    : `Disciplines has ${latest}`;
}

/**
 * Which version of a lesson a course is on. Green when Disciplines is on the
 * same one; gold, with an arrow, when there is another to update to.
 *
 * Inert means `aria-disabled` and no handler, not `disabled`: the tooltip is
 * where the reason is, see `tooltip-icon-button.tsx`. No dimming either, the
 * version has to stay readable.
 *
 * The accessible name starts with the version the chip shows, so it is read
 * out, and "click v1.0" finds it by voice.
 */
export const VersionChip = (props: VersionChipProps) => {
  const { version, disciplineVersion, onUpdate, isPending = false } = props;
  const isCurrent = version === disciplineVersion;
  const update = isCurrent || isPending ? undefined : onUpdate;
  const tooltip = chipTooltip(props);
  return (
    // Closes as soon as the pointer leaves — see `tooltip-icon-button.tsx`.
    <Tooltip.Root disableHoverablePopup>
      <Tooltip.Trigger
        render={<button type="button" />}
        onClick={update}
        aria-disabled={update === undefined || undefined}
        aria-label={`${formatVersion(version)}. ${tooltip}`}
        className={chipClassName(
          // Not `solid-success`: its text is under 7:1 in the light theme.
          isCurrent ? 'soft-success' : 'solid-accent',
          cn(
            'gap-1 normal-case tabular-nums focus-visible:outline-2 focus-visible:outline-apple-9 focus-visible:outline-offset-2',
            update
              ? 'cursor-pointer transition-colors hover:bg-accent-10'
              : 'cursor-not-allowed',
          ),
        )}
      >
        {formatVersion(version)}
        {!isCurrent &&
          (isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          ))}
      </Tooltip.Trigger>
      <IconButtonTooltip label={tooltip} />
    </Tooltip.Root>
  );
};
