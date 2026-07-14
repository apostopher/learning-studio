# XState-driven email-OTP login flow

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan
**Area:** `src/components/auth`, `src/machines`, `src/atoms/auth.ts`

## Problem

The email-OTP login flow lives in `auth-flow-container.tsx`. Its state is spread
across jotai atoms (`authStepAtom`, `authRedirectingAtom`) and imperative
callbacks, with a `useEffect` driving the resend countdown. Ordering-sensitive
side effects (verify → `router.invalidate()` → `navigate()` → reset) are hand-sequenced
inside a react-query `onSuccess`, which is what caused the earlier "login form
flashes before dashboard" bug: it was easy to reset the step before navigation
and to navigate with a stale router session.

We want the flow modelled as an explicit state machine so transitions and side
effects are declarative and testable, and to remove the `useEffect`.

## Constraints (decided during brainstorming)

1. **XState owns the flow.** Introduce `xstate` + `@xstate/react`. New machine at
   `src/machines/auth-login-machine.ts`.
2. **jotai, not XState context.** The machine is **context-free**. Its finite
   states *are* the flow steps. All extended data lives in jotai atoms, which the
   machine reads/writes through an **injected jotai store** passed as machine
   `input`. jotai remains the single source of truth the rest of the app reads.
3. **All side effects live in the machine.** OTP send/verify, router invalidate +
   navigate, and the resend countdown ticker are machine actors/actions — nothing
   is sequenced in a component `onSuccess` or `useEffect`.
4. **react-query stays the data layer.** The two network calls still go through
   `useRequestOtp` / `useVerifyOtp` mutations; the machine invokes them via
   provided `fromPromise` actors that close over `mutateAsync`. The machine
   orchestrates; react-query executes.
5. **react-hook-form keeps field validation.** RHF + zod validate email format and
   the 6-digit OTP. On a valid submit RHF sends an event to the machine. The
   machine owns async orchestration and server errors only.

## Architecture

### Finite states

The machine's state value replaces `authStepAtom` and `authRedirectingAtom`.

```
emailEntry ──SUBMIT_EMAIL──▶ sendingOtp ──onDone──▶ otpEntry
                                  └──onError──▶ emailEntry   (writes error atom)

otpEntry ──SUBMIT_OTP──▶ verifyingOtp ──onDone──▶ redirecting ──onDone──▶ done (final)
   │                          └──onError──▶ otpEntry         (writes error atom)
   ├──RESEND────────────▶ resendingOtp ──onDone──▶ otpEntry  (resets resend timer)
   │                          └──onError──▶ otpEntry         (writes error atom)
   └──BACK──────────────▶ emailEntry                         (resetFlow)
```

- **Email screen** is rendered for `emailEntry | sendingOtp`.
- **OTP screen** is rendered for `otpEntry | verifyingOtp | resendingOtp | redirecting`.
- Because the screen is derived from state, the email card can never mount while a
  redirect is in flight — the earlier flash bug is structurally impossible.
- `redirecting` is a distinct state, so "keep the submit spinner up across the
  redirect" is expressed by the state itself, not a separate flag atom.

### Side effects — provided at runtime via `machine.provide({...})`

Provided in the component so they close over the current hooks/router:

| Invoked in state | Actor | Implementation |
| --- | --- | --- |
| `sendingOtp`, `resendingOtp` | `requestOtpActor` | `fromPromise(({input}) => requestOtp.mutateAsync(input.email))` |
| `verifyingOtp` | `verifyOtpActor` | `fromPromise(({input}) => verifyOtp.mutateAsync({email: input.email, otp: input.otp}))` |
| `redirecting` | `redirectActor` | `fromPromise(async () => { await router.invalidate(); await navigate({to: redirectTo ?? '/app'}); })` |
| `otpEntry` (only) | `tickerActor` | `fromCallback` — `setInterval` that writes `resendCountdownAtom` each second; cleared on state exit. Replaces the `useEffect`. |

Actor `input` is supplied at invoke time from atoms via the injected store
(e.g. the verify invoke reads `authEmailAtom` and the submitted OTP).

### Actions (all mutate jotai via the injected store)

- `assignEmail` — `store.set(authEmailAtom, event.email)`
- `setResendAt` — `store.set(resendAvailableAtAtom, Date.now() + RESEND_COOLDOWN_MS)`
- `setError` — `store.set(authErrorAtom, resolveErrorMessage(event.error))`
- `clearError` — `store.set(authErrorAtom, null)` (on every submit and on BACK)
- `resetFlow` — clear `authEmailAtom` + `authErrorAtom`
- `resetCountdown` — `store.set(resendCountdownAtom, 0)`

### Events

