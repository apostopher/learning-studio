/**
 * Whether what the user typed into a delete confirmation names the thing
 * being deleted. Case, surrounding whitespace and runs of spaces are
 * forgiven: the input exists to prove the person read the name, not to test
 * their typing — but a partial name, a different name, or nothing at all
 * never passes, and an empty target can never be confirmed.
 */
export function matchesConfirmPhrase(typed: string, phrase: string): boolean {
  const normalise = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const target = normalise(phrase);
  return target.length > 0 && normalise(typed) === target;
}
