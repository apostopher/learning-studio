/**
 * The reason stated on every disabled write-control inside a read-only
 * (archive) lesson — the quiz's Retake, the debrief's Start and Retake.
 *
 * One string, not three, so the copy cannot drift between controls. Short
 * form of the read-only banner's copy (`lesson-main.tsx`): that banner
 * explains the page once; this explains one control, so it has to fit next to
 * a button rather than stand alone.
 *
 * A locked/disabled control must say why and what would change it — visibly
 * and in a form assistive tech reaches, not by styling or colour alone (see
 * CLAUDE.md memory note "locked states state their reason"). Every consumer
 * renders this as visible text linked to the control via `aria-describedby`,
 * matching `LessonLink`'s pattern of folding a lock reason into what the
 * control announces, rather than relying on `disabled` styling alone.
 */
export const READ_ONLY_CONTROL_REASON =
  'Not available — you completed this lesson at an earlier level.';
