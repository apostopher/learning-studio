import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ReactNode } from "react";

type Orientation = "vertical" | "horizontal" | "both";

type ScrollAreaProps = {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  orientation?: Orientation;
};

export const ScrollArea = ({
  children,
  className,
  viewportClassName,
  orientation = "vertical",
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
