import { BrainCircuit, FlaskConical, PlayCircle, TrendingUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";

interface Feature {
  Icon: ComponentType<{ className?: string }>;
  heading: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    Icon: PlayCircle,
    heading: "Video Courses",
    body: "Structured modules with clear learning objectives and progress tracking.",
  },
  {
    Icon: BrainCircuit,
    heading: "AI-Driven Evaluation",
    body: "Answer questions and receive instant, context-aware feedback.",
  },
  {
    Icon: FlaskConical,
    heading: "Science-Based Retention",
    body: "Spaced repetition and active recall baked into every module.",
  },
  {
    Icon: TrendingUp,
    heading: "Progress Tracking",
    body: "See where you are and what to focus on next.",
  },
];

export const FeatureCards = () => {
  const shouldReduce = useReducedMotion();

  return (
  <section className="w-full bg-gray-1 pb-24">
    <div className="content-grid">
      <div className="content">
        {/* Negative block-start margin pulls cards up over the hero clip-path seam */}
        <div className="-mt-24 grid grid-cols-2 gap-4">
          {FEATURES.map(({ Icon, heading, body }, i) => (
            <motion.article
              key={heading}
              initial={shouldReduce ? false : { opacity: 0, y: 32 }}
              whileInView={shouldReduce ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
              viewport={{ once: true, margin: "-80px" }}
              className="flex flex-col gap-4 rounded-2xl border border-gray-6 bg-gray-surface/60 p-8 backdrop-blur-2xl"
            >
              <Icon className="w-6 h-6 text-apple-9" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-gray-12">{heading}</h3>
                <p className="mt-1.5 text-sm text-gray-11 leading-relaxed">{body}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </div>
  </section>
  );
};
