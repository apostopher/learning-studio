import { format } from 'date-fns';
import { LEVEL_LABELS } from '#/lib/level-labels';
import type { OfferingUser } from '#/lib/offering-schemas';
import { formatWindowSummary, parseDayKey } from './offering-window';

/**
 * The offering popover's Print button: an A4 sheet of the course's dates and
 * who is on it, handed to the browser's print dialog — where "Save as PDF"
 * makes the PDF.
 *
 * The sheet is a standalone HTML document printed from a hidden iframe, not
 * the app page under a print stylesheet: the app is dark-themed and the
 * popover lives in a portal over a calendar, none of which belongs on paper.
 * The iframe carries only the sheet and its own few styles.
 *
 * The browser names the PDF after the document's title, so the title is the
 * course name.
 */

export type OfferingPrintInput = {
  courseName: string;
  startsOn: string;
  endsOn: string;
  /** Empty when no arrival date is set. */
  arriveAt: string;
  users: OfferingUser[];
  printedAt: Date;
};

/** "26 Nov 2026": the month spelled, so no reader mistakes 05/01 for 1 May. */
function formatDay(key: string): string | null {
  const date = parseDayKey(key);
  return date ? format(date, 'd MMM yyyy') : null;
}

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** The whole sheet, as the HTML document the iframe prints. */
export function offeringPrintHtml(input: OfferingPrintInput): string {
  const title = escapeHtml(input.courseName);
  const details: [string, string][] = [
    ['Start date', formatDay(input.startsOn) ?? '—'],
    ['Complete by', formatDay(input.endsOn) ?? '—'],
    ['Window', formatWindowSummary(input.startsOn, input.endsOn) ?? '—'],
    ['Arrive at training center', formatDay(input.arriveAt) ?? 'Not set'],
  ];
  const count = input.users.length;
  const rows =
    count === 0
      ? '<tr><td colspan="4" class="empty">Nobody is on this offering yet.</td></tr>'
      : input.users
          .map(
            (user, index) =>
              `<tr><td class="num">${index + 1}</td><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${user.level ? LEVEL_LABELS[user.level] : 'Not set'}</td></tr>`,
          )
          .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  /* Paper is light whatever the app's theme: system colours with a light
     colour-scheme give ink on paper without hard-coding either. */
  :root { color-scheme: light; }
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 10.5pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: CanvasText;
    background: Canvas;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { margin: 0 0 2mm; font-size: 18pt; line-height: 1.2; text-wrap: balance; }
  .printed { margin: 0 0 8mm; color: color-mix(in oklab, CanvasText 70%, Canvas); font-size: 9pt; }
  h2 {
    margin: 0 0 3mm;
    font-size: 9pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 2mm 8mm;
    margin: 0 0 9mm;
  }
  dt { font-weight: 600; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  table { inline-size: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td {
    padding-block: 2.2mm;
    padding-inline: 0 4mm;
    text-align: start;
    vertical-align: top;
    border-block-end: 0.3mm solid color-mix(in oklab, CanvasText 25%, Canvas);
    overflow-wrap: anywhere;
  }
  th {
    font-size: 8.5pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-block-end-color: CanvasText;
  }
  .num { inline-size: 8mm; font-variant-numeric: tabular-nums; }
  .empty { font-style: italic; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="printed">Printed ${format(input.printedAt, 'd MMM yyyy')}</p>
<h2>Course details</h2>
<dl>${details.map(([term, value]) => `<dt>${term}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>
<h2>Students · ${count} ${count === 1 ? 'person' : 'people'}</h2>
<table>
<thead><tr><th class="num">#</th><th>Name</th><th>Email</th><th>Level</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
}

/**
 * Prints `html` from a hidden iframe and opens the browser's print dialog.
 *
 * The top page's title is swapped for the sheet's while the dialog is open:
 * browsers differ on whose title names the saved PDF when a frame prints, so
 * both say the course name. Everything is put back on `afterprint`.
 */
export function printHtmlDocument(html: string, title: string): void {
  // A sheet left over from a print whose dialog never reported closing.
  document.querySelector('iframe[data-offering-print]')?.remove();

  const frame = document.createElement('iframe');
  frame.setAttribute('data-offering-print', '');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Off-screen rather than display:none, which some browsers refuse to print.
  // Physical offsets: the frame is parked outside the viewport, whatever the
  // writing mode.
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden;';
  document.body.append(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const pageTitle = document.title;
  document.title = title;
  const cleanUp = () => {
    document.title = pageTitle;
    frame.remove();
  };
  win.addEventListener('afterprint', () => setTimeout(cleanUp), { once: true });
  win.focus();
  win.print();
}
