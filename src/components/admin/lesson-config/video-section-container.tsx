import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { Loader2, Pencil, RotateCcw } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  videoDraftDetectionAtom,
  videoPlaybackForbiddenAtom,
  videoReplaceModeAtom,
} from '#/atoms/admin';
import { useCourseCredentials } from '#/data-hooks/use-course-credentials';
import { useLessonVideoPlayback } from '#/data-hooks/use-lesson-video-playback';
import { useSetLessonVideo } from '#/data-hooks/use-set-lesson-video';
import type { BoardLesson } from '#/lib/admin-schemas';
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

interface VideoSectionContainerProps {
  courseId: number;
  lesson: BoardLesson;
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
}: VideoSectionContainerProps) => {
  const [draftDetection, setDraftDetection] = useAtom(videoDraftDetectionAtom);
  const [replaceMode, setReplaceMode] = useAtom(videoReplaceModeAtom);
  const [playbackForbidden, setPlaybackForbidden] = useAtom(
    videoPlaybackForbiddenAtom,
  );

  const credentials = useCourseCredentials(courseId);
  const setLessonVideo = useSetLessonVideo(courseId);

  // Reset the modal's transient state whenever it's pointed at a different
  // lesson. lesson.id isn't read in the body — it's the trigger, not a value.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lesson.id intentionally re-triggers the reset on lesson switch even though it isn't read in the body.
  useEffect(() => {
    setDraftDetection(null);
    setReplaceMode(false);
    setPlaybackForbidden(false);
  }, [lesson.id, setDraftDetection, setReplaceMode, setPlaybackForbidden]);

  // Once the board confirms the draft (refetches with matching provider/ref),
  // drop the local draft so the lesson's own fields become the source of truth.
  useEffect(() => {
    if (
      draftDetection &&
      lesson.videoProvider === draftDetection.provider &&
      lesson.videoRef === draftDetection.ref
    ) {
      setDraftDetection(null);
    }
  }, [
    lesson.videoProvider,
    lesson.videoRef,
    draftDetection,
    setDraftDetection,
  ]);

  const activeProvider = draftDetection?.provider ?? lesson.videoProvider;
  const activeRef = draftDetection?.ref ?? lesson.videoRef;
  const hasVideo = activeProvider !== null && activeRef !== null;

  const isProviderConfigured = useMemo(
    () =>
      activeProvider !== null &&
      (credentials.data?.some(
        (c) => c.provider === activeProvider && c.configured,
      ) ??
        false),
    [credentials.data, activeProvider],
  );

  const playbackEnabled = hasVideo && isProviderConfigured;
  const playback = useLessonVideoPlayback(lesson.id, playbackEnabled);
  const previewState = computeVideoPreviewState(playback.data);

  const urlForm = useForm<VideoUrlFormValues>({
    resolver: zodResolver(videoUrlFormSchema),
    mode: 'onSubmit',
    defaultValues: { url: '' },
  });
  const urlValue = urlForm.watch('url');
  const detected = useMemo(
    () => (urlValue.trim() ? detectVideoUrl(urlValue) : null),
    [urlValue],
  );

  const handleUrlSubmit = urlForm.handleSubmit((values) => {
    const hit = detectVideoUrl(values.url);
    if (!hit) return;
    setDraftDetection(hit);
    setLessonVideo.mutate(
      { lessonId: lesson.id, provider: hit.provider, ref: hit.ref },
      {
        onSuccess: () => {
          urlForm.reset({ url: '' });
          setReplaceMode(false);
        },
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

  const showUrlForm = !hasVideo || replaceMode;

  return (
    <div className="flex flex-col gap-6">
      {hasVideo && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-secondary text-sm">
              Current video:{' '}
              <span className="font-medium text-primary">
                {activeProvider ? VIDEO_PROVIDERS[activeProvider].label : ''}
              </span>
            </p>
            {!replaceMode && (
              <button
                type="button"
                onClick={() => setReplaceMode(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Replace video
              </button>
            )}
          </div>

          {canPlay ? (
            <>
              <VideoPreview
                playback={
                  previewState.kind === 'ready' ? previewState.playback : null
                }
                onForbidden={() => setPlaybackForbidden(true)}
              />
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
                "failed"). VideoPreview already shows its blank placeholder
                for both — this is the honest label plus a way to check
                again without leaving the page. Branches on `previewState`
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
                  minus the card chrome — the heading above already names the
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
          )}
        </div>
      )}

      {showUrlForm && (
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
          onCancel={hasVideo ? () => setReplaceMode(false) : undefined}
        />
      )}
    </div>
  );
};
