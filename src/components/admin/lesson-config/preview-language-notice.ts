import {
  labelForLang,
  PRIMARY_VIDEO_LANG,
  type VideoLang,
} from '#/lib/video-languages';

/** Why a previewed language has nothing to play. */
export type PreviewNotPlayableKind =
  | 'rendering'
  | 'failed'
  | 'error'
  | 'unavailable';

export type PreviewLanguageNotice = {
  message: string;
  /** `alert` for a failure, `status` for a wait. */
  tone: 'status' | 'alert';
  backLabel: string;
};

/**
 * What to say when a previewed TRANSLATION cannot play, and how to get back.
 *
 * The shared player holds the only language menu, and it is not drawn when
 * there is nothing to play — so without this, picking a language that is
 * still rendering (or whose provider is not connected) strands the admin on
 * it, and the per-lesson preview-language atom keeps them stranded in the
 * board modal too until a reload. `null` for the primary language: there is
 * nowhere to go back to, and the generic lines already describe it.
 */
export function previewLanguageNotice(
  lang: VideoLang,
  kind: PreviewNotPlayableKind,
  errorMessage?: string | null,
): PreviewLanguageNotice | null {
  if (lang === PRIMARY_VIDEO_LANG) return null;
  const name = labelForLang(lang);
  const backLabel = `Back to ${labelForLang(PRIMARY_VIDEO_LANG)}`;
  switch (kind) {
    case 'rendering':
      return {
        message: `The ${name} video is still rendering and isn't playable yet.`,
        tone: 'status',
        backLabel,
      };
    case 'failed':
      return {
        message: `The ${name} video failed to render at the provider.`,
        tone: 'alert',
        backLabel,
      };
    case 'unavailable':
      return {
        message: `No ${name} video is assigned to this lesson.`,
        tone: 'status',
        backLabel,
      };
    case 'error':
      return {
        message: `The ${name} video couldn't be loaded: ${errorMessage ?? 'something went wrong.'}`,
        tone: 'alert',
        backLabel,
      };
  }
}
