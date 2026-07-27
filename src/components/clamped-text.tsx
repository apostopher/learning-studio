import { Tooltip } from '@base-ui/react/tooltip';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Why this component exists:
 * - Checked: no Base UI primitive shows a tooltip *only when text is clamped*.
 * - Needs DOM measurement (scrollHeight vs clientHeight) + a ResizeObserver to
 *   detect overflow, so it owns a ref and that measurement state.
 *
 * Clamps `text` to `lines` lines; when it overflows (shows an ellipsis),
 * hovering reveals the full text in a tooltip. Requires a Tooltip.Provider
 * ancestor.
 */
export const ClampedText = ({
  text,
  lines = 2,
  className,
}: {
  text: string;
  lines?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight - el.clientHeight > 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <span
            ref={ref}
            style={{ '--clamp-lines': lines } as CSSProperties}
            className={cn('line-clamp-[var(--clamp-lines)]', className)}
          >
            {text}
          </span>
        }
      />
      {overflowing && (
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6} className="z-50">
            <Tooltip.Popup className="max-w-xs break-words rounded-md bg-inverted px-2 py-1 text-xs font-medium text-gray-1 shadow-md">
              {text}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
};
