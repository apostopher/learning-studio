import { createEnv } from '@t3-oss/env-core';
import Color from 'colorjs.io';
import { z } from 'zod';
import {
  BRAND_NAME_REGEX,
  parseBrandColorEntries,
  RESERVED_BRAND_NAMES,
} from './utils/brand-colors';

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

const reservedNames = new Set<string>(RESERVED_BRAND_NAMES);

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
          name: z
            .string()
            .regex(BRAND_NAME_REGEX, {
              message: 'brand name must match /^[a-z][a-z0-9-]*$/',
            })
            .refine((n) => !reservedNames.has(n), {
              message: `brand name is reserved (${[...reservedNames].join(', ')})`,
            }),
          light: colorStr,
          dark: colorStr,
        }),
      )
      .min(1, 'VITE_BRAND_COLORS must contain at least one entry')
      .max(12, 'VITE_BRAND_COLORS supports at most 12 entries')
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
    EMAIL_FROM: z.string().email().default('noreply@example.com'),
    SYNTHESIA_API_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    // Vercel Blob read-write token — powers admin client-side image uploads.
    BLOB_READ_WRITE_TOKEN: z.string().min(1),
    // Shared secret for the Vercel Cron blob-sweep endpoint. Optional: the
    // endpoint stays disabled (401) until it's set.
    CRON_SECRET: z.string().min(1).optional(),
  },

  clientPrefix: 'VITE_',

  client: {
    VITE_APP_TITLE: z.string().min(1),

    VITE_GRAY_LIGHT: colorStr,
    VITE_GRAY_DARK: colorStr,
    VITE_BRAND_COLORS: brandColorsSchema,

    VITE_BG_LIGHT: colorStr.default('#ffffff'),
    VITE_BG_DARK: colorStr.default('#111111'),

    VITE_FONT_SANS: fontStr,
    VITE_FONT_MONO: fontStr,
    VITE_FONT_DISPLAY: fontStr,

    VITE_LOGO_LIGHT: logoStr,
    VITE_LOGO_DARK: logoStr,
  },

  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
