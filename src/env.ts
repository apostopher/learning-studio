import { createEnv } from '@t3-oss/env-core';
import Color from 'colorjs.io';
import { z } from 'zod';

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

export const env = createEnv({
  server: {
    SERVER_URL: z.url().optional(),
    REDIS_URL: z.string().min(1),
    MCP_CORS_ALLOWLIST: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    MCP_RESOURCE_URL: z.url(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
  },

  clientPrefix: 'VITE_',

  client: {
    VITE_APP_TITLE: z.string().min(1),

    VITE_GRAY_LIGHT: colorStr,
    VITE_GRAY_DARK: colorStr,
    VITE_ACCENT_LIGHT: colorStr,
    VITE_ACCENT_DARK: colorStr,
    VITE_BRAND_LIGHT: colorStr,
    VITE_BRAND_DARK: colorStr,

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
