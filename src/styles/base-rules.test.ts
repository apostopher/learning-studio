// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesCss = readFileSync(
  resolve(process.cwd(), 'src/styles.css'),
  'utf8',
);
const rootTsx = readFileSync(
  resolve(process.cwd(), 'src/routes/__root.tsx'),
  'utf8',
);

/**
 * Asserted against the stylesheet's SOURCE, the way `tokens.test.ts` asserts
 * against `tokens.css`. A base rule has no component to render and no module
 * to import; the file is the only place it exists.
 */
describe('base rules', () => {
  it('stops button labels breaking mid-word', () => {
    // `<body>` carries `wrap-anywhere` so a long email or URL wraps instead of
    // overflowing its column. Under that, table auto-layout computes the
    // min-content width of "Manage" as ONE CHARACTER — which collapsed the
    // actions column of /admin/users and wrapped the label onto two lines.
    //
    // Mutant this catches: the rule deleted as "dead CSS nothing references".
    // Nothing does reference it — that is what a base rule is — and removing
    // it brings the bug straight back.
    expect(stylesCss).toMatch(/button\s*\{\s*overflow-wrap:\s*normal;\s*\}/);
  });

  it('is still guarding against the body class that caused it', () => {
    // If `wrap-anywhere` ever leaves `<body>`, the rule above is no longer
    // load-bearing and this test says so rather than leaving a future reader
    // to work out what it was for. Its comment names this coupling; this
    // assertion is what keeps the comment true.
    expect(rootTsx).toContain('wrap-anywhere');
  });
});
