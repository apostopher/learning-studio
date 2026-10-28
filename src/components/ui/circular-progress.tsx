import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

type CircularProgressProps = {
  value: number;
  size?: number;
  strokeWidth?: number;
  ariaLabel: string;
  showLabel?: boolean;
  className?: string;
  /**
   * `debrief`: a red disc with "D" inside the ring. `passed`: the ring forced
   * full with a tick. The accessible name is `ariaLabel`; the glyphs are
   * decorative.
   */
  badge?: 'debrief' | 'passed';
};

export const CircularProgress = ({
  value,
  size = 28,
  strokeWidth = 8,
  ariaLabel,
  showLabel = true,
  className,
  badge,
}: CircularProgressProps) => {
  const reduced = useReducedMotion();
  const clamped = badge === 'passed' ? 100 : Math.max(0, Math.min(100, value));
  const label = `${Math.round(clamped)}%`;
  const radius = 50 - strokeWidth / 2;

  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={label}
      className={[
        'relative inline-flex shrink-0 items-center justify-center',
        className ?? '',
      ]
        .join(' ')
        .trim()}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-gray-a4)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-accent-9)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={1}
          initial={false}
          animate={{ pathLength: clamped / 100 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: 'spring', bounce: 0.2, visualDuration: 0.6 }
          }
        />
      </svg>
      {badge === 'debrief' ? (
        <span
          aria-hidden="true"
          // Contrast, computed (WCAG 2.1 relative luminance) from
          // theme.generated.css: text-on-error (--color-error-contrast) on
          // bg-error (--color-error-solid) is white on #cb0d39 = 5.74:1 in
          // light and black on #f44f5f = 6.13:1 in dark. NOT text-black
          // everywhere: black on the light solid is only 3.66:1, and white on
          // the dark solid only 3.43:1.
          className="absolute inset-[3px] flex items-center justify-center rounded-full bg-error text-[11px] font-bold leading-none text-on-error"
        >
          D
        </span>
      ) : null}
      {badge === 'passed' ? (
        <span
          aria-hidden="true"
          // The ring's own stroke is accent-9 (gold), but gold-9 is 1.66:1 on
          // the light panel (#d9cc3d on #fff) and fails the 3:1 non-text floor
          // there. text-accent-text (--color-gold-text) is the same hue and
          // measures: light #494520 on #fff 9.74:1, on #f4f7fc 9.07:1, on the
          // active row accent-3 #eeebc3 8.03:1; dark #f0e677 on #1A2F40
          // 10.69:1, on accent-3 #413d0d 8.58:1.
          className="absolute inset-0 flex items-center justify-center text-accent-text"
        >
          <Check size={12} strokeWidth={3} />
        </span>
      ) : null}
      {showLabel && !badge ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-[9px] font-medium tabular-nums text-primary"
        >
          {label}
        </span>
      ) : null}
    </span>
  );
};
