const COPY = {
  saving: 'Saving the call transcript…',
  delayed: 'The transcript will appear in this chat shortly.',
} as const;

export function TranscriptStatusLine({ state }: { state: keyof typeof COPY }) {
  return (
    <output className="block px-1 text-xs text-secondary italic">
      {COPY[state]}
    </output>
  );
}
