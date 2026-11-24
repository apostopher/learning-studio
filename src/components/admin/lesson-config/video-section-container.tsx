import { useAtom } from 'jotai';
import { Loader2, RotateCcw } from 'lucide-react';

import {
  adminPreviewLangAtomFamily,
  videoDraftDetectionAtom,
  videoPlaybackForbiddenLessonIdAtom,
} from '#/atoms/admin';
import { useCourseCredentials } from '#/data-hooks/use-course-credentials';
import { useLessonVideoPlayback } from '#/data-hooks/use-lesson-video-playback';
import type { BoardLesson, ProviderId } from '#/lib/admin-schemas';
import {
  isVideoLang,
  labelForLang,
  PRIMARY_VIDEO_LANG,
} from '#/lib/video-languages';
import { VIDEO_PROVIDERS } from '#/lib/video-providers';
import { PlaybackError } from '#/lib/video-providers/errors';
import { CaptionsStatusContainer } from './captions-status-container';
import { computeVideoPreviewState } from './compute-video-preview-state';
import { CredentialFlowContainer } from './credential-flow-container';
import { PreviewLanguageFallback } from './preview-language-fallback';
import {
  type PreviewNotPlayableKind,
  previewLanguageNotice,
} from './preview-language-notice';
import type { VersionedLesson } from './use-version-gate';
import { VideoEditorContainer } from './video-editor-container';
import { VideoPreview } from './video-preview';

/**
 * Only what this section reads. Never a `videoRef`: the library payload
 * deliberately omits it (a bare Mux ref is streamable).
 */
export type VideoSectionLesson = Pick<BoardLesson, 'id' | 'videoProvider'>;

type VideoSectionContainerProps = { lesson: VideoSectionLesson } & (
  | {
      /** Disciplines: the working copy, played and edited. */
      source: 'discipline';
      readOnly?: false;
      /**
       * The course whose provider credentials sign the playback preview, or
       * `null` for a lesson placed in no course yet. The video REF is a
       * property of the lesson and saves either way; only the preview and the
       * credential hand-off need a course.
       */
      courseId: number | null;
      /** The working copy, with the version its edits are gated by. */
      versioned: VersionedLesson;
      /**
       * One quiet line under the preview, for when the course above was chosen
       * for the lesson rather than by the admin — the library dialog signs with
       * the first course teaching the lesson and says so.
       */
      previewNote?: string;
    }
  | {
      /** A course's dialog: the version it is on, only played. */
      source: 'course';
      readOnly: true;
      courseId: number;
      versioned?: undefined;
      previewNote?: undefined;
    }
);

/**
 * A lesson's video: the resolved playback preview or, if the course has no
 * credential for its provider, a hand-off to `CredentialFlowContainer`. In
 * Disciplines, `VideoEditorContainer` beside it changes the video; a course
 * plays the version it is on and changes nothing.
 *
 * The *video* side is derived from server data (the lesson's persisted provider
 * and the playback query) plus two jotai atoms for the sliver with no server
 * home yet: a not-yet-confirmed URL detection, and a preview that could not be
 * played.
 *
 * The *credential* side is not derived here — `credentialMachine` owns it, via
 * the same container the course-edit dialog uses. This file only decides
 * whether a credential is needed at all.
 */
