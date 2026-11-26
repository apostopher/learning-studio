// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { offeringPrintHtml, printHtmlDocument } from '../offering-print';

const input = {
  courseName: 'ITPS 2 Week Introduction to UAS Flight Test Training',
  startsOn: '2026-11-26',
  endsOn: '2027-01-09',
  arriveAt: '2026-01-05',
  users: [
    {
      userId: 'a',
      name: 'David Cooke',
      email: 'david@example.com',
      level: 'basic' as const,
    },
    {
      userId: 'b',
      name: 'Adam <b>D</b>',
      email: 'adam@example.com',
      level: null,
    },
  ],
  printedAt: new Date(2026, 10, 26),
};

const parse = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html');

describe('offeringPrintHtml', () => {
  it('titles the document with the course name, which names the PDF', () => {
    expect(parse(offeringPrintHtml(input)).title).toBe(input.courseName);
  });

  it('prints the dates with the month spelled out, and the window', () => {
    const text = parse(offeringPrintHtml(input)).body.textContent ?? '';
    expect(text).toContain('26 Nov 2026');
    expect(text).toContain('9 Jan 2027');
    expect(text).toContain('5 Jan 2026');
    expect(text).toContain('45 calendar days — 6 weeks and 3 days');
  });

  it('lists every student with email and level, as text not markup', () => {
    const doc = parse(offeringPrintHtml(input));
    const rows = [...doc.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ['1', 'David Cooke', 'david@example.com', 'Basic'],
      ['2', 'Adam <b>D</b>', 'adam@example.com', 'Not set'],
    ]);
    expect(doc.querySelector('tbody b')).toBeNull();
    expect(doc.body.textContent).toContain('Students · 2 people');
  });

  it('says so when nobody is on it, and when no arrival date is set', () => {
    const text =
      parse(offeringPrintHtml({ ...input, users: [], arriveAt: '' })).body
        .textContent ?? '';
    expect(text).toContain('Nobody is on this offering yet.');
    expect(text).toMatch(/Arrive at training center\s*Not set/);
  });

  it('heads the level column 3D', () => {
    const headers = [
      ...parse(offeringPrintHtml(input)).querySelectorAll('thead th'),
    ].map((th) => th.textContent);
    expect(headers).toEqual(['#', 'Name', 'Email', '3D']);
  });

  it('is an A4 page', () => {
    expect(offeringPrintHtml(input)).toContain('size: A4');
  });
});

describe('printHtmlDocument', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Appends for real, then gives the frame's window a print stub (jsdom has none). */
  const stubFramePrint = (print: (frame: HTMLIFrameElement) => void) => {
    const append = document.body.append.bind(document.body);
    vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
      append(...nodes);
      const frame = nodes[0] as HTMLIFrameElement;
      (frame.contentWindow as Window).print = () => print(frame);
    });
  };

  it('prints the sheet under the course title, then puts the page back', () => {
    document.title = 'Schedule';
    const seen: { frameTitle?: string; pageTitle?: string; rows?: number } = {};
    let printed: HTMLIFrameElement | undefined;
    stubFramePrint((frame) => {
      printed = frame;
      seen.frameTitle = frame.contentDocument?.title;
      seen.pageTitle = document.title;
      seen.rows = frame.contentDocument?.querySelectorAll('tbody tr').length;
    });

    printHtmlDocument(offeringPrintHtml(input), input.courseName);

    expect(seen).toEqual({
      frameTitle: input.courseName,
      pageTitle: input.courseName,
      rows: 2,
    });
    printed?.contentWindow?.dispatchEvent(new Event('afterprint'));
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(document.title).toBe('Schedule');
        expect(document.querySelector('iframe')).toBeNull();
        resolve();
      }),
    );
  });
});
