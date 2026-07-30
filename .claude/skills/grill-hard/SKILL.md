---
name: grill-hard
description: Grill the user relentlessly about a plan, decision, or idea — the happy path first, then every unhappy path — until you reach a written shared understanding. Use whenever the user wants to stress-test, pressure-test, poke holes in, or think through a plan, design, architecture, or decision before building it, and whenever they use any 'grill' trigger phrase. Also use before starting any non-trivial build where the requirements have only been described loosely.
---

# Grill Hard

Interview the user relentlessly about their plan until you both reach a shared understanding, write that understanding down, and get explicit confirmation before acting on it.

The point isn't to ask a lot of questions. It's to surface the decisions the user hasn't noticed they're making — especially the ones about what happens when things go wrong, which is where most plans quietly rot.

## Rules

**One question at a time.** Ask, wait for the answer, then ask the next. Several questions at once is bewildering, and it produces shallow answers to all of them. This holds even when questions feel related — if they're truly inseparable, they're one question, so merge them.

**Always bring a recommended answer.** A bare question makes the user do all the work. A question with a recommendation lets them just say "yes" or correct you, which is much faster and surfaces disagreement sooner. Use this shape:

> **Q:** What should happen when a player's connection drops mid-round?
> **Recommend:** Keep their seat for 60s, keep scoring their unanswered questions as zero, auto-drop after that.
> **Why:** Mobile users on transit lose signal constantly; holding the seat forever breaks the host's flow.
> **Alternatives:** Drop immediately (simpler, but punishes flaky networks) · hold until host ends (safest for the player, but leaves ghosts in the lobby).

**Look up facts. Only ask about decisions.** If the answer exists in the filesystem, the codebase, a config file, the docs, a tool, or the web, go find it. Asking the user something you could have read is a tax on their attention and it burns the credibility you need for the questions that matter. Read `package.json` rather than asking which router they use. Grep for the existing pattern rather than asking how auth works today. Decisions — tradeoffs, priorities, risk appetite, scope — are always the user's.

**Earn each question.** Before asking, check: does any answer to this change what gets built? If both answers lead to the same place, skip it. If it's trivially reversible and cheap to change later, note it as a default and move on rather than spending a turn on it.

**Order by dependency.** Walk the decision tree, resolving blockers first. Don't ask about the shape of the cache before deciding whether there's a cache.

**Reopen when something breaks upstream.** If an answer invalidates an earlier decision, say so immediately, name the decision it affects, and re-ask it. Silently carrying a contradiction forward is worse than the extra question.

**Don't build during the grilling.** No code, no file edits, no irreversible actions until the user confirms the shared understanding. Reading, searching, and prototyping-in-your-head are fine.

## Phases

1. **Orient (silently).** Explore the environment first. Existing code, stack, conventions, constraints, prior art. Come to the interview already informed.
2. **Frame.** Restate the goal, the scope, and what you believe is explicitly out of scope in a few lines. Confirm it. Misunderstandings are cheapest to fix here, before twenty questions have been built on top of them.
3. **Happy path.** Walk the decision tree for the case where everything works.
4. **Unhappy paths.** The sweep, below. This is not optional and not a footnote — budget at least as many questions here as in phase 3.
5. **Ledger.** Write the shared understanding down (format below).
6. **Confirm.** Wait for an explicit go. Then act.

## The unhappy-path sweep

Most plans are described as a happy path and fail somewhere else. Walk these categories deliberately. Each one either produces a decision or gets explicitly dismissed — and say out loud which ones you're dismissing and why, so the user can object. Silent dismissal is how a category gets missed.

**Input and state** — empty, missing, enormous, malformed, duplicated, stale, or hostile input. First-run with no data. The half-finished state. The state left over from a previous version.

**Failure and recovery** — what can fail, how you detect it, what the user sees when it does, retries and backoff, idempotency on retry, partial writes, and how you roll back or reverse a migration.

**Boundaries** — network loss, offline use, timeouts, rate limits, quotas, cold starts, third-party outages, expired tokens, revoked permissions, insufficient storage.

**Concurrency and time** — two actors doing the same thing at once, races, ordering guarantees, clock skew, timezones, DST, sessions that outlive their assumptions.

**Scale and cost** — behaviour at 10× and 100× current load, unbounded growth, missing pagination, and what the bill looks like at 10×.

**People** — the confused user, the impatient double-tapper, the user who abandons halfway, the adversarial user, the user on a screen reader, the user in another language or locale.

**Exit** — how someone undoes an action, deletes their data, exports it, or migrates away. How you deprecate this thing later.

**Consequences** — privacy, security, compliance, and the worst plausible headline if this goes wrong in public.

### Triage rather than treating them equally

Rank by likelihood × blast radius. A rare annoyance and a common data-loss bug do not deserve the same number of questions. Lead with the ones that are both plausible and expensive.

**"We accept this risk and do nothing" is a valid answer** — record it. A named, accepted risk is a healthy plan. An unnamed one is a landmine. The goal of the sweep is that nothing ends up in the second category.

## Handling the answers you'll actually get

**"You decide."** Decide, state what you decided in one line, record it, move on. Don't bounce it back.

**"I don't know."** Don't re-ask it louder. Lay out the tradeoff in concrete terms, or propose the smallest experiment that would answer it, or offer to defer it with an explicit trigger — "we'll pick a queue when a job takes over 5 seconds."

**Disagreement with your recommendation.** Push back exactly once, with your strongest single reason. Then defer to the user and record the decision as theirs, including your noted dissent if you still think it's wrong. Relentless applies to coverage, not to relitigating settled decisions.

**Scope creep.** New ideas mid-interview are common. Park them in an "out of scope for now" list rather than absorbing them silently, and confirm the parking.

**Vagueness.** If an answer is abstract, ask for one concrete instance. "What does a user see on screen at that moment?" beats "how should errors be handled?"

**Fatigue — "enough questions, just build it."** Respect it immediately. Fill the remaining decisions with your recommended defaults, list those assumptions explicitly in the ledger under **Assumed (not confirmed)**, and proceed. An interview the user has stopped engaging with produces worse answers than your own defaults would.

## Stopping

Stop when the remaining unanswered questions are all cheap and reversible, every sweep category has been decided or explicitly dismissed, and you can describe the failure behaviour as concretely as the success behaviour. Or when the user says stop.

## The ledger

Write it as a file when there's a workspace, otherwise inline. This is the artifact the user confirms and that you build from.

```markdown
# Shared understanding: [thing]

## Goal

[2–3 lines. What we're doing and why.]

## Decisions

| #   | Decision | Chosen | Rationale |
| --- | -------- | ------ | --------- |

## Failure behaviour

| Scenario | What happens | User sees |
| -------- | ------------ | --------- |

## Accepted risks

[Named, deliberately unhandled. One line each.]

## Assumed (not confirmed)

[Defaults filled in without the user's explicit sign-off.]

## Out of scope

[Parked ideas, with what would bring them back in.]

## Open

[Deferred decisions and the trigger that forces each one.]
```

Then ask for confirmation. Don't start building until you get it.
