# XState-driven login flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model the email-OTP login flow as an explicit, context-free XState machine that owns all side effects, with jotai as the single source of truth and react-query as the network executor.

**Architecture:** A context-free `authLoginMachine` declares the finite states, transitions, and named actors/actions. Concrete implementations (jotai writes, react-query `mutateAsync`, router invalidate + navigate, resend-countdown ticker) are injected at the edge via `machine.provide(...)`, closing over an injected jotai store and the component's hooks. The finite state replaces the `authStepAtom`/`authRedirectingAtom` flags, which makes the earlier "login form flashes before dashboard" bug structurally impossible. The `useEffect` countdown timer is replaced by a machine-invoked ticker actor.

**Tech Stack:** React 19, TanStack Router/Start, XState 5 + @xstate/react 6, jotai 2, TanStack Query 5, react-hook-form + zod, Motion, vitest.

## Global Constraints

- Add exact deps: `xstate@^5.32.5`, `@xstate/react@^6.1.0`. Package manager is **pnpm**.
- The machine is **context-free**: no flow data (email, error, countdown, step) in XState context — all of it lives in jotai atoms, mutated through an injected store handle.
- react-query stays the executor: the two network calls go through `useRequestOtp`/`useVerifyOtp` `mutateAsync`; the machine invokes them via provided actors.
- react-hook-form + zod keep field-level validation; on valid submit RHF sends an event to the machine.
- Component filenames are kebab-case; exported symbols PascalCase/camelCase.
- No `useEffect` for the resend countdown — it is a machine-invoked ticker actor.
- Run a single test file with: `pnpm exec vitest run <path>`. Run all tests with `pnpm test`. Typecheck with `pnpm exec tsc --noEmit`. Format/lint touched files with `pnpm exec biome check --write <paths>`.

---

## File Structure

- `package.json` — add `xstate`, `@xstate/react` (modified).
- `src/atoms/auth.ts` — atom set: keep `authEmailAtom`, `resendAvailableAtAtom`; add `resendCountdownAtom`, `authErrorAtom`; remove `authStepAtom`, `authRedirectingAtom`, `nowAtom`, and the `AuthStep` type (modified across Tasks 2 and 3).
- `src/machines/auth-login-machine.ts` — **new**. The machine, its event/dep types, `resolveErrorMessage`, `RESEND_COOLDOWN_MS`, and `createAuthLoginImplementations(deps)`.
- `src/machines/__tests__/auth-login-machine.test.ts` — **new**. Headless machine tests.
- `src/components/auth/auth-flow-container.tsx` — rewrite to drive the machine (modified).
- `src/components/auth/email-step-form.tsx`, `otp-step-form.tsx` — unchanged (presentational).

---

### Task 1: Install XState

**Files:**
- Modify: `package.json` (dependencies)

**Interfaces:**
- Consumes: nothing.
- Produces: `xstate` and `@xstate/react` importable by later tasks.

- [ ] **Step 1: Install the two packages**

```bash
pnpm add xstate@^5.32.5 @xstate/react@^6.1.0
```

- [ ] **Step 2: Verify they resolve and the suite is still green**

Run: `pnpm exec vitest run` (or `pnpm test`)
Expected: PASS — existing tests unaffected; no missing-module errors.

Also confirm the versions landed:

