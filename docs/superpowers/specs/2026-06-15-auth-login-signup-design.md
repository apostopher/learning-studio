# Auth: Login / Sign-up + Route Guard — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)

## 1. Summary

Add a polished, desktop-only **login / sign-up page** for this multi-tenant app and
**guard the existing app behind authentication**. Authentication is passwordless via
**better-auth email OTP**. Tenancy is **invite-only**: new accounts are created only by
accepting an invite bound to an organization. This task builds the *accept* side of
invites plus the token contract and the route guard. Invite *issuance* (an admin UI to
create/send invites) is a separate, later task.

## 2. Locked Decisions

| Area | Decision |
|---|---|
| Auth method | better-auth **email OTP** (passwordless); login and sign-up are one unified flow |
| Multi-tenancy | **Invite-only**; this task = accept side + token contract. Issuance is later. |
| New-user provisioning | **§3 option A** — better-auth **admin plugin**, strict enforcement (`disableSignUp: true`) |
| Email delivery | **Resend** (real OTP + invite emails) |
| Page layout | **Split panel**, desktop-only (mobile is served by native iOS/Android apps) |
| Forms | **react-hook-form + zod resolver** |
| Client state | **jotai** atoms (no `useState`/`useReducer`) |
| Server state | **TanStack Query** (mutations/queries; no server actions) |
| UI components | **Base UI** first, composed; **Lucide** icons |
| Color | **`generateRadixColors`** only; WCAG AA; logical CSS properties |
| File naming | kebab-case files, PascalCase components |

## 3. Provisioning model (decision A)

To enforce invite-only at the API boundary (the raw better-auth endpoints are publicly
exposed at `/api/auth/$`), we set `emailOTP({ disableSignUp: true })` so the public
send/verify endpoints cannot self-register a new account.

Invited users are provisioned by a **trusted server function** during invite acceptance.
For a valid token it:

1. Validates the invite token (matches email, not expired/revoked/accepted).
2. Creates the better-auth user via the **admin plugin** `createUser` API (server-side,
   trusted) if it does not already exist.
3. Creates the `user_profiles` row and the `user_organizations` membership using the
   invite's `roles`.
4. Sends the OTP (sign-in type).

OTP verification then simply signs the now-existing user in. Existing users (login mode)
already have an account, so `disableSignUp: true` does not impede them.

> Implementation note: confirm the exact admin-plugin `createUser` signature against the
> installed `better-auth@^1.5.3` during the plan phase.

## 4. Routes & Auth Guard

### 4.1 Auth route — `/auth/login`

Single route handles both login and invite acceptance, distinguished by an optional
`invite` search param validated with a zod `validateSearch` schema:

- **No token → "Sign in" mode**: existing users only. Email → OTP → home. An unknown
  email returns a friendly "You need an invite to create an account" message.
- **Valid token → "Accept invite" mode**: the route **loader** calls `validateInvite` and
  renders the inviting org's name with a **locked, pre-filled email**; a new user also
  provides their **name**. Email is not editable (it is bound to the invite).

`beforeLoad` on the auth route: if the visitor already has a session, redirect to `/`
(or to `?redirect` if present).

### 4.2 Guard — pathless `_authed` layout route (approach A)

- Add `src/routes/_authed.tsx`: its `beforeLoad` reads the session from router context and,
  if absent, `throw redirect({ to: '/auth/login', search: { redirect: location.href } })`.
- The session is fetched **once** in `__root` `beforeLoad` (via the existing `getSession`
  server fn), placed into router context, and reused by `_authed` and children — no double
  fetch.
- Move the existing protected routes under the layout:
  - `src/routes/index.tsx` → `src/routes/_authed/index.tsx`
  - `src/routes/modules.$moduleSlug.lessons.$lessonSlug.tsx` →
    `src/routes/_authed/modules.$moduleSlug.lessons.$lessonSlug.tsx`
- Routes that stay **outside** the guard: `/auth/login`, `/api/*`, `/mcp`, `/.well-known/*`.
- After successful login the flow returns the user to `search.redirect` (default `/`).

### 4.3 Router context & session

