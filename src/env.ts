import { createEnv } from '@t3-oss/env-core';
import Color from 'colorjs.io';
import { z } from 'zod';
import { BRAND_NAME_REGEX, parseBrandColorEntries } from './utils/brand-colors';

const colorStr = z.string().refine(
  (v) => {
    try {
      new Color(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'must be a valid CSS color' },
);

const logoStr = z
  .string()
  .min(1)
  .refine((v) => !/<script|on\w+\s*=|javascript:/i.test(v), {
    message:
      'logo SVG contains unsafe content (script tags, event handlers, or javascript: URIs)',
  })
  .refine(
    (v) =>
      v.trimStart().startsWith('<svg') ||
      /^https?:\/\//.test(v) ||
      v.startsWith('/'),
    { message: 'must be inline SVG, absolute URL, or /public path' },
  );

// Google Fonts spec shape: "Family Name:axis,range@value;value" e.g. "Inter:ital,wght@0,400;1,700"
// Multiple axes separated by commas; values after @ separated by semicolons.
// For display/single-variant fonts, the bare family name is also accepted: "Bebas Neue"
const fontStr = z.string().min(1);

const brandColorsSchema = z
  .string()
  .min(1)
  .transform((raw, ctx) => {
    try {
      return parseBrandColorEntries(raw);
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: (err as Error).message,
      });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(
        z.object({
          name: z.string().regex(BRAND_NAME_REGEX, {
            message: 'brand name must match /^[a-z][a-z0-9-]*$/',
          }),
          light: colorStr,
          dark: colorStr,
        }),
      )
      .min(1, 'VITE_BRAND_COLORS must contain at least one entry')
      .max(
        12,
        'VITE_BRAND_COLORS supports at most 12 user-declared entries (success/warning/error are added automatically)',
      )
      .refine((arr) => new Set(arr.map((e) => e.name)).size === arr.length, {
        message: 'brand names must be unique',
      }),
  );

export const env = createEnv({
  server: {
    SERVER_URL: z.url().optional(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),
    // Accepts either a bare address (`no-reply@example.com`) or the RFC 5322
    // display-name form (`RMTP Studio <no-reply@example.com>`). Resend takes
    // both, and the display name measurably helps inbox placement, so the
    // schema must not reject it — `z.string().email()` alone does.
    EMAIL_FROM: z
      .string()
      .regex(
        /^(?:[^<>]*<\s*[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/,
        'EMAIL_FROM must be "addr@domain" or "Display Name <addr@domain>"',
      )
      .default('noreply@example.com'),
    SYNTHESIA_API_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    // Vercel Blob read-write token — powers admin client-side image uploads.
    BLOB_READ_WRITE_TOKEN: z.string().min(1),
    // 32-byte base64 key for AES-256-GCM encryption of stored provider secrets.
    CREDENTIALS_ENCRYPTION_KEY: z.string().min(1),
    // Shared secret for the Vercel Cron blob-sweep endpoint. Optional: the
    // endpoint stays disabled (401) until it's set.
    CRON_SECRET: z.string().min(1).optional(),
    // Google Generative AI key — powers gemini-embedding-001 (RAG embeddings)
    // and PDF→HTML conversion via the gateway.
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
    // Declared ahead of use — not yet read anywhere in tracked source. Keep
    // optional until a call site consumes it, otherwise every clone/CI/
    // preview build fails with "Invalid environment variables" before
    // anything compiles (there's no .env.example and .env is gitignored).
    ELEVENLABS_API_KEY: z.string().min(1).optional(),
  },

  clientPrefix: 'VITE_',

  client: {
    VITE_APP_TITLE: z.string().min(1),

    VITE_GRAY_LIGHT: colorStr,
    VITE_GRAY_DARK: colorStr,
    VITE_BRAND_COLORS: brandColorsSchema,

    VITE_BG_LIGHT: colorStr.default('#ffffff'),
    VITE_BG_DARK: colorStr.default('#111111'),

    // Explicit shell-chrome backgrounds. Panels (header/aside/main/footer) and
    // the shell frame/gutter around them are their own tokens so they can be
    // set independently of the page background and the gray scale.
    VITE_PANEL_BG_LIGHT: colorStr.default('#ffffff'),
    VITE_PANEL_BG_DARK: colorStr.default('#111111'),

    VITE_SHELL_BG_LIGHT: colorStr.default('#ffffff'),
    VITE_SHELL_BG_DARK: colorStr.default('#111111'),

    VITE_FONT_SANS: fontStr,
    VITE_FONT_MONO: fontStr,
    VITE_FONT_DISPLAY: fontStr,
    VITE_FONT_SERIF: fontStr,

    VITE_LOGO_LIGHT: logoStr,
    VITE_LOGO_DARK: logoStr,
  },

  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
