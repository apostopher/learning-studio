---
name: form-design
description: Opinionated, evidence-based best practices for designing, building, and reviewing forms and form-like UI — inputs, labels, validation, error messages, buttons, and any control a person fills out (text fields, radios, checkboxes, selects, file uploads, date pickers). Distilled from Adam Silver's form design work. Use this WHENEVER you build, generate, critique, or improve a form, a sign-up / checkout / settings / onboarding flow, or any screen where a user enters or selects data — on web (React, TanStack, plain HTML) or React Native / Expo — even if the user never says the word "form". Reach for it BEFORE using fancy patterns like toggle switches, sliders, tabs, accordions, placeholder text, multi-field pages, or disabled submit buttons, because this skill explains what to do instead and why.
---

# Form design

A system for designing forms that get out of the user's way. The core stance: forms are friction, and the job is to remove as much of that friction as possible. Most "good UX" in forms is not clever — it is the boring, conventional, accessible thing done correctly at scale.

This skill is opinionated on purpose. When a design decision is in tension, default to these positions and only deviate when research on real users shows you should.

## How to use this skill

**When building or generating a form/flow:** apply the three laws and four principles below, follow the core defaults, and avoid the anti-patterns in `references/pattern-library.md`. Don't reach for a novel control unless a conventional one has been shown to fail.

**When reviewing or critiquing an interface:** run it through the decision framework, then scan it against the pattern library. Name the specific issue and give the concrete fix, not vague "could be cleaner" feedback.

These principles are framework-agnostic. They apply equally to plain HTML, React/TanStack on the web, and React Native / Expo on mobile. See "Implementation notes" at the end for platform specifics.

## The three laws of form design

1. **Nobody wants to use your form.** No one opens an app hoping to fill out a form; the form stands between them and what they actually want. So respect the user by getting the form out of the way as fast as possible. Don't try to make it "fun," "engaging," novel, or "on brand" at the user's expense.

2. **Completion Time = Question Time + Pause Time.** *Question Time* is reading the label, understanding the question, and answering it. *Pause Time* is the user checking their answers and working out the consequences of submitting (Where does this go? Who gets notified? How do I find it later? When will it arrive? Can I undo it?). Both must be minimized. Unexplained optional fields, missing context, and unclear outcomes all inflate Pause Time and cause hesitation and abandonment.

3. **Users will make mistakes no matter how well your form is designed.** Do everything to prevent errors — but accept that errors still happen, and an error is the lowest point in the journey. Design to get users back on track fast. This is why error *prevention* must never come at the cost of error *visibility* (see "disabled submit buttons" and "maxlength" in the pattern library).

## The four principles of good design

Use these to course-correct any decision. A pattern that fails one of them is almost always the wrong choice.

1. **Good design works for everyone.** Designing for a minority improves things for everyone (captions help in a loud café; plain language is easier for experts too; big tap targets help every thumb). Accessibility is not a tax — it is the design.

2. **Good design makes things obvious.** The best solutions earn an "oh, of course." Show navigation instead of hiding it behind a hamburger. Show hint text inline instead of in a tooltip. Make the control look like what it is.

3. **Good design puts users in control.** Design for real life, not the happy path only. Expect interruptions mid-form. Show menus on click, not hover. Let users paginate instead of forcing infinite scroll. Don't seize control of the back button, the tab, or the page.

4. **Good design is lightweight.** Slow, heavy interfaces are stressful and feel untrustworthy, and abandonment climbs steeply with load time. Kill the background video, the carousel, the tooltip machinery. Reduce each thing to its irreducible core.

## The decision framework: design by elimination

The fastest route to good design is knowing what *not* to do. Bad patterns share recurring characteristics; avoid those characteristics and you are left with the good ones almost automatically.

**The tells of a bad pattern** — be suspicious when a control:

