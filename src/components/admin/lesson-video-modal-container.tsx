import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { Video, X } from 'lucide-react';
// `#/` not `@/` for the value imports: vitest cannot resolve the `@/` alias,
// and this container is rendered by its own test.
import { adminPreviewLangAtomFamily, playLessonAtom } from '#/atoms/admin';
import { useLessonVideoPlayback } from '#/data-hooks/use-lesson-video-playback';
import { isVideoLang } from '#/lib/video-languages';
import type { EditorBoardModule } from '@/lib/admin-schemas';
import { computeVideoModalState } from './compute-video-modal-state';
import { VideoPreview } from './lesson-config/video-preview';

/**
 * One line per non-playing outcome.
 *
 * A missing course credential is NOT one of these: it arrives as a coded
 * `PROVIDER_NOT_CONFIGURED` error carrying its own message, so it lands in
 * `error` and names itself. `unavailable` is now only what it says — the
 * lesson has no video — which is reachable because the play tile keys off
 * `isConfigured` (`videoRef !== null`) and the board cannot see more.
 */
const MESSAGES: Record<
  Exclude<ReturnType<typeof computeVideoModalState>['kind'], 'ready'>,
  string
> = {
  loading: 'Resolving playback…',
  error: "Couldn't resolve this video.",
  unavailable: 'No video is assigned to this lesson.',
  rendering: 'The provider is still rendering this video.',
  failed: 'The provider reported that this video failed to render.',
};

/**
 * Frameless video preview, opened from a lesson card's tile.
 *
 * Plays through the shared `VideoPlayerContainer` (via `VideoPreview`), never
 * the learner lesson page's player container: only that one records
 * `videos_progress`, so an admin previewing from the board writes nothing
 * against their own account. (Not named here by identifier: a static guard,
 * admin-preview-records-no-progress.test.ts, forbids the name in this file.)
 *
 * "Frameless" means no titlebar and no panel chrome, NOT no way out: the
 * dialog still carries a name for screen readers, still closes on Escape and
 * backdrop click, and still shows a visible close control. A dialog whose only
 * exit is a key you have to already know is a trap.
 */
export const LessonVideoModalContainer = ({
  modules,
}: {
  /**
   * The editor's narrower module type, so this modal serves BOTH boards. It
   * only ever looks a lesson up by id and reads its name — never
   * `videoProvider`/`videoRef`, which the org editor's payload omits and
   * which playback resolves server-side from the lesson id anyway. A full
   * `BoardModule[]` still satisfies it.
   */
  modules: EditorBoardModule[];
}) => {
  const [play, setPlay] = useAtom(playLessonAtom);
  const lesson =
    modules.flatMap((m) => m.lessons).find((l) => l.id === play?.lessonId) ??
    null;

  // Only resolves while open. Left enabled, this would fire a provider call —
  // an HTTP round trip per Synthesia lesson — for every card on the board.
  // Resolved for the lesson IN the course the tile named — never one picked
  // from `modules`, which on the org editor spans every course on the rail.
  // Per-lesson preview language, shared with the config dialog's preview of
  // the same lesson. Read with a stable fallback id while closed: hooks
  // cannot be skipped, and lesson 0 is never a real lesson.
  const [lang, setLang] = useAtom(
    adminPreviewLangAtomFamily(play?.lessonId ?? 0),
  );
  const playback = useLessonVideoPlayback(
    play === null ? null : { ...play, lang },
    play !== null,
  );
  const state = computeVideoModalState({
    // Placeholder data counts as arrived: mid language switch the new key
    // has not fetched, and treating that as "loading" would unmount the
    // player — losing the resume point the placeholder exists to keep.
    isFetched: playback.isFetched || playback.isPlaceholderData,
    isError: playback.isError,
    errorMessage: playback.error?.message ?? null,
    data: playback.data,
  });

  return (
    <Dialog.Root
      open={play !== null}
      onOpenChange={(open) => {
        if (!open) setPlay(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup className="dialog-popup -translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[min(56rem,90vw)] focus:outline-none">
          {/* Named for screen readers even though nothing is drawn: a dialog
              with no accessible name announces as an unlabelled group. */}
          <Dialog.Title className="sr-only">
            {lesson ? `${lesson.name} video preview` : 'Video preview'}
          </Dialog.Title>

          <Dialog.Close
            aria-label="Close video preview"
            className="-inset-bs-10 absolute end-0 rounded p-1.5 text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>

          {/*
            Every non-playing outcome says which one it is. `VideoPreview`'s
            own fallback is a bare video icon, which reads identically whether
            the request is in flight, the course has no provider credentials,
            or the provider says the video failed — leaving an admin with a
            grey box and no next step.
          */}
          {state.kind === 'ready' ? (
            // No `onPlaybackFailed`: the board has no dead-key notice, and
            // the player's own error overlay already says playback failed.
            <VideoPreview
              key={play?.lessonId}
              playback={state.playback}
              onLanguageChange={(code) => {
                if (isVideoLang(code)) setLang(code);
              }}
              onSourceExpired={() => void playback.refetch()}
            />
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-gray-3 px-6 text-center">
              <Video className="h-10 w-10 text-gray-8" aria-hidden="true" />
              {/* biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics (same call as lesson-no-video.tsx) */}
              <p
                className={
                  state.kind === 'error' || state.kind === 'failed'
                    ? 'text-error-text text-sm'
                    : 'text-secondary text-sm'
                }
                // Announced rather than silently swapped: the modal can move
                // from loading to any of these while the admin is looking at it.
                role="status"
              >
                {MESSAGES[state.kind]}
              </p>
              {state.kind === 'error' && (
                <p className="text-tertiary text-xs">{state.message}</p>
              )}
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
