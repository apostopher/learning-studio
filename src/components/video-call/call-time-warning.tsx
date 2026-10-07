/** Always-mounted live region; its content appears once at one minute left,
 * so screen readers announce it once (the countdown itself is not live). */
export function CallTimeWarning({ visible }: { visible: boolean }) {
  return (
    <output
      aria-live="polite"
      // top-3 is physical: overlay corner of the video frame; Tailwind has no
      // block-start inset utility.
      className="pointer-events-none absolute inset-x-3 top-3 flex justify-center"
    >
      {visible && (
        <p className="rounded-md border border-warning-7 bg-warning-3 px-3 py-1.5 font-medium text-sm text-warning-text shadow-sm">
          1 minute left
        </p>
      )}
    </output>
  );
}
