# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished public landing page at `/`, move the course app to `/app`, and animate the page with motion.dev parallax, clip-path section breaks, and whileInView card entrances.

**Architecture:** Six presentational components compose the page (`HeroSection`, `FeatureCards`, `FeatureSpotlight`, `CtaSection`, `LandingPage`). No container component is needed — the page has no interactive state. All animation is self-contained in each presentational component using motion hooks; refs are allowed per the presentational component convention.

**Tech Stack:** `motion/react` v12 (`useScroll`, `useTransform`, `useReducedMotion`, `motion`, `whileInView`), TanStack Router (`createFileRoute`, `Link`), Tailwind CSS v4 with CSS token scales, Lucide React icons, `cn` utility from `src/lib/cn.ts`.

## Global Constraints

- Colors: CSS token Tailwind classes only — `bg-apple-9`, `text-gray-11`, `bg-link-3`, etc. No hardcoded hex or arbitrary color values
- CSS direction: logical properties only — `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, never `ml-*`/`mr-*`/`pl-*`/`pr-*`/`left-*`/`right-*`
- Layout: `.content-grid` + `.content` child for page-level centering; sections themselves are `w-full`
- Component file naming: kebab-case files, PascalCase exports
- No `useState` or `useReducer`; Jotai for any state (none needed here)
- All components are presentational; refs are allowed for scroll targets
- `useReducedMotion()` — disable all `useTransform` outputs when true (pass `[0,0]` ranges)
- Font classes confirmed in `theme.generated.css`: `font-display` → Bebas Neue, `font-sans` → Inter
- Token names confirmed: `apple-3/6/9/10/11/12/contrast`, `gray-1/2/4/6/7/11/12/surface`, `link-3/9/11`

---

### Task 1: Route Restructure

**Files:**
- Create: `src/routes/_authed/app.tsx` (from rename of `index.tsx`)
- Delete: `src/routes/_authed/index.tsx`
- Modify: `src/components/auth/auth-flow-container.tsx` line ~88

**Interfaces:**
- Produces: `/app` URL serves the course dashboard; post-login redirect targets `/app`

- [ ] **Step 1: Create `app.tsx` with updated route ID**

Copy the full contents of `src/routes/_authed/index.tsx` into `src/routes/_authed/app.tsx`, changing only the `createFileRoute` string:

```tsx
// src/routes/_authed/app.tsx
import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../../components/app-shell';
import { LessonEmpty } from '../../components/lesson-main';
import { CourseSidebarWrapper } from '../../components/sidebar/course-sidebar-wrapper';
import { appTitle } from '../../styles/theme.generated';

export const Route = createFileRoute('/_authed/app')({ component: App });

