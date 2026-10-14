import { Video } from 'lucide-react';
import { VideoPlayerContainer } from '#/components/video-player';
import type { LearnerPlayback } from '#/lib/admin-schemas';
import { badgeForLang, labelForLang } from '#/lib/video-languages';
import { captionsForPlayback } from '#/lib/video-providers/playback-captions';

interface VideoPreviewProps {
  playback: LearnerPlayback | null;
  /** Previewed language changed; caller re-queries playback for it. */
  onLanguageChange?: (code: string) => void;
  /** Signed URL refused mid-play; caller refetches playback. */
  onSourceExpired?: () => void;
  /** Recovery exhausted — for Mux this means the stored key is dead. */
  onPlaybackFailed?: (message: string) => void;
}

/**
 * 16:9 admin preview: a placeholder until there is something playable, then
 * the app's shared `VideoPlayerContainer` — captions, language menu, recovery
 * and all. Presentational: it only chooses which of the two to draw and maps
 * the playback body onto the player's props.
 *
 * Deliberately NOT keyed here. Keying on the URL would remount the player on
 * every token refresh and on a language switch, throwing away the restore
 * point that resumes at the same spot. The per-LESSON remount is the
 * callers' (`key={lesson.id}` / `key={play.lessonId}`), so recovery budget
 * and a pending restore never leak from one lesson into the next.
 */
export const VideoPreview = ({
  playback,
  onLanguageChange,
  onSourceExpired,
  onPlaybackFailed,
}: VideoPreviewProps) => {
  if (!playback || playback.status !== 'ready') {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-3">
        <Video className="h-10 w-10 text-gray-8" aria-hidden="true" />
      </div>
    );
  }

  const lang = playback.lang;
  return (
    <VideoPlayerContainer
      src={playback.url}
      kind={playback.kind}
      poster={playback.poster ?? undefined}
      captions={captionsForPlayback(playback.captions, lang)}
      captionsUnavailable={playback.captions === null}
      languages={playback.languages.map((code) => ({
        code,
        badge: badgeForLang(code),
        label: labelForLang(code),
      }))}
      activeLanguage={lang}
      onLanguageChange={onLanguageChange}
      onSourceExpired={onSourceExpired}
      onPlaybackFailed={onPlaybackFailed}
    />
  );
};
