import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { Loader2, RotateCcw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  videoDraftDetectionAtom,
  videoPlaybackForbiddenLessonIdAtom,
} from '#/atoms/admin';
import { useCourseCredentials } from '#/data-hooks/use-course-credentials';
import { useLessonVideo } from '#/data-hooks/use-lesson-video';
import { useLessonVideoPlayback } from '#/data-hooks/use-lesson-video-playback';
import { useSetLessonVideo } from '#/data-hooks/use-set-lesson-video';
import type { BoardLesson, ProviderId } from '#/lib/admin-schemas';
import { VIDEO_PROVIDERS } from '#/lib/video-providers';
import { detectVideoUrl } from '#/lib/video-providers/detect';
import { PlaybackError } from '#/lib/video-providers/errors';
import { computeVideoPreviewState } from './compute-video-preview-state';
import { CredentialFlowContainer } from './credential-flow-container';
import { VideoPreview } from './video-preview';
import { VideoUrlForm } from './video-url-form';

const videoUrlFormSchema = z.object({
  url: z.string().trim().min(1, 'Paste a video URL or ID'),
});
type VideoUrlFormValues = z.infer<typeof videoUrlFormSchema>;

/**
 * Only what this section reads. `videoRef` is optional because the library
 * payload deliberately omits it (a bare Mux ref is streamable) while still
 * naming the provider; the ref is only ever compared against a draft here.
 */
export type VideoSectionLesson = Pick<BoardLesson, 'id' | 'videoProvider'> & {
  videoRef?: string | null;
};

interface VideoSectionContainerProps {
  /**
   * The course whose provider credentials sign the playback preview, or
   * `null` from the library's dialog for a lesson placed in no course yet.
   * The video REF is a property of the lesson and saves either way; only the
   * preview and the credential hand-off need a course.
   */
  courseId: number | null;
  lesson: VideoSectionLesson;
  /**
   * One quiet line under the preview, for when the course above was chosen
   * for the lesson rather than by the admin — the library dialog signs with
   * the first course teaching the lesson and says so.
   */
  previewNote?: string;
}

/**
 * Orchestrates the Video tab: URL entry → provider detection → persist the ref
 * on the lesson → (if the course has no credential for that provider) hand off
 * to `CredentialFlowContainer` → resolved playback preview.
 *
 * The *video* side is still derived from server data (the lesson's persisted
 * provider/ref and the playback query) plus two jotai atoms for the sliver with
 * no server home yet: a not-yet-confirmed URL detection, and whether the
 * "replace video" form is showing over an already-configured video.
 *
 * The *credential* side is not derived here — `credentialMachine` owns it, via
 * the same container the course-edit dialog uses. This file only decides
 * whether a credential is needed at all.
 */
