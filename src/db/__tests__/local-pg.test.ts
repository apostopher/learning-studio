// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb, freshDb, localPg } from './support/local-pg';

afterEach(() => vi.unstubAllEnvs());

describe('local-pg', () => {
  it('is null without TEST_DATABASE_URL, and never falls back to DATABASE_URL', async () => {
    vi.stubEnv('TEST_DATABASE_URL', '');
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/anything');
    expect(localPg()).toBeNull();
    await expect(freshDb({ migrated: false })).rejects.toThrow(
      'TEST_DATABASE_URL is not set',
    );
  });

  it.each([
    'postgres://u:p@db.example.com/prod',
    'postgres://localhost.example.com/prod',
    // pg honours `?host=` over the URL's own host.
    'postgres://localhost/prod?host=db.example.com',
  ])('refuses the non-local host in %s', async (url) => {
    vi.stubEnv('TEST_DATABASE_URL', url);
    expect(() => localPg()).toThrow(/localhost or 127\.0\.0\.1/);
    await expect(createDb('')).rejects.toThrow(/localhost or 127\.0\.0\.1/);
    await expect(freshDb({ migrated: true })).rejects.toThrow(
      /localhost or 127\.0\.0\.1/,
    );
  });

  it.each([
    'localhost',
    '127.0.0.1',
  ])('accepts %s without connecting', async (host) => {
    vi.stubEnv('TEST_DATABASE_URL', `postgres://${host}/rmtp_versions_test`);
    const local = localPg();
    expect(local?.pool.options.host).toBe(host);
    await local?.pool.end();
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('freshDb', () => {
  it('hands out separate prefixed databases and drops them', async () => {
    const [a, b] = await Promise.all([
      freshDb({ migrated: false }),
      freshDb({ migrated: false }),
    ]);
    const nameOf = async (d: typeof a) =>
      (await d.pool.query('select current_database() as n')).rows[0].n;
    const names = [await nameOf(a), await nameOf(b)];
    expect(new Set(names).size).toBe(2);
    for (const n of names) expect(n).toMatch(/^rmtp_versions_test_/);

    await Promise.all([a.drop(), b.drop()]);
    const local = localPg();
    const left = await local?.pool.query(
      'select datname from pg_database where datname = any($1)',
      [names],
    );
    await local?.pool.end();
    expect(left?.rows).toEqual([]);
  });
});
