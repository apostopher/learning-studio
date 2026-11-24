import { VersionEditError } from '#/db/lesson-content-edit';

/** Run a content write, answering one refused by its version with the 409. */
export async function orVersionConflict<T>(
  write: () => Promise<T>,
): Promise<T | Response> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof VersionEditError) {
      return Response.json(error.body, { status: 409 });
    }
    throw error;
  }
}