Run: `node -e "console.log(require('xstate/package.json').version, require('@xstate/react/package.json').version)"`
Expected: prints `5.32.x 6.1.x`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(auth): add xstate and @xstate/react"
```

---

### Task 2: Auth atoms + login machine + machine tests

This task adds the two new atoms (additively — the old atoms stay so the current
container keeps compiling), creates the machine and its runtime-implementation
factory, and covers the machine with headless tests. TDD: the test file is
written first and must fail to import before the machine exists.

**Files:**
- Modify: `src/atoms/auth.ts` (add two atoms only — do NOT remove old ones yet)
- Create: `src/machines/auth-login-machine.ts`
- Test: `src/machines/__tests__/auth-login-machine.test.ts`

**Interfaces:**
- Consumes: `authEmailAtom`, `resendAvailableAtAtom` (existing), plus the new
  `resendCountdownAtom`, `authErrorAtom`.
- Produces:
  - `authLoginMachine` — an XState machine with states `emailEntry`,
    `sendingOtp`, `otpEntry`, `verifyingOtp`, `resendingOtp`, `redirecting`,
    `done`; events `SUBMIT_EMAIL {email}`, `SUBMIT_OTP {otp}`, `RESEND`, `BACK`.
  - `createAuthLoginImplementations(deps: AuthLoginDeps)` → `{ actors, actions }`
    for `authLoginMachine.provide(...)`.
  - `AuthLoginDeps` = `{ store: JotaiStore; sendOtp: (email: string) => Promise<void>; verifyOtp: (args: { email: string; otp: string }) => Promise<void>; redirect: () => Promise<void> }`.
  - `resolveErrorMessage(error: unknown): string`, `RESEND_COOLDOWN_MS: number`.

- [ ] **Step 1: Add the two new atoms (keep the old ones)**

Add to `src/atoms/auth.ts` **without removing** `authStepAtom`, `authRedirectingAtom`, `nowAtom`, or `AuthStep` (they are removed in Task 3). Append:

```ts
/** Seconds remaining until the resend button is available; written by the machine's ticker. */
export const resendCountdownAtom = atom<number>(0);
/** Server-side auth error message shown in the form, or null when there is none. */
export const authErrorAtom = atom<string | null>(null);
```

- [ ] **Step 2: Write the failing machine test**

Create `src/machines/__tests__/auth-login-machine.test.ts`:

```ts
import { createStore } from "jotai";
import { createActor, waitFor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import {
  authEmailAtom,
  authErrorAtom,
  resendAvailableAtAtom,
} from "../../atoms/auth";
import {
  authLoginMachine,
  createAuthLoginImplementations,
} from "../auth-login-machine";

interface Overrides {
  sendOtp?: (email: string) => Promise<void>;
  verifyOtp?: (args: { email: string; otp: string }) => Promise<void>;
  redirect?: () => Promise<void>;
}

function makeActor(overrides: Overrides = {}) {
  const store = createStore();
  const redirect = overrides.redirect ?? vi.fn(async () => {});
  const sendOtp = overrides.sendOtp ?? vi.fn(async () => {});
  const verifyOtp = overrides.verifyOtp ?? vi.fn(async () => {});
  const impl = createAuthLoginImplementations({
    store,
    sendOtp,
    verifyOtp,
    redirect,
  });
  const actor = createActor(authLoginMachine.provide(impl));
  return { store, actor, redirect, sendOtp, verifyOtp };
}

describe("authLoginMachine", () => {
  it("completes the happy path and redirects exactly once", async () => {
    const { store, actor, redirect } = makeActor();
    actor.start();

    actor.send({ type: "SUBMIT_EMAIL", email: "pilot@example.com" });
    await waitFor(actor, (s) => s.matches("otpEntry"));
    expect(store.get(authEmailAtom)).toBe("pilot@example.com");

    actor.send({ type: "SUBMIT_OTP", otp: "123456" });
    await waitFor(actor, (s) => s.status === "done");
    expect(redirect).toHaveBeenCalledTimes(1);

    actor.stop();
  });

  it("returns to otpEntry and records a mapped error on invalid otp", async () => {
    const { store, actor, redirect } = makeActor({
      verifyOtp: async () => {
        throw { code: "INVALID_OTP" };
      },
    });
    actor.start();

    actor.send({ type: "SUBMIT_EMAIL", email: "pilot@example.com" });
    await waitFor(actor, (s) => s.matches("otpEntry"));

    actor.send({ type: "SUBMIT_OTP", otp: "000000" });
    await waitFor(
      actor,
      (s) => s.matches("otpEntry") && store.get(authErrorAtom) !== null,
    );

    expect(store.get(authErrorAtom)).toBe("Incorrect code. Please try again.");
    expect(redirect).not.toHaveBeenCalled();

    actor.stop();
  });

  it("resends and bumps the resend timer", async () => {
    const { store, actor, sendOtp } = makeActor();
    actor.start();

    actor.send({ type: "SUBMIT_EMAIL", email: "pilot@example.com" });
    await waitFor(actor, (s) => s.matches("otpEntry"));
    const firstResendAt = store.get(resendAvailableAtAtom);

    actor.send({ type: "RESEND" });
    await waitFor(actor, (s) => s.matches("resendingOtp"));
    await waitFor(actor, (s) => s.matches("otpEntry"));

    expect(sendOtp).toHaveBeenCalledTimes(2);
    expect(store.get(resendAvailableAtAtom)).toBeGreaterThanOrEqual(
      firstResendAt,
    );

    actor.stop();
  });

  it("clears email and error on BACK", async () => {
    const { store, actor } = makeActor({
      sendOtp: async () => {
        throw { code: "TOO_MANY_ATTEMPTS" };
      },
    });
    actor.start();

    // Trigger an error first so we can prove BACK clears it.
    actor.send({ type: "SUBMIT_EMAIL", email: "pilot@example.com" });
    await waitFor(actor, (s) => s.matches("emailEntry") && store.get(authErrorAtom) !== null);
    expect(store.get(authErrorAtom)).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );

    // Now succeed to reach otpEntry, then go BACK.
    const { store: store2, actor: actor2 } = makeActor();
    actor2.start();
    actor2.send({ type: "SUBMIT_EMAIL", email: "pilot@example.com" });
    await waitFor(actor2, (s) => s.matches("otpEntry"));
    actor2.send({ type: "BACK" });
    await waitFor(actor2, (s) => s.matches("emailEntry"));
    expect(store2.get(authEmailAtom)).toBe("");
    expect(store2.get(authErrorAtom)).toBeNull();

    actor.stop();
    actor2.stop();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run src/machines/__tests__/auth-login-machine.test.ts`
Expected: FAIL — cannot resolve `../auth-login-machine` (module does not exist yet).

- [ ] **Step 4: Create the machine module**

Create `src/machines/auth-login-machine.ts`:

```ts
import type { createStore } from "jotai";
import { fromCallback, fromPromise, setup } from "xstate";

import {
  authEmailAtom,
  authErrorAtom,
  resendAvailableAtAtom,
  resendCountdownAtom,
} from "../atoms/auth";

type JotaiStore = ReturnType<typeof createStore>;

export const RESEND_COOLDOWN_MS = 30_000;

const ERROR_MESSAGES: Record<string, string> = {
  OTP_EXPIRED: "That code has expired. Request a new one.",
  INVALID_OTP: "Incorrect code. Please try again.",
  TOO_MANY_ATTEMPTS:
    "Too many attempts. Please wait a moment and try again.",
};

export function resolveErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    if (code in ERROR_MESSAGES) return ERROR_MESSAGES[code];
  }
  if (error && typeof error === "object" && "message" in error) {
    return (error as { message: string }).message;
  }
  return "Something went wrong. Please try again.";
}

export type AuthLoginEvent =
  | { type: "SUBMIT_EMAIL"; email: string }
  | { type: "SUBMIT_OTP"; otp: string }
  | { type: "RESEND" }
  | { type: "BACK" };

export interface AuthLoginDeps {
  store: JotaiStore;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (args: { email: string; otp: string }) => Promise<void>;
  redirect: () => Promise<void>;
}

/**
 * Context-free login machine. It declares the flow's states, transitions, and
 * the *names* of its side effects. Concrete implementations are injected via
 * `authLoginMachine.provide(createAuthLoginImplementations(deps))` so all flow
 * data lives in jotai (never XState context) and network calls stay in
 * react-query.
 */
export const authLoginMachine = setup({
  types: {
    events: {} as AuthLoginEvent,
  },
  actors: {
    sendOtp: fromPromise<void>(async () => {}),
    verifyOtp: fromPromise<void, { otp: string }>(async () => {}),
    redirect: fromPromise<void>(async () => {}),
    ticker: fromCallback(() => {}),
  },
  actions: {
    assignEmail: (_, _params: { email: string }) => {},
    setResendAt: () => {},
    setError: (_, _params: { error: unknown }) => {},
    clearError: () => {},
    resetFlow: () => {},
  },
}).createMachine({
  id: "authLogin",
  initial: "emailEntry",
  states: {
    emailEntry: {
      on: {
        SUBMIT_EMAIL: {
          target: "sendingOtp",
          actions: [
            "clearError",
            {
              type: "assignEmail",
              params: ({ event }) => ({ email: event.email }),
            },
          ],
        },
      },
    },
    sendingOtp: {
      invoke: {
        src: "sendOtp",
        onDone: { target: "otpEntry", actions: "setResendAt" },
        onError: {
          target: "emailEntry",
          actions: {
            type: "setError",
            params: ({ event }) => ({ error: event.error }),
          },
        },
      },
    },
    otpEntry: {
      invoke: { src: "ticker" },
      on: {
        SUBMIT_OTP: { target: "verifyingOtp", actions: "clearError" },
        RESEND: { target: "resendingOtp", actions: "clearError" },
        BACK: { target: "emailEntry", actions: "resetFlow" },
      },
    },
    verifyingOtp: {
      invoke: {
        src: "verifyOtp",
        input: ({ event }) => ({
          otp: (event as Extract<AuthLoginEvent, { type: "SUBMIT_OTP" }>).otp,
        }),
        onDone: "redirecting",
        onError: {
          target: "otpEntry",
          actions: {
            type: "setError",
            params: ({ event }) => ({ error: event.error }),
          },
        },
      },
    },
    resendingOtp: {
      invoke: {
        src: "sendOtp",
        onDone: { target: "otpEntry", actions: "setResendAt" },
        onError: {
          target: "otpEntry",
          actions: {
            type: "setError",
            params: ({ event }) => ({ error: event.error }),
          },
        },
      },
    },
    redirecting: {
      invoke: { src: "redirect", onDone: "done" },
    },
    done: { type: "final" },
  },
});

/**
 * Builds the concrete actor/action implementations for `authLoginMachine`.
 * Everything that touches jotai or the network is closed over here, keeping the
 * machine itself pure and testable.
 */
export function createAuthLoginImplementations(deps: AuthLoginDeps) {
  const { store } = deps;
  return {
    actors: {
      sendOtp: fromPromise<void>(async () => {
        await deps.sendOtp(store.get(authEmailAtom));
      }),
      verifyOtp: fromPromise<void, { otp: string }>(async ({ input }) => {
        await deps.verifyOtp({
          email: store.get(authEmailAtom),
          otp: input.otp,
        });
      }),
      redirect: fromPromise<void>(async () => {
        await deps.redirect();
      }),
      ticker: fromCallback(() => {
        const tick = () => {
          const target = store.get(resendAvailableAtAtom);
          const remaining = Math.max(
            0,
            Math.ceil((target - Date.now()) / 1000),
          );
          store.set(resendCountdownAtom, remaining);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
      }),
    },
    actions: {
      assignEmail: (_: unknown, params: { email: string }) => {
        store.set(authEmailAtom, params.email);
      },
      setResendAt: () => {
        store.set(resendAvailableAtAtom, Date.now() + RESEND_COOLDOWN_MS);
      },
      setError: (_: unknown, params: { error: unknown }) => {
        store.set(authErrorAtom, resolveErrorMessage(params.error));
      },
      clearError: () => {
        store.set(authErrorAtom, null);
      },
      resetFlow: () => {
        store.set(authEmailAtom, "");
        store.set(authErrorAtom, null);
      },
    },
  };
}
```

- [ ] **Step 5: Run the machine tests to verify they pass**

Run: `pnpm exec vitest run src/machines/__tests__/auth-login-machine.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no NEW errors in `src/machines/` or `src/atoms/auth.ts`. (Pre-existing unrelated errors in `src/routes/api/lesson/ai-test/*` may remain — ignore those.)

- [ ] **Step 7: Format and commit**

```bash
pnpm exec biome check --write src/atoms/auth.ts src/machines/auth-login-machine.ts src/machines/__tests__/auth-login-machine.test.ts
git add src/atoms/auth.ts src/machines/auth-login-machine.ts src/machines/__tests__/auth-login-machine.test.ts
git commit -m "feat(auth): add context-free xstate login machine with tests"
```

---

### Task 3: Drive the container from the machine; remove old atoms

Rewrite `auth-flow-container.tsx` to use `useMachine`, and remove the now-unused
atoms. After this task nothing references `authStepAtom`, `authRedirectingAtom`,
`nowAtom`, or `AuthStep`.

**Files:**
- Modify: `src/components/auth/auth-flow-container.tsx` (full rewrite of state wiring)
- Modify: `src/atoms/auth.ts` (remove `authStepAtom`, `authRedirectingAtom`, `nowAtom`, `AuthStep`)

**Interfaces:**
- Consumes: `authLoginMachine`, `createAuthLoginImplementations` (Task 2);
  `authEmailAtom`, `authErrorAtom`, `resendCountdownAtom` (atoms);
  `useRequestOtp`, `useVerifyOtp` (existing hooks).
- Produces: unchanged `AuthFlowContainer` public API (`{ redirect?: string }`).

- [ ] **Step 1: Rewrite `auth-flow-container.tsx`**

Replace the entire file with:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { useAtomValue, useStore } from "jotai";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  authEmailAtom,
  authErrorAtom,
  resendCountdownAtom,
} from "../../atoms/auth";
import { useRequestOtp, useVerifyOtp } from "../../hooks/auth";
import {
  authLoginMachine,
  createAuthLoginImplementations,
} from "../../machines/auth-login-machine";
import { AuthCard } from "./auth-card";
import { AuthLayout } from "./auth-layout";
import { EmailStepForm } from "./email-step-form";
import { OtpStepForm } from "./otp-step-form";

const emailSchema = z.object({
  email: z
    .string()
    .min(1, "Enter your email address")
    .email("Enter a valid email address"),
});

const otpSchema = z.object({
  otp: z
    .string()
    .min(1, "Enter the 6-digit code")
    .length(6, "The code must be exactly 6 digits")
    .regex(/^\d+$/, "The code must contain only digits"),
});

type EmailFormData = z.infer<typeof emailSchema>;
type OtpFormData = z.infer<typeof otpSchema>;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local[0]}${"•".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

interface AuthFlowContainerProps {
  redirect?: string;
}

export const AuthFlowContainer = ({ redirect }: AuthFlowContainerProps) => {
  const store = useStore();
  const router = useRouter();
  const navigate = useNavigate();
  const shouldReduce = useReducedMotion();

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  // Stable dependency callbacks so the provided machine identity does not churn
  // (which would restart the actor and drop flow state). react-query's
  // mutateAsync is referentially stable, and router/navigate/redirect are
  // constant for the flow's lifetime.
  const sendOtp = useCallback(
    (email: string) => requestOtp.mutateAsync(email),
    [requestOtp.mutateAsync],
  );
  const verify = useCallback(
    (args: { email: string; otp: string }) => verifyOtp.mutateAsync(args),
    [verifyOtp.mutateAsync],
  );
  const redirectFn = useCallback(async () => {
    // Re-run the root beforeLoad so the freshly-set session lands in router
    // context, then navigate. Both live inside the machine's redirect actor.
    await router.invalidate();
    await navigate({ to: redirect ?? "/app" });
  }, [router, navigate, redirect]);

  const machine = useMemo(
    () =>
      authLoginMachine.provide(
        createAuthLoginImplementations({
          store,
          sendOtp,
          verifyOtp: verify,
          redirect: redirectFn,
        }),
      ),
    [store, sendOtp, verify, redirectFn],
  );

  const [state, send] = useMachine(machine);

  const email = useAtomValue(authEmailAtom);
  const serverError = useAtomValue(authErrorAtom) ?? undefined;
  const resendCountdown = useAtomValue(resendCountdownAtom);

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    mode: "onSubmit",
  });

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    mode: "onSubmit",
  });

  const handleEmailSubmit = emailForm.handleSubmit(({ email: value }) => {
    send({ type: "SUBMIT_EMAIL", email: value });
    otpForm.reset();
  });

  const handleOtpSubmit = otpForm.handleSubmit(({ otp }) => {
    send({ type: "SUBMIT_OTP", otp });
  });

  const handleResend = () => {
    send({ type: "RESEND" });
    otpForm.reset();
    otpForm.setFocus("otp");
  };

  const handleBack = () => {
    send({ type: "BACK" });
    otpForm.reset();
  };

  const onEmailScreen =
    state.matches("emailEntry") || state.matches("sendingOtp");

  const stepVariants = {
    enter: { opacity: 0, y: shouldReduce ? 0 : 8 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: shouldReduce ? 0 : -8 },
  };

  return (
    <AuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        {onEmailScreen ? (
          <motion.div
            key="email"
            variants={stepVariants}
            initial="enter"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="w-full"
          >
            <AuthCard
              heading="Sign in to your account"
              description="Enter your email and we'll send you a sign-in code."
            >
              <EmailStepForm
                onSubmit={handleEmailSubmit}
                registerEmail={emailForm.register("email")}
                fieldError={emailForm.formState.errors.email?.message}
                serverError={serverError}
                isLoading={state.matches("sendingOtp")}
              />
            </AuthCard>
          </motion.div>
        ) : (
          <motion.div
            key="otp"
            variants={stepVariants}
            initial="enter"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="w-full"
          >
            <AuthCard
              heading="Check your email"
              description="Enter the code we sent to verify it's you."
            >
              <OtpStepForm
                maskedEmail={maskEmail(email)}
                onSubmit={handleOtpSubmit}
                registerOtp={otpForm.register("otp")}
                fieldError={otpForm.formState.errors.otp?.message}
                serverError={serverError}
                isLoading={
                  state.matches("verifyingOtp") || state.matches("redirecting")
                }
                onResend={handleResend}
                isResending={state.matches("resendingOtp")}
                resendCountdown={resendCountdown}
                onBack={handleBack}
              />
            </AuthCard>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
};
```

- [ ] **Step 2: Remove the now-unused atoms**

Edit `src/atoms/auth.ts` so it reads exactly:

```ts
import { atom } from "jotai";

/** The email the user is signing in with; set once the OTP send succeeds. */
export const authEmailAtom = atom<string>("");
/** Timestamp (ms) after which the resend button becomes available again. */
export const resendAvailableAtAtom = atom<number>(0);
/** Seconds remaining until the resend button is available; written by the machine's ticker. */
export const resendCountdownAtom = atom<number>(0);
/** Server-side auth error message shown in the form, or null when there is none. */
export const authErrorAtom = atom<string | null>(null);
```

(This deletes `AuthStep`, `authStepAtom`, `authRedirectingAtom`, and `nowAtom`.)

- [ ] **Step 3: Verify nothing still references the removed symbols**

Run: `grep -rn "authStepAtom\|authRedirectingAtom\|nowAtom\|AuthStep" src`
Expected: no matches.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no NEW errors in `src/components/auth/` or `src/atoms/`. (Pre-existing `ai-test` route errors may remain.)

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS — machine tests plus all existing tests.

- [ ] **Step 6: Format and commit**

```bash
pnpm exec biome check --write src/components/auth/auth-flow-container.tsx src/atoms/auth.ts
git add src/components/auth/auth-flow-container.tsx src/atoms/auth.ts
git commit -m "refactor(auth): drive login flow with xstate machine, drop step/redirect atoms"
```

---

### Task 4: Integration verification

Confirm the refactor builds and the flow behaves end-to-end (no login-form flash
before the dashboard). No new code — this is the acceptance gate.

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: a verified, buildable branch.

- [ ] **Step 1: Production build**

Run: `pnpm build`
Expected: build succeeds with no type or bundling errors from `auth-flow-container.tsx` or `auth-login-machine.ts`.

- [ ] **Step 2: Manual flow check (dev server)**

Run: `pnpm dev` and open the login page.
Walk the flow with a real inbox:
1. Enter email → submit. Email button shows its loading state (`sendingOtp`); on success the OTP card animates in.
2. Enter the correct code → submit. The OTP button stays in its "Signing in…" state through verify **and** the redirect (`verifyingOtp` → `redirecting`), then the dashboard mounts. **The email/login card must never re-appear between submit and dashboard.**
3. Enter a wrong code → the mapped error appears and you stay on the OTP card.
4. "Resend code" → button disabled with countdown ticking each second (machine ticker), re-enabling at 0.
5. "Use a different email" (Back) → returns to the email card, error cleared.

Expected: all five behave as described; specifically no flash in step 2.

- [ ] **Step 3: (If Chrome automation is available) capture the happy path**

Optionally record steps 1–2 with the browser tools to a GIF for the PR, confirming visually there is no intermediate login render.

- [ ] **Step 4: Final commit (only if any lint/format touch-ups were needed)**

```bash
git add -A
git commit -m "chore(auth): verification touch-ups for xstate login flow"
```

(Skip if the working tree is clean.)

---

## Self-Review

**Spec coverage:**
- Dependencies (`xstate` + `@xstate/react`) → Task 1. ✓
- Context-free machine, jotai via injected store → Task 2 (`authLoginMachine` has no `context`; `createAuthLoginImplementations` closes over `store`). ✓
- All finite states + transitions from the spec diagram → Task 2 machine (`emailEntry`, `sendingOtp`, `otpEntry`, `verifyingOtp`, `resendingOtp`, `redirecting`, `done`). ✓
- All side effects in the machine (send/verify actors, redirect actor, ticker replacing the `useEffect`) → Task 2. ✓
- react-query stays executor (mutateAsync injected as `sendOtp`/`verifyOtp` deps) → Tasks 2–3. ✓
- RHF validates, machine orchestrates → Task 3 (`handleSubmit` → `send`). ✓
- Atom set change (add `resendCountdownAtom`/`authErrorAtom`; remove `authStepAtom`/`authRedirectingAtom`/`nowAtom`) → Task 2 adds, Task 3 removes. ✓
- Machine writes integer `resendCountdownAtom`, `nowAtom` dropped → Task 2 ticker + atom edit. ✓
- Tests for happy path / verify-error / resend / back → Task 2 test file. ✓
- Screen derived from state so the flash is impossible; `redirecting` keeps the spinner → Task 3 (`onEmailScreen`, `isLoading`). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete file or block content. ✓

**Type consistency:** `createAuthLoginImplementations(deps)` with `AuthLoginDeps = { store, sendOtp, verifyOtp, redirect }` is defined in Task 2 and consumed identically in Task 3 and the Task 2 test. Event names (`SUBMIT_EMAIL`/`SUBMIT_OTP`/`RESEND`/`BACK`) and state names match across machine, tests, and container. ✓
