type ScoreRingProps = {
  score: number;
  size?: number;
  strokeWidth?: number;
};

export const ScoreRing = ({
  score,
  size = 80,
  strokeWidth = 6,
}: ScoreRingProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80
      ? 'var(--color-green-9, #30a46c)'
      : score >= 50
        ? 'var(--color-amber-9, #f5a623)'
        : 'var(--color-red-9, #e5484d)';

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ inlineSize: size, blockSize: size }}
      role="img"
      aria-label={`Score: ${score}%`}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ inlineSize: size, blockSize: size }}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-gray-4)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
        />
      </svg>
      <span className="absolute text-lg font-bold text-primary">{score}%</span>
    </div>
  );
};