- **hides content** (tabs, accordions, carousels, tooltips, side drawers) — users must notice it, want to reveal it, and act to reveal it;
- **doesn't look like what it is**, or is unconventional, so users must stop and think;
- **doesn't work on small screens** or with translated / longer text;
- **doesn't work for keyboard and screen-reader users**;
- **needs JavaScript to function at all** (rather than as an enhancement);
- **exists because it's "cool" / new**, not because research showed a real problem;
- **adds code**, and so adds risk, maintenance burden, and performance cost.

**Before adopting any pattern, ask three questions:**

1. **Does research show this pattern solves a real problem?** Most fancy patterns come straight out of a designer's head, not from watching users struggle with a simpler pattern. "It's cool" is not a problem worth solving. If there's no real problem, stop here.
2. **Does the pattern introduce usability issues?** Does it look like what it is? Is it conventional? Does it work on small screens, for keyboard users, in other languages, in error states?
3. **How much effort is it to build and maintain?** Be pragmatic. High effort for a contentious, unproven pattern is a reason to deprioritize it.

**Focus on aesthetics last.** A new coat of paint wears off; what's underneath is what lasts. A form can be beautiful and still be badly designed. Get the questions, flow, states, and accessibility right first — then make it look good.

## Core defaults

Strong starting positions. Deviate only with evidence.

- **End with one thing per page.** Put one question (or one tightly-related group) per page. It helps users navigate complex flows, focus, and complete on mobile, and it makes "change" links land where the user expects. In 10+ years of usability testing this has failed roughly once; multi-field pages cause problems constantly. Merge pages only if research demands it.
- **The base form is a label, an input, and a button.** This is the answer to most "should I use this fancy layout?" questions, including sentence-style / natural-language forms.
- **Never use placeholder text as a label or hint.** It can be cropped, mistaken for an answer, and is hard to read. Use a real visible label and inline hint text.
- **Make targets big and focus visible.** Small radios/checkboxes and missing focus indicators are silent failures. Bigger controls help everyone.
- **Keep the submit button close and never disable it.** Disabling it to "prevent errors" only hides errors (law #3).
- **Show errors; never silently swallow input** (no `maxlength` truncation, no suppressed validation).
- **Don't open links in a new tab** to "help users get back" — it breaks the back button, confuses screen-reader users, and is disruptive. Solve the real journey problem instead.
- **Prefer conventional controls** (radios, checkboxes, plain buttons) over toggle switches and sliders.
- **Pronouns:** use "your" when the interface speaks to the user ("Your orders"); use "my" when the user speaks back through the UI ("Yes, share my profile photo"). Often you need no pronoun at all ("Orders").

## Pattern library

For the detailed reasoning and the recommended alternative for each specific pattern, read `references/pattern-library.md`. Consult the relevant entry whenever you are about to use — or are reviewing — that control. It covers:

- Toggle switches → radios / checkboxes / toggle *button*
- Sliders → two inputs (precise) or checkboxes (imprecise)
- Disabled submit buttons → keep enabled, validate on submit
- `maxlength` truncation → show an error instead
- Tabs that hide options → radio buttons
- Placeholder text → visible label + inline hint
- Accordions, side drawers, sticky buttons, in-form help links
- Sentence-style / natural-language forms → standard label/input/button
- Button-and-input layout → button beside the input, with space
- File upload → eliminate the upload entirely where possible
- Validation: when to validate, how to present errors, how to write messages
- Links in new tabs; "your" vs "my"; one thing per page

## Implementation notes

- **Web:** start from native HTML elements (`<input>`, `<select>`, `<button>`, real `<label>`s) and progressively enhance. Native components give you accessibility and resilience for free, but native alone does not guarantee good UX — the patterns above still apply. Avoid JS-only controls that break without scripts.
- **React Native / Expo:** the same principles hold — large tap targets, visible labels, visible focus/selection state, errors that stay on screen, one thing per screen. Reserve toggle switches for genuinely binary settings that take immediate effect (e.g. a mic on/off in a live call); for anything else prefer selectable options with an explicit save.
- **Motion:** animation should clarify state and transitions, never hide content or delay the user. If an animation adds Pause Time or obscures an error, cut it.
