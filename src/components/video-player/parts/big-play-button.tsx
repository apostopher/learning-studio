import { Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

type BigPlayButtonProps = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export const BigPlayButton = ({ label, onClick, disabled }: BigPlayButtonProps) => {
  const reduced = useReducedMotion();
  return (
    <div className="vp-overlay">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        initial={reduced ? false : { scale: 0.92, opacity: 0 }}
        animate={reduced ? undefined : { scale: 1, opacity: 1 }}
        whileHover={reduced || disabled ? undefined : { scale: 1.05 }}
        whileTap={reduced || disabled ? undefined : { scale: 0.95 }}
        transition={
          reduced ? { duration: 0 } : { type: 'spring', bounce: 0.3, visualDuration: 0.3 }
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          inlineSize: 80,
          blockSize: 80,
          borderRadius: '9999px',
          background: 'var(--color-accent-9)',
          color: 'var(--color-accent-contrast)',
          border: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <Play size={32} aria-hidden="true" style={{ marginInlineStart: 4 }} />
      </motion.button>
    </div>
  );
};