- `__root` `beforeLoad` resolves `{ session }` into context (typed in `MyRouterContext`).
- Client header (`integrations/better-auth/header-user.tsx`) continues to use
  `authClient.useSession()` for reactive UI; the guard relies on the server-resolved
  context session for redirect correctness on first paint (no flash of protected content).

## 5. Data model & server contract

### 5.1 `invitations` table (new Drizzle table in `src/db/schema.ts`)

| column | type | notes |
|---|---|---|
| `id` | integer identity PK | |
| `email` | varchar | invitee email (lowercased) |
| `orgId` | integer → `organizations.id` (cascade) | tenant |
| `roles` | varchar[] | mirrors `user_organizations.userRoles` |
| `tokenHash` | text, unique | SHA-256 of the raw token; raw token only ever in the email link |
| `status` | varchar enum `pending\|accepted\|revoked\|expired` | default `pending` |
| `expiresAt` | timestamp | e.g. 7 days |
| `invitedBy` | varchar (userId) | who issued it (nullable for seeds) |
| `createdAt` | timestamp default now | |
| `acceptedAt` | timestamp nullable | |

Indexes: unique on `tokenHash`; index on `(email, status)`; index on `orgId`.
Add `createInsertSchema`/`createSelectSchema` + relations to `organizations`.

> Issuance (creating rows + sending the invite email) is out of scope here, but the table
> and a small seed/helper are included so the accept flow is testable end-to-end.

### 5.2 Server functions

Location: extend `src/lib/auth-functions.ts` or add `src/lib/invite-functions.ts`.

- `validateInvite({ token })` → `{ valid: true, email, orgName, roles, requiresName }`
  or `{ valid: false, reason }` (`not_found | expired | revoked | accepted`). Compares
  `sha256(token)` to `tokenHash`. Used by the auth route loader.
- `requestEmailOtp({ email, token? })`:
  - With a valid token → provision (§3) if needed, then send OTP.
  - Without a token → if the user exists, send OTP; else return `ACCOUNT_NOT_FOUND`.
- `verifyEmailOtp({ email, otp, token?, name? })` → verifies the OTP (signs in). On a
  first-time invite accept, sets the user's name, ensures `user_profiles` +
  `user_organizations` rows exist, and marks the invitation `accepted`.

All inputs validated with zod. Email comparison is case-insensitive.

## 6. Email (Resend)

- New module `src/lib/email/`:
  - `client.ts` — Resend client from `RESEND_API_KEY`.
  - `send-otp-email.ts` — renders + sends the OTP email.
  - `templates/otp-email.ts` — the HTML template.
- Wire `auth.ts` `emailOTP.sendVerificationOTP` to call the sender (branch by `type`:
  `sign-in`, `email-verification`, `forget-password`).
- Env additions (`src/env.ts`, server block): `RESEND_API_KEY` (min 1), `EMAIL_FROM`
  (email string). Add to `.env`.

### Email design requirements (explicit)

The email must be **crisp, minimal, and easy on the eyes**:

- Single clear purpose per email; no marketing clutter.
- **High-contrast, readable body type** (system font stack, ~16px, generous line-height),
  comfortable measure, ample whitespace.
- The 6-digit code shown **large, monospaced, letter-spaced**, copy-friendly, as the
  visual focal point — plus one short sentence of context and the expiry.
- Brand mark + app name in a slim header; muted footer with a "didn't request this?" line.
- Light background, soft neutral borders, accent used sparingly. Renders well in common
  clients (table-based layout, inline styles, dark-mode-friendly colors).
- Colors derived from the brand palette / `generateRadixColors` tokens where practical.

## 7. Components (presentational / container split)

Under `src/components/auth/` (all presentational components are stateless; refs only for
focus management / animation):

- `auth-layout.tsx` — desktop split-panel shell: brand panel + form slot. Reuses the
  existing `UnsupportedScreen` pattern as a min-width guard.
- `auth-brand-panel.tsx` — logo (`VITE_LOGO_*`), tagline, brand-color gradient.
- `email-step-form.tsx` — email field + submit; receives RHF `control`/`register`,
  `isSubmitting`, `error`; Base UI Field + Button.
