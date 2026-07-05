# Pattern library

Detailed reasoning and the recommended alternative for each pattern. Read the relevant entry when you are about to use — or are reviewing — that control. Each entry follows the same shape: the pattern, why it degrades UX, and what to do instead.

## Contents

1. [Toggle switches](#1-toggle-switches)
2. [Sliders](#2-sliders)
3. [Disabled submit buttons](#3-disabled-submit-buttons)
4. [maxlength truncation](#4-maxlength-truncation)
5. [Tabs that hide options](#5-tabs-that-hide-options)
6. [Placeholder text](#6-placeholder-text)
7. [Accordions in forms](#7-accordions-in-forms)
8. [Side drawers, sticky buttons, in-form help links](#8-side-drawers-sticky-buttons-in-form-help-links)
9. [Sentence-style / natural-language forms](#9-sentence-style--natural-language-forms)
10. [Button-and-input layout](#10-button-and-input-layout)
11. [File upload](#11-file-upload)
12. [Links in a new tab](#12-links-in-a-new-tab)
13. ["Your" vs "my"](#13-your-vs-my)
14. [One thing per page](#14-one-thing-per-page)
15. [Form validation](#15-form-validation)
16. [Optional fields](#16-optional-fields)

---

## 1. Toggle switches

**Avoid them; prefer radios, checkboxes, or buttons.** The only "good" reason given for a toggle is that the action takes immediate effect — but that describes an outcome, not a justification.

Why they degrade UX:

- **On/off is ambiguous.** State is often conveyed only by colour and knob alignment, which fails for colour-blind users and anyone who doesn't know the convention. Text inside the switch invites users to think they must drag the knob to "on."
- **Interaction is unclear.** Some users try to swipe a switch that's meant to be tapped.
- **Immediate effect needs async saving.** A slow request risks the change not saving, forcing a loading state — which defeats the point of "immediate."
- **They cause inconsistency.** A settings list mixing two-option toggles with multi-option rows gives identical-looking settings different interactions.
- **They need JavaScript.** With progressive enhancement you must start from radios/checkboxes/buttons anyway.
- **"Faster" is misleading.** Toggles look faster only if you start the clock after the user has decided. Counting comprehension time, and the ability to batch radio changes, the gap disappears.

What to do instead: start with radios/checkboxes and test. If you genuinely need a control that takes immediate effect and avoids a disruptive page refresh (e.g. mic on/off inside a live video call), use a clearly-labelled **toggle button** with a verb label and a large tap target — not a knob-style switch.

## 2. Sliders

**Avoid them.** Putting the value label above the thumb (so a finger doesn't cover it) is a real tip, but it patches the least of the problems.

Why they degrade UX:

- **Hard to control,** especially when precision is needed, or for users with motor impairments.
- **Values are hard to label** — limited space yields ambiguous gaps or tick marks.
- **Hard to fit on small screens** without becoming fiddly.
- **They have an upper bound,** which breaks down for open-ended values like price.

What to do instead: if the user needs precision, use **two inputs** (from / to). If they don't, use **checkboxes** for ranges. Both work on mobile and are easy to use. (General lesson: improving a bad pattern doesn't make it good — switch patterns.)

## 3. Disabled submit buttons

**Never disable the submit button to "prevent errors."** It doesn't prevent errors; it only stops users from seeing them.

Why it degrades UX:

- **No feedback** — users must hunt every field to find what's wrong.
- **Feels broken** — fix one of several errors and the button stays disabled; the UI feels unresponsive.
- **Hard to see** — low-contrast disabled styling is hard to read, especially with low vision.
- **Not focusable** — keyboard users can't tab to it, and it breaks the expected path forward.
- **Deceptive** — users still try to click it.
- **Easy to miss enabling** — the button may be off-screen or simply not where the user's attention is.

What to do instead: keep the button enabled, validate on submit, and show clear errors that get the user back on track.

## 4. maxlength truncation

**Don't use `maxlength` to stop users typing past a limit.** Silently ignoring input is not error prevention — it's hidden error.

Why it degrades UX:

- Feels broken/unresponsive when input stops being accepted.
- Users (and screen readers) often don't notice input was dropped, so incorrect data gets saved.
- Pasted values get silently truncated — and many users paste to avoid mistakes.
- It's inflexible (formatting characters like the dashes in a sort code eat into the limit).
- Autofilled / password-manager values get cut off too.

What to do instead: let users type, then if the value is too long, **show an error** so they can fix it.

## 5. Tabs that hide options

**Don't use tabs to "keep it clean."** Tabs hide content, so it takes effort to reveal and some users never spot the tab at all. (Classic failure: a checkout where account-holders must ignore the prominent guest options to find and select a tab.)

What to do instead: turn the tabs into **radio buttons** so every option is visible. The whole interaction collapses to: read the question, select the answer, press the button.

## 6. Placeholder text

**Don't use placeholder text as a label or as the hint.**

Why it degrades UX:

- It disappears on focus/typing, so it can't serve as a persistent label.
- It can be cropped.
- It's often mistaken for a pre-filled answer.
- Low contrast makes it hard to read.

What to do instead: a real, visible **label**, plus inline **hint text** above the input when guidance is needed.

## 7. Accordions in forms

**Accordions in forms are a no-no.** They hide fields, add interaction cost, and frequently don't even achieve their goal — e.g. a form that opens most panels by default ends up *longer* than the flat version while adding machinery.

What to do instead: show the fields. If the form is long, that's a signal to split across pages (one thing per page), not to hide fields behind toggles.

## 8. Side drawers, sticky buttons, in-form help links

Three related smells, often seen together on a "beautiful" but poorly-designed form:

- **Side drawer** — justified as "keeps context," but the context panel rarely helps fill the form and is often greyed out (a tell the designer didn't expect it to be read). The fixed height then forces other compromises (accordions, sticky buttons).
- **Sticky buttons pinned to the bottom** — they shrink the interaction area and can make users think there are no more fields below.
- **A help link at the top of the form** — if a form needs a separate guidance page to be filled out, the form itself isn't doing well. Fix the questions instead of linking away.

What to do instead: give the form its own page with room to breathe, lay fields out top-to-bottom, keep the submit button in normal flow, and write questions clear enough that no help page is needed.

## 9. Sentence-style / natural-language forms

**Don't lay a form out as a sentence** ("Enter your ___ to ___ [button]"). It looks novel but reliably introduces problems:

- More to read — filler words ("Enter your", "to") add no value.
- The inline button label ends up lowercase/unconventional and looks like a mistake.
- No room to show an inline error without breaking the layout.
- Translation (longer words) breaks the layout.
- It wraps and breaks on small screens.
- It leans on placeholder text.
- It often doesn't look like a form, so users must think to recognise it.

What to do instead: a normal **label, input, button**. Then spend the saved effort on real UX problems.

## 10. Button-and-input layout

For an input-plus-button combo (e.g. search, promo code), three layouts are common:

1. Button **inside** the input — contentious. It's unclear where the input ends; the focus outline ends up wrapping both input and button; more effort to build.
2. Button **touching** the input — fine *only* if the button is clearly distinguishable (e.g. a different colour).
3. Button **beside** the input with space between — **best.** It clearly separates two elements that do different things.

Default to option 3.

## 11. File upload

**The best file-upload pattern is the one where the user doesn't upload anything.** Uploading is the most labour-intensive form interaction: take/transfer a photo or locate a file, browse and select or drag-drop, then survive size/format validation.

The "next level" move (e.g. GOV.UK reusing a passport photo for a driving licence: "Do you want us to use your passport photo? [Yes]") removes the upload entirely. This is a backend/coordination problem, not a layout problem — it impressed precisely because it had nothing to do with typography or spacing.

What to do instead: first ask whether you can reuse data you already hold and skip the upload. If you must keep it, get the fundamentals right (clear label, accessible input, both click-to-browse and drag-drop, validation that shows errors rather than silently rejecting).

## 12. Links in a new tab

**Don't open links in a new tab** to "help users get back to the service."

Why it degrades UX:

- Most links don't do this, so users may not realise what happened; screen readers don't announce it.
- It breaks the back button (history is per-tab).
- It's disruptive — a user mid-form can lose their place.
- Getting back to the original tab is hard, especially with many tabs open.
- It clutters the tab bar, shrinks tabs (harder to read/tap), and consumes memory.

The real problem is usually the end-to-end journey: if users reached the page once (search, bookmark, email) they can again, and good supporting content gets them back without a new tab. Solve that instead.

## 13. "Your" vs "my"

- Use **"your"** when the interface communicates to the user: "Your account," "Your orders." It never causes the confusion "my" does (a support agent saying "go to your cases" while the UI says "My cases").
- Use **"my"** when the user communicates back through the UI, e.g. radio answers: *"Do you want to share your profile photo?" → "Yes, share my profile photo" / "No, do not share my profile photo."*
- Often you need **no pronoun at all**: "Account," "Orders," "Cases."

## 14. One thing per page

**End with one thing per page.** Put one question (or one tightly-related group) on each page of a flow.

It helps users:

- find their way through complex/unfamiliar processes,
- focus on a single question and answer,
- fill the form on a mobile device,
- and it makes "change" links from a summary page land exactly where the user expects (a change link for "emergency contact name" should not dump them onto a page of unrelated name fields).

The original rule is "*start* with one thing per page, merge if research shows you should." In 10+ years of usability testing, research has shown it doesn't work roughly **once**; multi-field pages cause problems **constantly** — hence "end" with one thing per page. Genuine exceptions are rare (e.g. a two-field sign-up where the second field is a deliberate quality filter, or where tech constraints make multi-step forms not worth it).

## 15. Form validation

An error is the lowest point in the user's journey (law #3), so validation UX matters enormously — yet most validation patterns are poor. Answer three questions deliberately:

**When to validate.** Validating as the user types or on every field-blur tends to nag and interrupt. A robust, accessible default is to **validate on submit**: show an error summary at the top *and* an inline message at each field, with the summary linking to the relevant input. (Single-question pages can skip the summary.) Errors appear on submit and persist until the next submit — don't make them appear/disappear dynamically as the user changes unrelated fields (it causes layout jumps and disorienting peripheral motion).

**How to present errors.** Three things must be unmistakable:
- that there *are* errors (a summary, not just colour),
- *where* each error is (message tied to its input, not floating far away),
- *how* to fix each one (the message says what to do).

Don't rely on colour alone, and don't rely on native HTML5 bubble validation as your only mechanism.

**How to write messages.** Be specific and actionable — say what's wrong and what to do about it, in plain language. Generic "Invalid input" forces the user to guess. Match the message to the actual problem (too long, wrong format, missing).

(Underlying strategy: once you know the failure modes of the common validation patterns, the right approach becomes obvious by elimination.)

## 16. Optional fields

Optional fields inflate Question Time and Pause Time by raising doubt — "What's this for? Is it OK to leave blank?" A form full of optional fields (e.g. a bloated issue-tracker create form) becomes tedious and leads to abandoned or low-quality entries.

What to do instead: cut fields you don't truly need; collect the rest later (e.g. let users refine after creation). If a field must stay optional, mark it clearly and make its purpose obvious so it doesn't generate hesitation.
