/**
 * Three bouncing dots — the assistant "typing" indicator shown while a reply is
 * pending (before the first streamed token). Hookless presentational; the
 * staggered `animation-delay`s create the classic wave. Styled as a compact
 * assistant-aligned bubble to match `ChatMessage`'s assistant surface.
 */
export function TypingDots() {
  return (
    <output
      aria-label="Assistant is typing"
      className="flex w-fit items-center gap-1 rounded-2xl bg-gray-3 px-4 py-3.5"
    >
      <span className="size-1.5 animate-bounce rounded-full bg-gray-10 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-gray-10 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-gray-10" />
    </output>
  );
}
