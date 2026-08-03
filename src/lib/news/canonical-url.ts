/**
 * URL normalization and the same-domain gate for scraped links.
 *
 * Pure — no network, no database. Everything here decides whether a URL the
 * model produced may be fetched at all, so it is deliberately separable from
 * the pipeline that calls it.
 */

/**
 * Query parameters that identify a campaign or a referrer rather than the
 * article. Two links differing only in these point at the same story, so they
 * must collapse before the unique index sees them.
 */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ref$/i,
  /^referrer$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^igshid$/i,
  /^_hs(enc|mi)$/i,
  /^vero_(conv|id)$/i,
  /^yclid$/i,
  /^s_cid$/i,
];

const isTrackingParam = (key: string): boolean =>
  TRACKING_PARAMS.some((pattern) => pattern.test(key));

/**
 * Strip tracking params and the fragment, drop a default port, and lowercase
 * the host. The path's case is preserved — plenty of CMSes serve
 * case-sensitive slugs, so lowercasing it would 404.
 */
export function canonicalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.hash = '';
  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParam(key)) url.searchParams.delete(key);
  }
  // Sorted so `?a=1&b=2` and `?b=2&a=1` produce one canonical form.
  url.searchParams.sort();

  // A bare trailing slash on a non-root path is not meaningful; keep it on the
  // root so "https://x.com/" does not become the schema-invalid "https://x.com".
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

/**
 * The registrable-ish domain: the last two labels of the host.
 *
 * Deliberately naive. A full public-suffix list would treat `bbc.co.uk`
 * correctly where this yields `co.uk`, but the only use here is comparing two
 * hosts to each other, and both sides are reduced the same way — so a
 * publisher on `.co.uk` still matches its own subdomains. It would only be
 * wrong in the direction of accepting a *different* `.co.uk` site, which the
 * caller's suffix check below rules out anyway.
 */
export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  return labels.slice(-2).join('.');
}

/**
 * Whether `candidate` belongs to the same site as `source`.
 *
 * This is the primary defence against prompt injection in the scrape pipeline:
 * the model reads an attacker-influencable page and returns URLs the server
 * then fetches. Restricting those to the source's own site collapses the whole
 * surface to "a host we already decided to trust". Exact host match or a
 * subdomain of the source's host both pass; anything else is rejected, which
 * costs a few legitimately syndicated articles and is worth it.
 */
export function isSameSite(candidate: string, source: string): boolean {
  let a: URL;
  let b: URL;
  try {
    a = new URL(candidate);
    b = new URL(source);
  } catch {
    return false;
  }
  const host = a.hostname.toLowerCase();
  const sourceHost = b.hostname.toLowerCase();
  if (host === sourceHost) return true;

  // Subdomain of the source host ("news.avweb.com" under "avweb.com"), or the
  // source is itself a subdomain and both share a registrable domain
  // ("www.avweb.com" and "avweb.com").
  if (host.endsWith(`.${sourceHost}`)) return true;
  if (sourceHost.endsWith(`.${host}`)) return true;

  const domain = registrableDomain(host);
  return (
    domain.length > 0 &&
    domain === registrableDomain(sourceHost) &&
    (host === domain || host.endsWith(`.${domain}`))
  );
}