function App() {
  return (
    <AppShell
      aside={<CourseSidebarWrapper />}
      main={<LessonEmpty />}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
```

- [ ] **Step 2: Delete the old index route**

Ask user to delete `src/routes/_authed/index.tsx`, or run:
```bash
rm src/routes/_authed/index.tsx
```

- [ ] **Step 3: Update the post-login redirect**

In `src/components/auth/auth-flow-container.tsx`, find the `onSuccess` handler and change the default redirect target:

```tsx
// Before
navigate({ to: redirect ?? "/" });

// After
navigate({ to: (redirect as string | undefined) ?? "/app" });
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit 2>&1 | grep -v "ai-test"
```

Expected: no errors.

- [ ] **Step 5: Smoke test in dev server**

```bash
pnpm dev
```

- `http://localhost:5000/app` → course dashboard renders (sidebar + empty lesson)
- `http://localhost:5000/` → redirects to `/auth/login` (no public route yet — expected)
- Sign in → redirects to `/app` not `/`

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/app.tsx src/components/auth/auth-flow-container.tsx
git commit -m "feat: move course dashboard to /app, update post-login redirect"
```

---

### Task 2: Hero Section

**Files:**
- Create: `src/components/landing/hero-section.tsx`

**Interfaces:**
- Produces: `HeroSection` — no props

- [ ] **Step 1: Create the component**

```tsx
// src/components/landing/hero-section.tsx
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
    <section
      className="relative min-h-screen bg-apple-9 text-apple-contrast overflow-hidden flex items-center [clip-path:polygon(0_0,100%_0,100%_88%,0_100%)]"
    >
      {/* Parallax blob 1 — subtle brand tint */}
      <motion.div
        style={{ translateY: blob1Y }}
        aria-hidden="true"
        className="absolute top-1/4 -start-1/4 w-[60vw] h-[60vw] rounded-full bg-apple-contrast/5 blur-3xl pointer-events-none"
      />
      {/* Parallax blob 2 — link accent glow */}
      <motion.div
        style={{ translateY: blob2Y }}
        aria-hidden="true"
        className="absolute bottom-0 end-0 w-[40vw] h-[40vw] rounded-full bg-link-9/10 blur-3xl pointer-events-none"
      />

      <div className="content-grid w-full relative z-10 pb-32">
        <div className="content py-24">
          <h1 className="font-display text-[clamp(4.5rem,11vw,10rem)] leading-[0.9] tracking-tight uppercase text-apple-contrast">
            Train.<br />
            Evaluate.<br />
            Fly.
          </h1>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-apple-contrast/70">
            Aviation ground school meets science-based AI evaluation. Built for serious aviators.
          </p>
          <div className="mt-10">
            <Link
              to="/auth/login"
              className="inline-flex items-center rounded-full bg-apple-contrast text-apple-9 px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-apple-contrast/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-contrast focus-visible:ring-offset-2 focus-visible:ring-offset-apple-9"
            >
              Sign in to start learning
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/hero-section.tsx
git commit -m "feat(landing): hero section with parallax blobs and clip-path break"
```

---

### Task 3: Feature Cards

**Files:**
- Create: `src/components/landing/feature-cards.tsx`

**Interfaces:**
- Produces: `FeatureCards` — no props

- [ ] **Step 1: Create the component**

```tsx
// src/components/landing/feature-cards.tsx
import { BrainCircuit, FlaskConical, PlayCircle, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
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

export const FeatureCards = () => (
  <section className="w-full bg-gray-1 pb-24">
    <div className="content-grid">
      <div className="content">
        {/* Negative block-start margin pulls cards up over the hero clip-path seam */}
        <div className="-mt-24 grid grid-cols-2 gap-4">
          {FEATURES.map(({ Icon, heading, body }, i) => (
            <motion.article
              key={heading}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
              viewport={{ once: true, margin: "-80px" }}
              className="flex flex-col gap-4 rounded-2xl border border-gray-6 bg-gray-surface p-8 backdrop-blur-sm"
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/feature-cards.tsx
git commit -m "feat(landing): feature cards with staggered whileInView entrance"
```

---

### Task 4: Feature Spotlight

**Files:**
- Create: `src/components/landing/feature-spotlight.tsx`

**Interfaces:**

```ts
// Props for FeatureSpotlight
interface FeatureSpotlightProps {
  number: "01" | "02";
  badge: string;
  heading: string;        // Use \n for line breaks — whitespace-pre-line is applied
  body: string;
  textSide: "left" | "right";
  visual: React.ReactNode;
  bgClass: string;        // e.g. "bg-gray-2" or "bg-gray-1"
}
```

- Produces: `FeatureSpotlight` — used twice in `LandingPage`

- [ ] **Step 1: Create the component**

```tsx
// src/components/landing/feature-spotlight.tsx
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
              initial={{ opacity: 0, x: isTextLeft ? -24 : 24 }}
              whileInView={{ opacity: 1, x: 0 }}
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
              initial={{ opacity: 0, x: isTextLeft ? 24 : -24 }}
              whileInView={{ opacity: 1, x: 0 }}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/feature-spotlight.tsx
git commit -m "feat(landing): feature spotlight with section-scoped parallax number"
```

---

### Task 5: CTA Section

**Files:**
- Create: `src/components/landing/cta-section.tsx`

**Interfaces:**
- Produces: `CtaSection` — no props

- [ ] **Step 1: Create the component**

```tsx
// src/components/landing/cta-section.tsx
import { Link } from "@tanstack/react-router";

export const CtaSection = () => (
  <>
    {/* 4px gradient accent bar — apple → link */}
    <div
      aria-hidden="true"
      className="h-1 w-full bg-linear-to-r from-apple-9 to-link-9"
    />
    <section className="bg-apple-9 text-apple-contrast py-32">
      <div className="content-grid w-full">
        <div className="content text-center">
          <h2 className="font-display text-[clamp(3rem,8vw,6rem)] leading-[0.9] uppercase">
            Ready to fly?
          </h2>
          <p className="mt-4 text-apple-contrast/70 text-lg max-w-xs mx-auto leading-relaxed">
            Join and start your first module in minutes.
          </p>
          <div className="mt-10">
            <Link
              to="/auth/login"
              className="inline-flex items-center rounded-full bg-apple-contrast text-apple-9 px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-apple-contrast/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-contrast focus-visible:ring-offset-2 focus-visible:ring-offset-apple-9"
            >
              Sign in to start learning
            </Link>
          </div>
        </div>
      </div>
    </section>
  </>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/cta-section.tsx
git commit -m "feat(landing): CTA section with gradient accent bar"
```

---

### Task 6: Compose Landing Page + Public Route

**Files:**
- Create: `src/components/landing/landing-page.tsx`
- Create: `src/routes/index.tsx`

**Interfaces:**
- Consumes: `HeroSection` (no props), `FeatureCards` (no props), `FeatureSpotlight` (props per Task 4), `CtaSection` (no props)
- Produces: `LandingPage` (no props), public route at `/`

- [ ] **Step 1: Create the AI evaluation visual (used in Spotlight 1)**

Define this as a local component inside `landing-page.tsx`:

```tsx
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
```

- [ ] **Step 2: Create the retention curve visual (used in Spotlight 2)**

Also inside `landing-page.tsx`:

```tsx
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
```

- [ ] **Step 3: Compose `LandingPage`**

```tsx
// src/components/landing/landing-page.tsx
import { CtaSection } from "./cta-section";
import { FeatureCards } from "./feature-cards";
import { FeatureSpotlight } from "./feature-spotlight";
import { HeroSection } from "./hero-section";

// AiEvaluationVisual — defined above in this file (Steps 1–2)
// RetentionCurveVisual — defined above in this file (Steps 1–2)

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
```

- [ ] **Step 4: Create the public route**

```tsx
// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "../components/landing/landing-page";

export const Route = createFileRoute("/")({
  component: LandingPage,
});
```

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit 2>&1 | grep -v "ai-test"
```

Expected: no errors.

- [ ] **Step 6: Full visual QA in dev server**

```bash
pnpm dev
```

Open `http://localhost:5000/` and verify:

| Check | Expected |
|---|---|
| Hero fills viewport | Dark `apple-9` background |
| Headline | Bebas Neue, three stacked lines: TRAIN. / EVALUATE. / FLY. |
| Parallax | Slow scroll → blobs drift at different speeds |
| Hero break | Diagonal clip into feature cards — no flat horizontal line |
| Feature cards | Overlap the hero's bottom edge (negative margin) |
| Card entrance | Each card fades + slides up as it enters viewport |
| Spotlight 1 | Text left, AI visual right, `"01"` decorates background |
| Spotlight 2 | Visual left, text right, `"02"` decorates background |
| Spotlight edges | Diagonal clip-path top and bottom — not flat rectangles |
| Gradient bar | Thin `apple-9 → link-9` stripe above CTA |
| CTA | Dark section, Bebas Neue "READY TO FLY?", sign-in button |
| Sign-in button | Navigates to `/auth/login` |
| `/app` route | Course dashboard still loads after sign-in |
| Reduced motion | Toggle OS reduce-motion setting → all parallax/transforms disappear |

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/ src/routes/index.tsx
git commit -m "feat(landing): compose landing page and wire public / route"
```
