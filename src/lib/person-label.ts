/**
 * How a person is named in every people picker.
 *
 * Full name with the email in parentheses, or the email alone when the
 * profile carries no name.
 *
 * Pure and dependency-free so BOTH sides can use it: the offerings query
 * builds these labels on the server, and the discipline pickers build them in
 * the browser. Two implementations of the fallback rule would be two places
 * for it to drift — which is why `staffCandidateLabel` now delegates here
 * rather than keeping its own copy.
 */
export function personLabel(person: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string {
  const name = [person.firstName, person.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name ? `${name} (${person.email})` : person.email;
}
