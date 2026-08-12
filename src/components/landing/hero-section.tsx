import { useScroll, useTransform, motion, useReducedMotion } from "motion/react";
import { Link } from "@tanstack/react-router";

export const HeroSection = () => {
  const shouldReduce = useReducedMotion();
  const { scrollY } = useScroll();

  const blob1Y = useTransform(
    scrollY,
    [0, 500],
    shouldReduce ? [0, 0] : [0, -125],
  );
  const blob2Y = useTransform(
    scrollY,
    [0, 500],
    shouldReduce ? [0, 0] : [0, -200],
  );

  return (
    // `apple-3` (a brand-tinted BACKGROUND step), not `apple-9`. Step 9 is the
    // solid accent: it is navy in light and near-white in dark, so a hero
    // painted with it inverts into a white slab on a dark-only app.
    <section className="relative min-h-screen bg-apple-3 overflow-hidden flex items-center [clip-path:polygon(0_0,100%_0,100%_88%,0_100%)]">
      {/* Parallax blob 1 — subtle brand tint */}
      <motion.div
        style={{ translateY: blob1Y }}
        aria-hidden="true"
        className="absolute top-1/4 -start-1/4 w-[60vw] h-[60vw] rounded-full bg-apple-9/5 blur-3xl pointer-events-none"
      />
      {/* Parallax blob 2 — link accent glow */}
      <motion.div
        style={{ translateY: blob2Y }}
        aria-hidden="true"
        className="absolute bottom-0 end-0 w-[40vw] h-[40vw] rounded-full bg-link-9/10 blur-3xl pointer-events-none"
      />

      <div className="content-grid w-full relative z-10 pb-32">
        <div className="content py-24">
          <h1 className="font-display text-[clamp(4.5rem,11vw,10rem)] leading-[0.9] tracking-tight uppercase text-primary">
            Train.<br />
            Evaluate.<br />
            Fly.
          </h1>
          {/* `apple-text`, not a raw scale step: the generator picks step 11 or
              12 per theme so body copy stays AA-safe on the tinted step-3
              surface. Step 11 alone is not AA on step 3. */}
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-apple-text">
            Aviation ground school meets science-based AI evaluation. Built for serious aviators.
          </p>
          <div className="mt-10">
            <Link
              to="/auth/login"
              className="inline-flex items-center rounded-full bg-apple-9 text-apple-contrast px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-apple-9/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 focus-visible:ring-offset-apple-3"
            >
              Sign in to start learning
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
