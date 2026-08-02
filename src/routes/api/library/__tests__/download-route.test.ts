// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCourseSlugsForLibraryFile: vi.fn(),
  getLibraryFileForDownload: vi.fn(),
  getLibraryForUser: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/db/library', () => ({
  getCourseSlugsForLibraryFile: m.getCourseSlugsForLibraryFile,
  getLibraryFileForDownload: m.getLibraryFileForDownload,
}));
vi.mock('#/lib/library.server', () => ({
  getLibraryForUser: m.getLibraryForUser,
}));

import { getLibraryDownloadHandler } from '../download.$fileId';

const req = () => new Request('http://t/api/library/download/7');

const openFile = {
  adminBypass: false,
  files: [
    {
      id: 7,
      name: 'f',
      size: 1,
      type: 'application/pdf',
      lock: { kind: 'open' },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', m.fetch);
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getCourseSlugsForLibraryFile.mockResolvedValue(['itps-uas-remote']);
  m.getLibraryForUser.mockResolvedValue(openFile);
  m.getLibraryFileForDownload.mockResolvedValue({
    url: 'https://x.public.blob.vercel-storage.com/library-AQ%20101.pdf',
    name: 'AQ 101',
    type: 'application/pdf',
  });
  m.fetch.mockResolvedValue(
    new Response('PDFBYTES', {
      status: 200,
      headers: { 'content-length': '8' },
    }),
  );
});

describe('getLibraryDownloadHandler', () => {
  it('401s an anonymous caller without touching the database', async () => {
    m.getSession.mockResolvedValueOnce(null);
    expect((await getLibraryDownloadHandler(req(), '7')).status).toBe(401);
    expect(m.getCourseSlugsForLibraryFile).not.toHaveBeenCalled();
  });

  it('streams the bytes to an entitled learner', async () => {
    const res = await getLibraryDownloadHandler(req(), '7');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('PDFBYTES');
  });

  it('sets a download filename derived from the blob pathname', async () => {
    const res = await getLibraryDownloadHandler(req(), '7');
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="AQ 101.pdf"; filename*=UTF-8''AQ%20101.pdf`,
    );
  });

  it('never lets a shared cache hold an entitlement-dependent response', async () => {
    const res = await getLibraryDownloadHandler(req(), '7');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not reveal the blob URL in any header', async () => {
    const res = await getLibraryDownloadHandler(req(), '7');
    const headers = JSON.stringify([...res.headers.entries()]);
    expect(headers).not.toContain('blob.vercel-storage.com');
    expect(res.status).not.toBe(302);
  });

  describe('the uniform 403 (D11)', () => {
    /**
     * Locked, not-enrolled and no-such-file must be indistinguishable, or a
     * signed-in caller can enumerate which file ids exist and which lessons
     * another learner has finished.
     */
    const bodies: Record<string, () => void> = {
      locked: () =>
        m.getLibraryForUser.mockResolvedValue({
          adminBypass: false,
          files: [
            {
              id: 7,
              name: 'f',
              size: 1,
              type: 'application/pdf',
              lock: {
                kind: 'lesson-locked',
                lessonName: 'l',
                lessonSlug: 'l',
                moduleSlug: 'm',
              },
            },
          ],
        }),
      'not enrolled': () =>
        m.getLibraryForUser.mockResolvedValue({
          adminBypass: false,
          files: [],
        }),
      'unknown file': () =>
        m.getCourseSlugsForLibraryFile.mockResolvedValue([]),
      'row without a blob': () =>
        m.getLibraryFileForDownload.mockResolvedValue(null),
    };

    it.each(Object.keys(bodies))('403s for: %s', async (label) => {
      bodies[label]();
      expect((await getLibraryDownloadHandler(req(), '7')).status).toBe(403);
    });

    it('returns a byte-identical body for every one of them', async () => {
      const texts: string[] = [];
      for (const setup of Object.values(bodies)) {
        vi.clearAllMocks();
        m.getSession.mockResolvedValue({ user: { id: 'u1' } });
        m.getCourseSlugsForLibraryFile.mockResolvedValue(['c']);
        m.getLibraryForUser.mockResolvedValue(openFile);
        m.getLibraryFileForDownload.mockResolvedValue({
          url: 'https://x/library-a.pdf',
          name: 'a',
          type: 'application/pdf',
        });
        setup();
        texts.push(await (await getLibraryDownloadHandler(req(), '7')).text());
      }
      expect(new Set(texts).size).toBe(1);
    });

    it('403s a non-numeric id without querying anything', async () => {
      expect((await getLibraryDownloadHandler(req(), 'abc')).status).toBe(403);
      expect(m.getCourseSlugsForLibraryFile).not.toHaveBeenCalled();
    });

    /**
     * Number('12abc') is NaN, but parseInt would have returned 12 — silently
     * serving a different file than the URL asked for.
     */
    it('403s a partially-numeric id rather than coercing it', async () => {
      expect((await getLibraryDownloadHandler(req(), '12abc')).status).toBe(
        403,
      );
      expect(m.getCourseSlugsForLibraryFile).not.toHaveBeenCalled();
    });

    it('403s a non-integer id', async () => {
      expect((await getLibraryDownloadHandler(req(), '1.5')).status).toBe(403);
    });
  });

  describe('when the blob is gone', () => {
    it('502s on an upstream 404 rather than serving an empty file', async () => {
      m.fetch.mockResolvedValue(new Response('', { status: 404 }));
      const res = await getLibraryDownloadHandler(req(), '7');
      expect(res.status).toBe(502);
      expect(await res.text()).toContain('unavailable');
    });

    it('502s rather than throwing when the fetch itself rejects', async () => {
      m.fetch.mockRejectedValue(new Error('ECONNRESET'));
      expect((await getLibraryDownloadHandler(req(), '7')).status).toBe(502);
    });
  });

  describe('a file reachable from more than one course', () => {
    it('allows it when the SECOND course grants access', async () => {
      m.getCourseSlugsForLibraryFile.mockResolvedValue(['locked-c', 'open-c']);
      m.getLibraryForUser.mockImplementation(
        async ({ courseSlug }: { courseSlug: string }) =>
          courseSlug === 'open-c'
            ? openFile
            : { adminBypass: false, files: [] },
      );
      expect((await getLibraryDownloadHandler(req(), '7')).status).toBe(200);
    });

    it('stops evaluating once one course has granted access', async () => {
      m.getCourseSlugsForLibraryFile.mockResolvedValue(['open-c', 'other-c']);
      await getLibraryDownloadHandler(req(), '7');
      expect(m.getLibraryForUser).toHaveBeenCalledTimes(1);
    });
  });

  it('re-runs the gate on every click rather than trusting the page', async () => {
    await getLibraryDownloadHandler(req(), '7');
    expect(m.getLibraryForUser).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'itps-uas-remote',
    });
  });
});
