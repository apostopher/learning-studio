import { motion, useReducedMotion } from 'motion/react';

type KeyPointsProps = {
  points: string[] | null;
};

export const KeyPoints = ({ points }: KeyPointsProps) => {
  const reduced = useReducedMotion();

  if (!points || points.length === 0) {
    return (
      <p className="text-sm text-secondary">
        No key points available for this lesson yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {points.map((point, index) => (
        <motion.li
          key={point}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.25,
            delay: reduced ? 0 : index * 0.04,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="flex items-start gap-3 rounded-lg border border-gray-6 bg-gray-2 p-3"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-inverted px-1.5 text-[11px] font-semibold tabular-nums text-gray-1"
          >
            {index + 1}
          </span>
          <div
            className="material-prose text-sm leading-relaxed text-balance text-primary"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: lesson key points are stored as sanitized HTML upstream
            dangerouslySetInnerHTML={{ __html: point }}
          />
        </motion.li>
      ))}
    </ol>
  );
};
