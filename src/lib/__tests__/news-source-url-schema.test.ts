import { describe, expect, it } from 'vitest';
import {
  createNewsSourceInputSchema,
  newsSourceUrlSchema,
} from '#/lib/admin-schemas';

describe('newsSourceUrlSchema', () => {
  it('accepts https and http', () => {
    expect(newsSourceUrlSchema.safeParse('https://www.avweb.com/').success).toBe(
      true,
    );
    expect(newsSourceUrlSchema.safeParse('http://www.avweb.com/').success).toBe(
      true,
    );
  });

  it('trims surrounding whitespace before storing', () => {
    const parsed = newsSourceUrlSchema.parse('  https://www.avweb.com/  ');
    expect(parsed).toBe('https://www.avweb.com/');
  });

  it.each([
    ['not a url', 'avweb'],
    ['bare host', 'www.avweb.com'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(newsSourceUrlSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['file', 'file:///etc/passwd'],
    ['data', 'data:text/html,<h1>hi</h1>'],
    ['ftp', 'ftp://example.com/feed'],
  ])('rejects the %s scheme', (_label, value) => {
    expect(newsSourceUrlSchema.safeParse(value).success).toBe(false);
  });

  // The scraper will fetch these server-side, long after the write, with no
  // review in between. A stored SSRF target must not be persistable.
  it.each([
    ['localhost', 'http://localhost:3000/'],
    ['localhost subdomain', 'http://api.localhost/'],
    ['loopback v4', 'http://127.0.0.1/'],
    ['loopback v6', 'http://[::1]/'],
    ['unspecified', 'http://0.0.0.0/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['private 10/8', 'http://10.1.2.3/'],
    ['private 192.168/16', 'http://192.168.1.1/'],
    ['private 172.16/12 low', 'http://172.16.0.1/'],
    ['private 172.16/12 high', 'http://172.31.255.254/'],
  ])('rejects %s', (_label, value) => {
    expect(newsSourceUrlSchema.safeParse(value).success).toBe(false);
  });

  // 172.15 and 172.32 sit just outside the private block; rejecting them would
  // silently block legitimate public hosts.
  it.each([
    ['172.15.0.1', 'http://172.15.0.1/'],
    ['172.32.0.1', 'http://172.32.0.1/'],
    ['public v4', 'http://93.184.216.34/'],
  ])('allows %s, which is outside the private range', (_label, value) => {
    expect(newsSourceUrlSchema.safeParse(value).success).toBe(true);
  });
});

describe('createNewsSourceInputSchema', () => {
  const valid = { name: 'AVweb', url: 'https://www.avweb.com/' };

  it('accepts the minimum: a name and a URL', () => {
    const parsed = createNewsSourceInputSchema.parse(valid);
    expect(parsed.name).toBe('AVweb');
    expect(parsed.tintColor).toBeUndefined();
  });

  it('rejects a blank name', () => {
    expect(
      createNewsSourceInputSchema.safeParse({ ...valid, name: '   ' }).success,
    ).toBe(false);
  });

  it('treats an empty tint color as unset rather than invalid', () => {
    const parsed = createNewsSourceInputSchema.parse({
      ...valid,
      tintColor: '',
    });
    expect(parsed.tintColor).toBeUndefined();
  });

  it.each(['#1B4D3E', '#abc', '#ABCDEF'])('accepts hex %s', (tintColor) => {
    expect(
      createNewsSourceInputSchema.safeParse({ ...valid, tintColor }).success,
    ).toBe(true);
  });

  it.each(['1B4D3E', '#12345', 'rebeccapurple', '#GGGGGG'])(
    'rejects tint color %s',
    (tintColor) => {
      expect(
        createNewsSourceInputSchema.safeParse({ ...valid, tintColor }).success,
      ).toBe(false);
    },
  );
});
