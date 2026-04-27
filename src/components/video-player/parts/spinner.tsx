import { Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

type SpinnerProps = {
  label: string;
};

export const Spinner = ({ label }: SpinnerProps) => {
  const reduced = useReducedMotion();
  return (
    <div className="vp-overlay" role="status">
      <span className="vp-sr-only">{label}</span>
      {reduced ? (
        <span aria-hidden="true" className="text-sm">
          {label}…
        </span>
      ) : (
        <motion.span
          aria-hidden="true"
          animate={{ rotate: 360 }}
          transition={{
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear',
            duration: 0.8,
          }}
          style={{ display: 'inline-flex', color: 'var(--color-accent-9)' }}
        >
          <Loader2 size={36} />
        </motion.span>
      )}
    </div>
  );
};
