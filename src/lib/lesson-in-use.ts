const removeFirst = (courseCount: number) =>
  `Remove it from ${courseCount === 1 ? 'that course' : 'those courses'} first.`;

/** Why a lesson some courses show cannot be deleted, naming them. */
export function lessonInUseMessage(courseNames: string[]): string {
  const names = new Intl.ListFormat('en-GB').format(courseNames);
  return `Used by ${names}. ${removeFirst(courseNames.length)}`;
}

/** The same, where only their number is known. */
export function lessonInUseByCountMessage(courseCount: number): string {
  const courses = courseCount === 1 ? '1 course' : `${courseCount} courses`;
  return `Used by ${courses}. ${removeFirst(courseCount)}`;
}
