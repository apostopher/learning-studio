import { CtaSection } from "./cta-section";
import { FeatureCards } from "./feature-cards";
import { FeatureSpotlight } from "./feature-spotlight";
import { HeroSection } from "./hero-section";

const AiEvaluationVisual = () => (
  <div className="rounded-2xl border border-gray-6 bg-gray-surface p-6 space-y-4">
    <p className="text-sm font-medium text-gray-12">
      What is the standard circuit height for a fixed-wing aircraft?
    </p>
    <div className="rounded-xl bg-apple-3 border border-apple-6 p-4">
      <p className="text-xs font-semibold text-apple-11 mb-1">AI Feedback</p>
      <p className="text-sm text-gray-11 leading-relaxed">
        Correct. 1,000 ft AGL is the standard circuit height. At controlled
        aerodromes, always check ERSA and ATC for published circuit requirements.
      </p>
    </div>
  </div>
);

const RetentionCurveVisual = () => (
  <div className="rounded-2xl border border-gray-6 bg-gray-surface p-6">
    <p className="text-xs font-medium text-gray-11 mb-4 uppercase tracking-wide">
      Retention over time
    </p>
    <svg
      viewBox="0 0 240 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full"
      role="img"
      aria-label="Chart showing retention improving with spaced repetition"
    >
      {/* Forgetting curve — without repetition */}
      <path
        d="M 10 20 C 40 20, 60 80, 230 105"
        stroke="var(--color-gray-7)"
        strokeWidth="2"
        strokeDasharray="4 3"
      />
      {/* Spaced repetition curve — rises after each review */}
      <path
        d="M 10 20 C 30 18, 50 70, 70 65 C 90 60, 100 30, 120 28 C 140 26, 155 60, 170 56 C 185 52, 195 25, 230 22"
        stroke="var(--color-link-9)"
        strokeWidth="2.5"
      />
      {/* Review markers */}
      {([
        { cx: 70, cy: 65 },
        { cx: 120, cy: 28 },
        { cx: 170, cy: 56 },
      ] as const).map(({ cx, cy }) => (
        <circle key={cx} cx={cx} cy={cy} r="3.5" fill="var(--color-link-9)" />
      ))}
    </svg>
    <div className="mt-3 flex items-center gap-4 text-xs text-gray-11">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-gray-7" />
        Without practice
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0.5 bg-link-9 rounded" />
        With spaced repetition
      </span>
    </div>
  </div>
);

export const LandingPage = () => (
  <div className="overflow-x-hidden">
    <HeroSection />
    <FeatureCards />
    <FeatureSpotlight
      number="01"
      badge="Powered by AI"
      heading={"Instant,\nIntelligent\nFeedback"}
      body="Our AI evaluates your answers in context — not just right or wrong, but why, with references to relevant regulations and procedures."
      textSide="left"
      visual={<AiEvaluationVisual />}
      bgClass="bg-gray-2"
    />
    <FeatureSpotlight
      number="02"
      badge="Research-backed"
      heading={"Remember\nMore,\nForever"}
      body="Spaced repetition schedules review sessions at the exact moment your memory needs reinforcing — based on decades of cognitive science."
      textSide="right"
      visual={<RetentionCurveVisual />}
      bgClass="bg-gray-1"
    />
    <CtaSection />
  </div>
);
