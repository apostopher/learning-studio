import { z } from 'zod';

/** The primary video's language. Every lesson video is English first. */
export const PRIMARY_VIDEO_LANG = 'en';

/**
 * Languages an admin can attach a translated video under. BCP-47, as
 * Synthesia's translation feature names them (`fr-CA`, `pt-BR`). Curated
 * rather than fetched: a handful of real translations, not the 140 the
 * provider could produce, and a Mux lesson has no provider list at all.
 * Adding one is a one-line change here.
 */
export const VIDEO_LANGUAGES = [
  'fr',
  'fr-CA',
  'es',
  'de',
  'pt-BR',
  'ja',
  'zh',
  'tr',
  'af',
  'ar',
  'hi',
] as const;

export const alternateLangSchema = z.enum(VIDEO_LANGUAGES);
export type AlternateLang = z.infer<typeof alternateLangSchema>;

export const videoLangSchema = z.enum([PRIMARY_VIDEO_LANG, ...VIDEO_LANGUAGES]);
export type VideoLang = z.infer<typeof videoLangSchema>;

export const isVideoLang = (value: unknown): value is VideoLang =>
  videoLangSchema.safeParse(value).success;

const displayNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'language' })
    : null;

/** "Canadian French" — the browser's own name for the code, else the code. */
export const labelForLang = (code: VideoLang): string => {
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

/** The short form shown on the player's trigger: `EN`, `FR-CA`. */
export const badgeForLang = (code: VideoLang): string => code.toUpperCase();

/** `en` first, then whichever alternates exist, in curated order, deduped. */
export const orderedLanguages = (
  alternateLangs: readonly AlternateLang[],
): VideoLang[] => {
  const present = new Set(alternateLangs);
  return [PRIMARY_VIDEO_LANG, ...VIDEO_LANGUAGES.filter((l) => present.has(l))];
};

/** The codes not yet attached — what the admin's "Add language" select offers. */
export const availableLanguages = (
  used: readonly AlternateLang[],
): AlternateLang[] => {
  const taken = new Set(used);
  return VIDEO_LANGUAGES.filter((l) => !taken.has(l));
};

export type AlternateVideo = {
  lang: AlternateLang;
  provider: 'mux' | 'synthesia';
  ref: string;
};

/** One row per language: replaces an existing row for `entry.lang`, else appends. */
export const upsertAlternate = (
  list: readonly AlternateVideo[],
  entry: AlternateVideo,
): AlternateVideo[] => {
  const without = list.filter((a) => a.lang !== entry.lang);
  return [...without, entry];
};

export const removeAlternate = (
  list: readonly AlternateVideo[],
  lang: AlternateLang,
): AlternateVideo[] => list.filter((a) => a.lang !== lang);