export const VideoSectionContainer = ({
  courseId,
  source,
  readOnly = false,
  lesson,
  versioned,
  previewNote,
}: VideoSectionContainerProps) => {
  const [storedDraft, setStoredDraft] = useAtom(videoDraftDetectionAtom);
  const [playbackForbiddenLessonId, setPlaybackForbiddenLessonId] = useAtom(
    videoPlaybackForbiddenLessonIdAtom,
  );

  // Derived, not reset by an effect. Each of these atoms carries the lesson it
  // belongs to, so a value left behind by the previously configured lesson is
  // simply not ours — see the atoms' own comment, and
  // docs/use-effect-rules.md on resetting state when a prop changes.
  const playbackForbidden = playbackForbiddenLessonId === lesson.id;
  const setPlaybackForbidden = (next: boolean) =>
    setPlaybackForbiddenLessonId(next ? lesson.id : null);

  // A draft is of the working copy, so never of what a course plays.
  const ownDraft =
    !readOnly && storedDraft?.lessonId === lesson.id ? storedDraft : null;
  /**
   * The draft, but only while it is still ahead of the lesson record.
   *
   * Once the library refetches and the lesson carries the same provider, the
   * record becomes the source of truth. That used to be a second effect
   * clearing the atom on the match; as a derivation it cannot race the
   * refetch, and there is no window where both are live and disagreeing.
   */
  const draftDetection =
    ownDraft && lesson.videoProvider !== ownDraft.provider ? ownDraft : null;
  const setDraftDetection = (
    next: { provider: ProviderId; ref: string } | null,
  ) => setStoredDraft(next ? { lessonId: lesson.id, ...next } : null);

  const credentials = useCourseCredentials(courseId);

  const activeProvider = draftDetection?.provider ?? lesson.videoProvider;
  // A provider means "has a video": the ref exists, it just isn't sent.
  const hasVideo = activeProvider !== null;

  // Plain derivations, not `useMemo`: the compiler memoises these, and a
  // manual `useMemo` beside `useForm` trips React's dispatcher under vitest.
  const isProviderConfigured =
    activeProvider !== null &&
    (credentials.data?.some(
      (c) => c.provider === activeProvider && c.configured,
    ) ??
      false);

  // The admin's own preview language for this lesson — never the learner's
  // video-language preference, so previewing a translation leaves their own
  // lessons in the language they chose.
  const [previewLang, setPreviewLang] = useAtom(
    adminPreviewLangAtomFamily(lesson.id),
  );
  const playbackEnabled = courseId !== null && hasVideo && isProviderConfigured;
  const playback = useLessonVideoPlayback(
    courseId === null
      ? null
      : { lessonId: lesson.id, courseId, source, lang: previewLang },
    playbackEnabled,
  );
  const previewState = computeVideoPreviewState(playback.data);

  // Two independent ways a stored key turns out to be dead, because the
  // providers fail in different places: Synthesia refuses our server's API call
  // (coded 502 → PlaybackError), while Mux accepts the locally-signed JWT and
  // only its edge refuses the browser's manifest request — which reaches us as
  // the shared player's `onPlaybackFailed`, once its automatic retries (each
  // re-resolving a fresh signed URL) are used up.
  const serverRejection =
    playback.error instanceof PlaybackError &&
    playback.error.code === 'PROVIDER_AUTH_REJECTED'
      ? playback.error.message
      : null;
  const keyRejection =
    serverRejection ??
    (playbackForbidden
      ? 'The provider refused the signed playback request, which means the stored key is no longer valid.'
      : null);

  // A previewed translation with nothing to play unmounts the player — and
  // with it the only language menu — so the way back is offered here.
  const notPlayableKind: PreviewNotPlayableKind | null = playback.isError
    ? 'error'
    : previewState.kind === 'rendering' || previewState.kind === 'failed'
      ? previewState.kind
      : null;
  const languageNotice =
    notPlayableKind === null
      ? null
      : previewLanguageNotice(
          previewLang,
          notPlayableKind,
          playback.error?.message,
        );
  const languageFallback = languageNotice && (
    <PreviewLanguageFallback
      {...languageNotice}
      onBack={() => setPreviewLang(PRIMARY_VIDEO_LANG)}
    >
      {(previewState.kind === 'rendering' || previewState.kind === 'failed') &&
        !playback.isError && (
          <button
            type="button"
            onClick={() => playback.refetch()}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {previewState.kind === 'rendering' ? 'Check again' : 'Retry'}
          </button>
        )}
    </PreviewLanguageFallback>
  );

  // A dead key is still "configured" as far as the credentials query knows, so
  // this has to override it — otherwise we'd render a player that cannot play.
  const canPlay = isProviderConfigured && keyRejection === null;

  /**
   * Two equal columns: the thumbnail on the left, large enough to actually
   * recognise the video; on the right, every way of setting this lesson's
   * video in one stack — empty where the video is only played. There is no
   * "Replace" toggle to find first — pasting a new URL IS replacing. Status
   * lines (rendering, failed, dead key, connect the provider) sit under both
   * columns at full width so their controls have room. Stacks to one column
   * on a narrow screen.
   */
  const thumbnailPlayback =
    courseId !== null && canPlay && previewState.kind === 'ready'
      ? previewState.playback
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
        <div className="min-w-0">
          <VideoPreview
            key={lesson.id}
            playback={thumbnailPlayback}
            onLanguageChange={(code) => {
              if (isVideoLang(code)) setPreviewLang(code);
            }}
            onSourceExpired={() => playback.refetch()}
            onPlaybackFailed={() => setPlaybackForbidden(true)}
          />
          {hasVideo && activeProvider && (
            <p className="mbs-1.5 text-tertiary text-xs">
              Current video:{' '}
              <span className="font-medium text-secondary">
                {VIDEO_PROVIDERS[activeProvider].label}
              </span>
            </p>
          )}
        </div>

        {versioned && (
          // `@container`: the alternates' language/URL row lays itself out by
          // this column's width, not the viewport's — at half a modal, a
          // side-by-side row would crush the URL field.
          <div className="@container flex min-w-0 flex-col gap-6">
            <VideoEditorContainer
              lesson={versioned}
              hasVideo={hasVideo}
              onDraft={setDraftDetection}
            />
          </div>
        )}
      </div>

      {hasVideo &&
        (courseId === null ? (
          <p className="text-secondary text-sm">
            Preview and provider connection appear once this lesson is placed in
            a course.
          </p>
        ) : canPlay ? (
          <>
            {previewNote && (
              <p className="text-tertiary text-xs">{previewNote}</p>
            )}
            {playback.isLoading && (
              <p className="flex items-center gap-1.5 text-tertiary text-sm">
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
                Resolving playback…
              </p>
            )}
            {/*
              A language switch: the hook keeps serving the previous
              language as placeholder data (so `isLoading` stays false and
              the player above stays mounted, ready to resume at the same
              spot) — which leaves saying what is being waited for to here.
            */}
            {playback.isPlaceholderData && (
              <output className="flex items-center gap-1.5 text-tertiary text-sm">
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
                Loading {labelForLang(previewLang)}…
              </output>
            )}
            {languageFallback}
            {!readOnly && (
              <CaptionsStatusContainer
                lessonId={lesson.id}
                courseId={courseId}
                lang={previewLang}
              />
            )}
            {!languageNotice && playback.isError && (
              <p role="alert" className="text-error-text text-sm">
                Couldn't resolve playback: {playback.error.message}
              </p>
            )}
            {/*
              Neither "rendering" nor "failed" is an error: the request
              succeeded, the video just isn't playable yet (or ever, for
              "failed"). The thumbnail already shows its blank placeholder
              for both — this is the honest label plus a way to check again
              without leaving the page. Branches on `previewState`
              (computeVideoPreviewState), not on `playback.data` directly,
              so the decision has one home a test can reach.
            */}
            {!languageNotice && previewState.kind === 'rendering' && (
              <div className="flex items-center justify-between gap-3">
                <output className="text-secondary text-sm">
                  This video is still rendering and isn't playable yet.
                </output>
                <button
                  type="button"
                  onClick={() => playback.refetch()}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Check again
                </button>
              </div>
            )}
            {!languageNotice && previewState.kind === 'failed' && (
              <div className="flex items-center justify-between gap-3">
                <p role="alert" className="text-error-text text-sm">
                  This video failed to render at the provider.
                </p>
                <button
                  type="button"
                  onClick={() => playback.refetch()}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              </div>
            )}
          </>
        ) : (
          activeProvider && (
            <div className="flex flex-col gap-4">
              {/* A refused alternate lands here too (its rejection is coded
                  like the primary's); the way back must not depend on it. */}
              {languageFallback}
              {keyRejection === null && (
                <p className="text-secondary text-sm">
                  Connect {VIDEO_PROVIDERS[activeProvider].label} for this
                  course to preview and serve this video.
                </p>
              )}
              {/*
                Same flow as the course dialog's Video integrations section,
                minus the card chrome — the line above already names the
                provider. Opens straight into the form: the video cannot play
                without a key.
              */}
              <CredentialFlowContainer
                courseId={courseId}
                provider={activeProvider}
                summary={credentials.data?.find(
                  (c) => c.provider === activeProvider,
                )}
                isLoadingCredentials={
                  credentials.isLoading || credentials.isError
                }
                openFormImmediately
                providerRejection={keyRejection}
              />
            </div>
          )
        ))}
    </div>
  );
};
