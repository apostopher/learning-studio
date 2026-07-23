export interface SaveJsonArgs<T> {
  url: string;
  method: 'POST' | 'PUT';
  body: unknown;
  /** Best-effort save that must survive page unload (uses sendBeacon/keepalive). */
  fireAndForget?: boolean;
  parse?: (json: unknown) => T;
}

/**
 * Save JSON to `url`. For a fire-and-forget POST, prefers `navigator.sendBeacon`
 * (the only reliable way to send during unload), falling back to a `keepalive`
 * fetch. The beacon path resolves `undefined` (there is no response to read).
 * Normal saves fetch and (optionally) parse the response.
 */
export async function saveJson<T>({
  url,
  method,
  body,
  fireAndForget = false,
  parse,
}: SaveJsonArgs<T>): Promise<T | undefined> {
  if (
    fireAndForget &&
    method === 'POST' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function'
  ) {
    // Note: sendBeacon (and the keepalive fetch fallback) cap bodies at ~64KB;
    // very large payloads may be dropped on a hard unload — the normal
    // (uncapped) debounced fetch covers the common path.
    const blob = new Blob([JSON.stringify(body)], {
      type: 'application/json',
    });
    if (navigator.sendBeacon(url, blob)) return undefined;
    // Beacon rejected (e.g. queue full) — fall through to a keepalive fetch.
  }

  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: fireAndForget,
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  return parse ? parse(await res.json()) : undefined;
}