- `otp-step-form.tsx` — accessible 6-digit code input (`inputMode="numeric"`,
  `autocomplete="one-time-code"`, paste support), shows masked email, resend button with
  countdown, `isSubmitting`, `error`, "use a different email" back action.
- `auth-card.tsx` (optional) — heading + slot wrapper for consistent step framing.

Container:

- `auth-flow-container.tsx` (`AuthFlowContainer`) — orchestrates the flow: reads
  `mode`/`invite` from route, drives step (`email` → `otp`), holds the react-hook-form
  instances, calls TanStack Query mutations, maps errors to friendly copy, owns the resend
  countdown, and on success navigates to `search.redirect`.

State / hooks:

- `src/atoms/auth.ts` — `authStepAtom` (`'email' | 'otp'`), `authEmailAtom`,
  `resendAvailableAtAtom` (timestamp for countdown).
- `src/hooks/auth.ts` — `useRequestOtp`, `useVerifyOtp` (TanStack Query mutations wrapping
  the server fns / `authClient`), `useSession` if a client query wrapper is useful.

## 8. UX details

- **No layout shift**: fixed card width and stable min-height across the email/OTP steps;
  error text lives in a **reserved `aria-live="polite"` slot** so showing/clearing it never
  reflows; buttons keep their height while the spinner swaps in.
- **Transitions**: Motion (motion.dev) crossfade between steps within the fixed card; honor
  `prefers-reduced-motion`.
- **focus-visible**: accent focus rings on `:focus-visible` only.
- **Loading**: per-step disabled state + inline spinner; submit disabled until valid.
- **Errors mapped to friendly copy**: invalid code, expired code, too many attempts /
  rate-limited, unknown email (needs invite), invalid/expired invite.
- **Resend**: disabled with a countdown (e.g. 30s) after each send.
- **Accessibility**: labeled fields, `autocomplete` hints, error association via
  `aria-describedby`, logical tab order, the code input focuses on step enter.

## 9. Testing (Vitest + Testing Library, already configured)

- **Schemas**: email + OTP zod schemas (valid/invalid).
- **`validateInvite`**: valid, expired, revoked, already-accepted, wrong-email, unknown
  token (hash mismatch).
- **Send-gating**: `requestEmailOtp` rejects unknown email without a token; allows existing
  user; allows valid token.
- **Forms**: validation errors render; submit disabled while loading; OTP paste fills all
  cells; resend countdown disables the button.
- **Guard**: `_authed` `beforeLoad` redirects unauthenticated visitors with the correct
  `redirect` search param; authed visitors to `/auth/login` are redirected away.

## 10. File-change map

**New**

- `src/routes/_authed.tsx` (guard layout)
- `src/routes/_authed/index.tsx` (moved home)
- `src/routes/_authed/modules.$moduleSlug.lessons.$lessonSlug.tsx` (moved lesson route)
- `src/components/auth/auth-layout.tsx`, `auth-brand-panel.tsx`, `email-step-form.tsx`,
  `otp-step-form.tsx`, `auth-card.tsx`, `auth-flow-container.tsx`
- `src/atoms/auth.ts`, `src/hooks/auth.ts`
- `src/lib/invite-functions.ts` (or extend `auth-functions.ts`)
- `src/lib/email/client.ts`, `send-otp-email.ts`, `templates/otp-email.ts`
- `invitations` table in `src/db/schema.ts` + a Drizzle migration

**Modified**

- `src/routes/auth/login.tsx` (real page: loader, search schema, `beforeLoad`, container)
- `src/routes/__root.tsx` (`beforeLoad` resolves session into context)
- `src/lib/auth.ts` (`disableSignUp: true`, admin plugin, wire `sendVerificationOTP`)
- `src/lib/auth-client.ts` (admin client plugin if needed)
- `src/env.ts` + `.env` (`RESEND_API_KEY`, `EMAIL_FROM`)
- `package.json` (`resend`)

**Removed**

- The old flat `src/routes/index.tsx` and lesson route (moved under `_authed/`).

## 11. Out of scope (explicit)

- Invite **issuance** UI / admin tooling (only a seed/helper for testing the accept flow).
- Self-serve organization creation; org switching UI.
- Password auth, social login, account settings, password reset.
- Email-verification and forget-password OTP branches beyond stubbed wiring.
