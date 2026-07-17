/** Read-only list of attachment names detected in the doc (not persisted). */
export const AttachmentsList = ({ attachments }: { attachments: string[] }) => {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-gray-11 text-xs uppercase tracking-wide">
        Detected attachments (not saved)
      </span>
      <ul className="flex flex-col gap-1 text-gray-12 text-sm">
        {attachments.map((name, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: attachments is a flat, non-reorderable list of extracted names with no stable identifier — index is the only available key.
          <li key={i} className="break-words">
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
};
