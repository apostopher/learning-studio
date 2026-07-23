import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ReactNode, Ref } from "react";

type Orientation = "vertical" | "horizontal" | "both";

type ScrollAreaProps = {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  orientation?: Orientation;
  /** Ref to the scrolling viewport element — e.g. for `use-stick-to-bottom`,
   * which needs to read/set scrollTop on the actual scroll container. */
  viewportRef?: Ref<HTMLDivElement>;
};

export const ScrollArea = ({
  children,
  className,
  viewportClassName,
  orientation = "vertical",
  viewportRef,
}: ScrollAreaProps) => {
  const showVertical = orientation !== "horizontal";
  const showHorizontal = orientation !== "vertical";

  return (
    <BaseScrollArea.Root
      className={
        className ? `scroll-area-root ${className}` : "scroll-area-root"
      }
    >
      <BaseScrollArea.Viewport
        ref={viewportRef}
        data-orientation={orientation}
        className={
          viewportClassName
            ? `scroll-area-viewport ${viewportClassName}`
            : "scroll-area-viewport"
        }
      >
        <BaseScrollArea.Content
          className="scroll-area-content"
          style={{ minWidth: "0" }}
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      {showVertical ? (
        <BaseScrollArea.Scrollbar
          orientation="vertical"
          keepMounted
          className="scroll-area-scrollbar"
        >
          <BaseScrollArea.Thumb className="scroll-area-thumb" />
        </BaseScrollArea.Scrollbar>
      ) : null}
      {showHorizontal ? (
        <BaseScrollArea.Scrollbar
          orientation="horizontal"
          keepMounted
          className="scroll-area-scrollbar"
        >
          <BaseScrollArea.Thumb className="scroll-area-thumb" />
        </BaseScrollArea.Scrollbar>
      ) : null}
      {orientation === "both" ? (
        <BaseScrollArea.Corner className="scroll-area-corner" />
      ) : null}
    </BaseScrollArea.Root>
  );
};
