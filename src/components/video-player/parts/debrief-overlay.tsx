import { Loader2, NotebookPen } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type DebriefOverlayProps = {
  loading: boolean;
  onDebrief: () => void;
};

export const DebriefOverlay = ({ loading, onDebrief }: DebriefOverlayProps) => {
  const reduced = useReducedMotion();

  return (
    <div className="vp-overlay vp-debrief-overlay">
      <motion.button
        type="button"
        onClick={onDebrief}
        disabled={loading}
        aria-label={loading ? "Preparing debrief" : "Start debrief"}
        className="vp-debrief-button"
        initial={reduced ? false : { scale: 0.92, opacity: 0 }}
        animate={reduced ? undefined : { scale: 1, opacity: 1 }}
        whileHover={reduced || loading ? undefined : { scale: 1.03 }}
        whileTap={reduced || loading ? undefined : { scale: 0.97 }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", bounce: 0.3, visualDuration: 0.3 }
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.span
              key="spinner"
              aria-hidden="true"
              className="vp-debrief-icon"
              animate={{ rotate: 360 }}
              transition={{
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
                duration: 0.8,
              }}
            >
              <Loader2 size={20} />
            </motion.span>
          ) : (
            <motion.span
              key="icon"
              aria-hidden="true"
              className="vp-debrief-icon"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <NotebookPen size={20} />
            </motion.span>
          )}
        </AnimatePresence>
        {loading ? "Preparing…" : "Debrief"}
      </motion.button>
    </div>
  );
};
