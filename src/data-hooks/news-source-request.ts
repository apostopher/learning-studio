/**
 * A write the server rejected for a reason a specific form field owns.
 *
 * Thrown rather than returned so React Query's `onError` sees it, and carrying
 * `field` so the container can call `setError(field, ...)` instead of firing a
 * toast that leaves the offending input unmarked.
 */
export class NewsSourceFieldError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'NewsSourceFieldError';
    this.field = field;
  }
}

/**
 * Send a news-source write and parse the response, turning a 409 into a
 * `NewsSourceFieldError`. `parse` is omitted for DELETE, which answers 204 with
 * no body.
 */
export async function newsSourceRequest<T>(args: {
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  parse?: (json: unknown) => T;
}): Promise<T | undefined> {
  const res = await fetch(args.url, {
    method: args.method,
    ...(args.body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(args.body),
        }),
  });

  if (!res.ok) {
    if (res.status === 409) {
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        field?: string;
      } | null;
      throw new NewsSourceFieldError(
        payload?.field ?? 'url',
        payload?.error ?? 'That value is already in use',
      );
    }
    throw new Error(`Request failed (${res.status})`);
  }

  if (!args.parse) return undefined;
  return args.parse(await res.json());
}
