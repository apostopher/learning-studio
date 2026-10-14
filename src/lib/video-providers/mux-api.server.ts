import Mux from '@mux/mux-node';

/** Every Mux API call: a stuck request must not hold an admin save open. */
export const muxApiClient = (tokenId: string, tokenSecret: string) =>
  new Mux({ tokenId, tokenSecret, timeout: 10_000, maxRetries: 1 });

const isAuthStatus = (error: unknown): boolean => {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
};

/** `null` when the token works; otherwise the admin-facing reason. */
export async function checkMuxApiToken(
  tokenId: string,
  tokenSecret: string,
): Promise<string | null> {
  try {
    await muxApiClient(tokenId, tokenSecret).video.assets.list({ limit: 1 });
    return null;
  } catch (error) {
    return isAuthStatus(error)
      ? 'Mux rejected the API token.'
      : `Mux couldn't check the API token: ${(error as Error).message}`;
  }
}
