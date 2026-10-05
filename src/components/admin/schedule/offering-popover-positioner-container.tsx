import { Popover } from '@base-ui/react/popover';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { offeringPopoverAnchorAtom } from '#/atoms/schedule';
import { toVirtualElement } from './popover-anchor';

/**
 * The only reader of the anchor atom. While previewing, pointermove rewrites
 * the anchor every frame; isolating the read here means only this element
 * re-renders — `children` (the whole form) is created by the parent and keeps
 * its identity, so React skips it.
 *
 * `side="right"` keeps the popover beside the cursor rather than under it, so
 * it never covers the bar being pointed at; Base UI's collision avoidance
 * flips it left near the screen edge and shifts it vertically to fit.
 */
export const OfferingPopoverPositionerContainer = ({
  children,
}: {
  children: ReactNode;
}) => {
  const anchor = useAtomValue(offeringPopoverAnchorAtom);
  return (
    <Popover.Positioner
      anchor={anchor ? toVirtualElement(anchor) : null}
      side="right"
      align="start"
      sideOffset={16}
      collisionPadding={16}
      className="z-50"
    >
      {children}
    </Popover.Positioner>
  );
};
