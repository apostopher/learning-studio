import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  isSameSite,
  registrableDomain,
} from '#/lib/news/canonical-url';

describe('canonicalizeUrl', () => {
  it('strips tracking params so one story is one URL', () => {
    expect(
      canonicalizeUrl(
        'https://www.avweb.com/news/story?utm_source=x&utm_medium=y&fbclid=z',
      ),
    ).toBe('https://www.avweb.com/news/story');
  });

  it('keeps params that identify the article', () => {
    expect(canonicalizeUrl('https://www.avweb.com/read?id=42')).toBe(
      'https://www.avweb.com/read?id=42',
    );
  });

  it('sorts params so key order does not create two canonical forms', () => {
    expect(canonicalizeUrl('https://x.com/a?b=2&a=1')).toBe(
      canonicalizeUrl('https://x.com/a?a=1&b=2'),
    );
  });

  it('drops the fragment', () => {
    expect(canonicalizeUrl('https://x.com/a#section')).toBe('https://x.com/a');
  });

  it('lowercases the host but preserves path case', () => {
    // Plenty of CMSes serve case-sensitive slugs; lowercasing the path 404s.
    expect(canonicalizeUrl('https://WWW.AVweb.com/News/MyStory')).toBe(
      'https://www.avweb.com/News/MyStory',
    );
  });

  it('removes a trailing slash from a path but not from the root', () => {
    expect(canonicalizeUrl('https://x.com/a/b/')).toBe('https://x.com/a/b');
    expect(canonicalizeUrl('https://x.com/')).toBe('https://x.com/');
  });

  it('drops default ports', () => {
    expect(canonicalizeUrl('https://x.com:443/a')).toBe('https://x.com/a');
    expect(canonicalizeUrl('http://x.com:80/a')).toBe('http://x.com/a');
  });

  it('strips embedded credentials', () => {
    expect(canonicalizeUrl('https://user:pass@x.com/a')).toBe(
      'https://x.com/a',
    );
  });

  it.each([
    ['not a url', 'nonsense'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,<h1>x</h1>'],
    ['file', 'file:///etc/passwd'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(canonicalizeUrl(value)).toBeNull();
  });
});

describe('registrableDomain', () => {
  it.each([
    ['avweb.com', 'avweb.com'],
    ['www.avweb.com', 'avweb.com'],
    ['news.sub.avweb.com', 'avweb.com'],
    ['localhost', 'localhost'],
  ])('%s -> %s', (input, expected) => {
    expect(registrableDomain(input)).toBe(expected);
  });
});

describe('isSameSite', () => {
  const SOURCE = 'https://www.avweb.com/';

  it.each([
    ['exact host', 'https://www.avweb.com/news/story'],
    ['apex when source is www', 'https://avweb.com/news/story'],
    ['subdomain of the apex', 'https://news.avweb.com/story'],
    ['http vs https', 'http://www.avweb.com/story'],
  ])('accepts %s', (_label, candidate) => {
    expect(isSameSite(candidate, SOURCE)).toBe(true);
  });

  // This is the primary defence against a prompt-injected index page steering
  // the server at hosts of the attacker's choosing.
  it.each([
    ['a different publisher', 'https://www.flyingmag.com/story'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['loopback', 'http://127.0.0.1:8080/admin'],
    ['localhost', 'http://localhost/admin'],
    ['a lookalike suffix', 'https://www.avweb.com.evil.test/story'],
    ['a lookalike prefix', 'https://evilavweb.com/story'],
    ['garbage', 'not-a-url'],
  ])('rejects %s', (_label, candidate) => {
    expect(isSameSite(candidate, SOURCE)).toBe(false);
  });

  it('rejects a different site sharing no registrable domain', () => {
    expect(isSameSite('https://cdn.example.com/x', SOURCE)).toBe(false);
  });
});