export const VideoSectionContainer = ({
  courseId,
  lesson,
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

  const ownDraft = storedDraft?.lessonId === lesson.id ? storedDraft : null;
  /**
   * The draft, but only while it is still ahead of the lesson record.
   *
   * Once the board refetches and the lesson carries the same provider/ref, the
   * draft and the record agree and the record becomes the source of truth.
   * That used to be a second effect clearing the atom on the match; as a
   * derivation it cannot race the refetch, and there is no window where both
   * are live and disagreeing.
   */
  // A lesson that carries no `videoRef` (the library payload) is compared on
  // provider alone, so the draft still retires once the refetch agrees.
  const draftDetection =
    ownDraft &&
    (lesson.videoProvider !== ownDraft.provider ||
      (lesson.videoRef !== undefined && lesson.videoRef !== ownDraft.ref))
      ? ownDraft
      : null;
  const setDraftDetection = (
    next: { provider: ProviderId; ref: string } | null,
  ) => setStoredDraft(next ? { lessonId: lesson.id, ...next } : null);

  const credentials = useCourseCredentials(courseId);
  const setLessonVideo = useSetLessonVideo(courseId);

  const activeProvider = draftDetection?.provider ?? lesson.videoProvider;
  // A provider with no ref in hand (library payload) still means "has a
  // video": the ref exists on the lesson row, it just isn't sent.
  const hasVideo = activeProvider !== null;

  // Plain derivations, not `useMemo`: the compiler memoises these, and a
  // manual `useMemo` beside `useForm` trips React's dispatcher under vitest.
  const isProviderConfigured =
    activeProvider !== null &&
    (credentials.data?.some(
      (c) => c.provider === activeProvider && c.configured,
    ) ??
      false);

  const playbackEnabled = courseId !== null && hasVideo && isProviderConfigured;
  const playback = useLessonVideoPlayback(
    courseId === null ? null : { lessonId: lesson.id, courseId },
    playbackEnabled,
  );
  const previewState = computeVideoPreviewState(playback.data);

  // The current video's canonical URL, for the field's prefill: read per
  // lesson under the content guard (the library payload carries no ref).
  // Only asked for when there is a video to show.
  const currentVideo = useLessonVideo(lesson.id, hasVideo);
  const currentUrl =
    currentVideo.data?.provider && currentVideo.data.ref
      ? VIDEO_PROVIDERS[currentVideo.data.provider].toUrl(currentVideo.data.ref)
      : '';

  // Hydrated by react-hook-form's own `values`, not an effect: the field
  // fills when the current video arrives and again after a replace lands,
  // while `keepDirtyValues` leaves anything the admin has typed alone.
  const urlForm = useForm<VideoUrlFormValues>({
    resolver: zodResolver(videoUrlFormSchema),
    mode: 'onSubmit',
    defaultValues: { url: '' },
    values: { url: currentUrl },
    resetOptions: { keepDirtyValues: true },
  });
  const urlValue = urlForm.watch('url');
  const detected = urlValue.trim() ? detectVideoUrl(urlValue) : null;

  const handleUrlSubmit = urlForm.handleSubmit((values) => {
    const hit = detectVideoUrl(values.url);
    if (!hit) return;
    setDraftDetection(hit);
    setLessonVideo.mutate(
      { lessonId: lesson.id, provider: hit.provider, ref: hit.ref },
      {
        // Back to pristine: the refetched current video then flows into the
        // field through `values` above, so it shows what was just saved.
        onSuccess: () => urlForm.reset(),
        onError: () => setDraftDetection(null),
      },
    );
  });

  // Two independent ways a stored key turns out to be dead, because the
  // providers fail in different places: Synthesia refuses our server's API call
  // (coded 502 → PlaybackError), while Mux accepts the locally-signed JWT and
  // only its edge refuses the browser's manifest request (→ onForbidden).
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

  // A dead key is still "configured" as far as the credentials query knows, so
  // this has to override it — otherwise we'd render a player that cannot play.
  const canPlay = isProviderConfigured && keyRejection === null;

  /**
   * One compact row: the thumbnail on the left, the URL field on the right,
   * always. There is no "Replace" toggle to find first — pasting a new URL
   * IS replacing — and no full-width player: the admin came here to work on
   * the lesson's content, and a small preview is enough to confirm the right
   * video is attached. Status lines (rendering, failed, dead key, connect the
   * provider) sit under the row at full width so their controls have room.
   */
  const thumbnailPlayback =
    courseId !== null && canPlay && previewState.kind === 'ready'
      ? previewState.playback
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-full shrink-0 sm:w-44">
          <VideoPreview
            playback={thumbnailPlayback}
            onForbidden={() => setPlaybackForbidden(true)}
          />
          {hasVideo && activeProvider && (
            <p className="mt-1.5 text-tertiary text-xs">
              Current video:{' '}
              <span className="font-medium text-secondary">
                {VIDEO_PROVIDERS[activeProvider].label}
              </span>
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <VideoUrlForm
            onSubmit={handleUrlSubmit}
            registerUrl={urlForm.register('url')}
            urlError={urlForm.formState.errors.url?.message}
            detectedLabel={
              detected ? VIDEO_PROVIDERS[detected.provider].label : null
            }
            showUnsupported={urlValue.trim().length > 0 && !detected}
            isPending={setLessonVideo.isPending}
            serverError={setLessonVideo.error?.message}
            submitLabel={hasVideo ? 'Replace video' : 'Use this video'}
          />
        </div>
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
            {playback.isError && (
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
            {previewState.kind === 'rendering' && (
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
            {previewState.kind === 'failed' && (
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
              {keyRejection === null && (
                <p className="text-secondary text-sm">
                  Connect {VIDEO_PROVIDERS[activeProvider].label} for this
                  course to preview and serve this video.
                </p>
              )}
              {/*
                Same flow as the course dialog's Video integrations section,
                minus the card chrome — the line above already names the
                provider. Opens straight into the form: the admin got here by
                pasting a video that cannot play without a key.
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
