import { type ReactNode, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { cn } from "../../lib/cn";

interface FeatureSpotlightProps {
  number: "01" | "02";
  badge: string;
  heading: string;
  body: string;
  textSide: "left" | "right";
  visual: ReactNode;
  bgClass: string;
}

export const FeatureSpotlight = ({
  number,
  badge,
  heading,
  body,
  textSide,
  visual,
  bgClass,
}: FeatureSpotlightProps) => {
  const ref = useRef<HTMLElement>(null);
  const shouldReduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const numberY = useTransform(
    scrollYProgress,
    [0, 1],
    shouldReduce ? [0, 0] : [20, -40],
  );

  const isTextLeft = textSide === "left";

  return (
    <section
      ref={ref}
      className={cn(
        "relative overflow-hidden py-32 -my-8",
        bgClass,
        "[clip-path:polygon(0_4%,100%_0,100%_96%,0_100%)]",
      )}
    >
      {/* Decorative oversized number — parallax scroll */}
      <motion.span
        style={{ translateY: numberY }}
        aria-hidden="true"
        className="absolute font-display text-[20rem] leading-none text-gray-4 select-none pointer-events-none top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 z-0"
      >
        {number}
      </motion.span>

      <div className="content-grid w-full relative z-10">
        <div className="content">
          <div className="flex gap-16 items-center">
            {/* Text block — order-2 when text is on the right */}
            <motion.div
              className={cn("flex-1", !isTextLeft && "order-2")}
              initial={shouldReduce ? false : { opacity: 0, x: isTextLeft ? -24 : 24 }}
              whileInView={shouldReduce ? {} : { opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              viewport={{ once: true, margin: "-80px" }}
            >
              <span className="inline-block rounded-full bg-link-3 text-link-11 text-xs font-semibold px-3 py-1 mb-4">
                {badge}
              </span>
              <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] uppercase text-gray-12 whitespace-pre-line">
                {heading}
              </h2>
              <p className="mt-4 text-base text-gray-11 leading-relaxed max-w-sm">
                {body}
              </p>
            </motion.div>

            {/* Visual block — order-1 when text is on the right */}
            <motion.div
              className={cn("flex-1", !isTextLeft && "order-1")}
              initial={shouldReduce ? false : { opacity: 0, x: isTextLeft ? 24 : -24 }}
              whileInView={shouldReduce ? {} : { opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
              viewport={{ once: true, margin: "-80px" }}
            >
              {visual}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
