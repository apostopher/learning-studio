# Header and sign-out on every authenticated screen

**Date:** 2026-08-11
**Status:** Approved, ready for implementation plan

## Problem

Sign-out and app branding are inconsistent across the three authenticated
areas. `/admin/*` has neither a logo nor a sign-out control, so an admin can
reach a screen with no in-app way to leave the app or return to the course
list. Course pages have sign-out but no logo.

| Screen | Logo | Sign-out |
| --- | --- | --- |
| `/app` | yes (`AppHeader`) | yes |
| `/course/*` | no — `headerAside` slot is empty | yes (in `headerMain`) |
| `/admin/*` | no | no |

## Goal

Every post-login screen shows the same header anatomy: a logo linking to
`/app` at the inline-start edge, and a sign-out control at the inline-end
edge.

## Constraint that shapes the design

`.app-shell` is `block-size: 100dvh` (`src/styles.css`) and owns the entire
viewport on course routes. Mounting `AppHeaderContainer` in `_authed.tsx` —
the obvious "one mount point for everything" move — would stack a 56px header
above a full-viewport grid and overflow the page, as well as render a second
sign-out control on course pages.

`AppShell` already accepts a `headerAside` slot that course routes leave
empty. It sits in the sidebar column at the inline-start edge, which is
exactly where `AppHeader` puts its logo. Course pages therefore get the same
header *anatomy* by filling that slot, without a second header element.

## Design

### 1. New presentational component: `src/components/logo-link.tsx`

```tsx
<Link to="/app" aria-label={`${appTitle}, home`}>
  <span aria-hidden="true"><Logo /></span>
</Link>
```

`Logo` already carries `role="img"` and `aria-label={appTitle}`. Nesting that
inside a link would announce the name twice, so the wrapper hides it from the
accessibility tree and the link owns the accessible name. `Logo` itself gains
no new props.

`LogoLink` takes a single optional `className`, applied to the `Link`, and
passes the existing sizing classes down to `Logo` internally (today
`AppHeader` hands `Logo` `inline-flex h-8 w-8 shrink-0 items-center
justify-center`). Both call sites therefore get identical logo sizing without
repeating the class string, and the link itself carries a
`focus-visible:ring-apple-9` treatment matching `AdminNavLink`.

### 2. `src/components/app-header.tsx`

Replace `<Logo />` with `<LogoLink />`. No other change. On `/app` this makes
the logo a self-link, which is conventional and intentional.

### 3. `src/routes/_authed/admin.tsx`

Render `<AppHeaderContainer />` above the existing "Admin sections" nav. This
single mount point covers `/admin`, `/admin/users`, and
`/admin/$courseId/editor` — the editor is a thin delegating route, not its own
shell.

### 4. `src/routes/_authed/course.$courseSlug.tsx`

Pass `headerAside={<LogoLink />}`. `headerMain` is untouched: the lesson
title, `CourseHeaderNav`, and `SignOutButtonContainer` all stay where they
are.

### 5. `src/routes/_authed.tsx` — unchanged

Stays a bare `<Outlet />`. See the constraint above.

## Coverage after the change

| Screen | Logo → home | Sign-out |
| --- | --- | --- |
| `/app` | yes (`AppHeader`) | yes |
| `/admin/*` | **new** | **new** |
| `/course/*` | **new** (`headerAside`) | yes |

## Testing

Following the repo rule *assert on what the consumer received*:

- **`logo-link.test.tsx`** (new) — uses the memory-router idiom already
  established in `src/components/__tests__/course-header-nav.test.tsx`
  (`createMemoryHistory` + stub route tree + `RouterProvider`), because
  TanStack's `Link` calls router hooks and cannot render bare. Asserts the
  resolved `href` is `/app` and that the accessible name identifies it as a
  home link.
- **`app-header.test.tsx`** (update) — now contains a `Link`, so it needs the
  router wrapper. Assert that activating sign-out calls the `onSignOut` prop
  it was handed, not merely that a button is present.
- **Admin reachability** — one test asserting a sign-out control is actually
  reachable on an admin screen. "Reachable everywhere inside" is the
  requirement, and a header that stops being mounted is the regression that
  would otherwise pass silently.

## Visual check after implementation

`AppHeader` carries `border-b border-gray-6 bg-gray-2`, and the admin nav
carries the same pair. Stacked, they render as two identical bars separated by
a hairline. This is a conventional header + subnav treatment, but it should be
looked at on screen before the work is called done.

## Out of scope

- Refactoring `AppShell` to drop its own header row in favour of a single
  global `AppHeader`. Considered and rejected: it means reworking the `100dvh`
  grid, `--header-height`, and the course nav's placement for no user-visible
  gain over filling `headerAside`.
- Any change to `Logo`, the public landing page, or `/auth/login`.
