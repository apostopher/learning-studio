/**
 * Initials disc for a person row.
 *
 * Falls back to the email's first character when there is no name — which is
 * every pending row, and every account that hasn't filled a profile in yet
 * (email-OTP signup stores an empty name, so that is the common case).
 *
 * Deliberately one neutral colour rather than a hue derived from the name:
 * this component sits beside role badges that already carry meaning in colour,
 * and a second colour system competing with them would make neither readable.
 */
export const UserAvatar = ({
  name,
  email,
}: {
  name: string;
  email: string;
}) => {
  const source = name.trim() || email;
  const initials = name.trim()
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : source.slice(0, 2).toUpperCase();

  return (
    <span
      // The name is already rendered as text beside this, so announcing the
      // initials again would just be noise for a screen reader.
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-4 font-medium text-primary text-xs"
    >
      {initials}
    </span>
  );
};
