import { motion, useReducedMotion } from "motion/react";

type CircularProgressProps = {
  value: number;
  size?: number;
  strokeWidth?: number;
  ariaLabel: string;
  showLabel?: boolean;
  className?: string;
};

export const CircularProgress = ({
  value,
  size = 28,
  strokeWidth = 8,
  ariaLabel,
  showLabel = true,
  className,
}: CircularProgressProps) => {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, value));
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
        "relative inline-flex shrink-0 items-center justify-center",
        className ?? "",
      ]
        .join(" ")
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
              : { type: "spring", bounce: 0.2, visualDuration: 0.6 }
          }
        />
      </svg>
      {showLabel ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-[9px] font-medium tabular-nums text-gray-12"
        >
          {label}
        </span>
      ) : null}
    </span>
  );
};