- `{ type: 'SUBMIT_EMAIL', email: string }`
- `{ type: 'SUBMIT_OTP', otp: string }`
- `{ type: 'RESEND' }`
- `{ type: 'BACK' }`

### Machine input

`{ store: JotaiStore, redirectTo?: string }` — the jotai store and the post-login
redirect target from the route search params.

## jotai atoms after refactor (`src/atoms/auth.ts`)

| Atom | Fate | Notes |
| --- | --- | --- |
| `authEmailAtom` | keep | written by machine on send success |
| `resendAvailableAtAtom` | keep | target timestamp; internal — read by ticker to compute countdown |
| `resendCountdownAtom` | **add** | integer seconds remaining; ticker writes, component reads |
| `authErrorAtom` | **add** | `string | null` server error message; machine writes, component reads |
| `authStepAtom` | **remove** | now a machine state |
| `authRedirectingAtom` | **remove** | now the `redirecting` machine state |
| `nowAtom` | **remove** | machine computes the countdown integer directly |

## Component wiring (`auth-flow-container.tsx`)

- `const store = useStore()` (jotai).
- Memoize the provided machine: `useMemo(() => authLoginMachine.provide({ actors, actions }), [deps])`, then `const [state, send] = useMachine(providedMachine, { input: { store, redirectTo } })`.
- Read render data via `useAtomValue`: `authEmailAtom`, `authErrorAtom`, `resendCountdownAtom`.
- Screen selection: `const onEmailScreen = state.matches('emailEntry') || state.matches('sendingOtp')`.
- Prop derivations:
  - Email form `isLoading` = `state.matches('sendingOtp')`
  - OTP form `isLoading` = `state.matches('verifyingOtp') || state.matches('redirecting')`
  - OTP `isResending` = `state.matches('resendingOtp')`
  - `serverError` = `authErrorAtom` value (field errors still come from RHF)
- Handlers become one-liners:
  - `emailForm.handleSubmit(({ email }) => send({ type: 'SUBMIT_EMAIL', email }))`
  - `otpForm.handleSubmit(({ otp }) => send({ type: 'SUBMIT_OTP', otp }))`
  - Resend → `send({ type: 'RESEND' })`; Back → `send({ type: 'BACK' })`
- **Removed:** the countdown `useEffect`, `authRedirectingAtom`, `useNavigate`/`useRouter`
  direct usage in handlers (now inside the provided `redirectActor`), and the manual
  `onSuccess` orchestration.

`EmailStepForm` and `OtpStepForm` are unchanged — still presentational, same props.

## Error handling

- Server errors from either mutation surface via `onError` transitions that call
  `setError`, writing a resolved message to `authErrorAtom`. `resolveErrorMessage`
  (the existing code→message map: `OTP_EXPIRED`, `INVALID_OTP`, `TOO_MANY_ATTEMPTS`)
  moves into the machine module.
- `clearError` runs on every submit and on BACK so stale errors don't linger.
- Field-level validation errors remain owned by RHF and are shown as today.

## Testing

New `src/machines/__tests__/auth-login-machine.test.ts` (vitest). The machine runs
headless with mocked provided actors and a fresh jotai store:

- **Happy path:** `SUBMIT_EMAIL` → `sendingOtp` → (resolve) `otpEntry`, email atom set;
  `SUBMIT_OTP` → `verifyingOtp` → (resolve) `redirecting` → (resolve) `done`;
  redirect actor invoked exactly once.
- **Verify error:** `SUBMIT_OTP` → (reject `INVALID_OTP`) back in `otpEntry`,
  `authErrorAtom` holds the mapped message, no redirect.
- **Resend:** from `otpEntry`, `RESEND` → `resendingOtp` → (resolve) `otpEntry`,
  `resendAvailableAtAtom` bumped.
- **Back:** from `otpEntry`, `BACK` → `emailEntry`, email + error atoms cleared.

## Files touched

- `package.json` — add `xstate`, `@xstate/react`
- `src/atoms/auth.ts` — remove `authStepAtom`/`authRedirectingAtom`/`nowAtom`; add `resendCountdownAtom`/`authErrorAtom`
- `src/machines/auth-login-machine.ts` — **new** machine (setup, states, no context, `resolveErrorMessage`)
- `src/components/auth/auth-flow-container.tsx` — rewrite to `useMachine` + provided actors
- `src/machines/__tests__/auth-login-machine.test.ts` — **new** tests
- `EmailStepForm` / `OtpStepForm` — unchanged

## Out of scope

- No change to better-auth config, server routes, or the auth-client.
- No change to the visual design / animations beyond the state-derived screen switch.
- Signup flow (if any) is not touched.
