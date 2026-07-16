import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { Loader2, Pencil } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { videoDraftDetectionAtom, videoReplaceModeAtom } from '@/atoms/admin';
import { useCourseCredentials } from '@/data-hooks/use-course-credentials';
import { useLessonVideoPlayback } from '@/data-hooks/use-lesson-video-playback';
import { useSaveCredential } from '@/data-hooks/use-save-credential';
import { useSetLessonVideo } from '@/data-hooks/use-set-lesson-video';
import type { BoardLesson, SaveCredentialInput } from '@/lib/admin-schemas';
import { VIDEO_PROVIDERS } from '@/lib/video-providers';
import { detectVideoUrl } from '@/lib/video-providers/detect';
import {
  type CredentialField,
  ProviderCredentialForm,
} from './provider-credential-form';
import { ProviderHowTo } from './provider-how-to';
import { VideoPreview } from './video-preview';
import { VideoUrlForm } from './video-url-form';

const videoUrlFormSchema = z.object({
  url: z.string().trim().min(1, 'Paste a video URL or ID'),
});
type VideoUrlFormValues = z.infer<typeof videoUrlFormSchema>;

/** Superset of every provider's credential fields — RHF only registers the ones a given provider actually renders. */
interface CredentialFormValues {
  keyId?: string;
  privateKey?: string;
  apiKey?: string;
}

interface VideoSectionContainerProps {
  courseId: number;
  lesson: BoardLesson;
}

/**
 * Orchestrates the Video tab: URL entry → provider detection → persist the
 * ref on the lesson → (if the course has no credential for that provider)
 * how-to + credential form → resolved playback preview.
 *
 * State machine (no-video → detecting → needs-credentials → resolving →
 * playing | error) is derived from server data (the lesson's persisted
 * provider/ref, the course's configured credentials, and the playback
 * query) plus two small jotai atoms for the sliver of state that has no
 * server home yet: a not-yet-confirmed URL detection, and whether the
 * "replace video" form is showing over an already-configured video.
 */
export const VideoSectionContainer = ({
  courseId,
  lesson,
}: VideoSectionContainerProps) => {
  const [draftDetection, setDraftDetection] = useAtom(videoDraftDetectionAtom);
  const [replaceMode, setReplaceMode] = useAtom(videoReplaceModeAtom);

  const credentials = useCourseCredentials(courseId);
  const setLessonVideo = useSetLessonVideo(courseId);
  const saveCredential = useSaveCredential(courseId);

  // Reset the modal's transient state whenever it's pointed at a different
  // lesson. lesson.id isn't read in the body — it's the trigger, not a value.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lesson.id intentionally re-triggers the reset on lesson switch even though it isn't read in the body.
  useEffect(() => {
    setDraftDetection(null);
    setReplaceMode(false);
  }, [lesson.id, setDraftDetection, setReplaceMode]);

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

  const credentialForm = useForm<CredentialFormValues>({ mode: 'onSubmit' });
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed only on activeProvider — clears stale values from a previously-detected provider's fields when the provider selection changes; credentialForm's identity is stable across renders.
  useEffect(() => {
    credentialForm.reset();
  }, [activeProvider]);

  const handleCredentialSubmit = credentialForm.handleSubmit((values) => {
    if (!activeProvider) return;
    // Credential fields differ per provider, so the schema is chosen at
    // runtime — there's no single static type to hand to zodResolver here.
    // Validate manually with the provider's own client-safe schema instead.
    const parsed =
      VIDEO_PROVIDERS[activeProvider].credentialSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          credentialForm.setError(field as keyof CredentialFormValues, {
            message: issue.message,
          });
        }
      }
      return;
    }
    saveCredential.mutate(
      {
        provider: activeProvider,
        ...(parsed.data as CredentialFormValues),
      } as SaveCredentialInput,
      { onSuccess: () => credentialForm.reset() },
    );
  });

  const credentialFields: CredentialField[] = useMemo(() => {
    if (activeProvider === 'mux') {
      return [
        {
          name: 'keyId',
          label: 'Signing key ID',
          type: 'text',
          register: credentialForm.register('keyId'),
          error: credentialForm.formState.errors.keyId?.message,
        },
        {
          name: 'privateKey',
          label: 'Signing key (private, Base64)',
          type: 'password',
          register: credentialForm.register('privateKey'),
          error: credentialForm.formState.errors.privateKey?.message,
        },
      ];
    }
    if (activeProvider === 'synthesia') {
      return [
        {
          name: 'apiKey',
          label: 'API key',
          type: 'password',
          register: credentialForm.register('apiKey'),
          error: credentialForm.formState.errors.apiKey?.message,
        },
      ];
    }
    return [];
  }, [activeProvider, credentialForm]);

  const showUrlForm = !hasVideo || replaceMode;

  return (
    <div className="flex flex-col gap-6">
      {hasVideo && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-gray-11 text-sm">
              Current video:{' '}
              <span className="font-medium text-gray-12">
                {activeProvider ? VIDEO_PROVIDERS[activeProvider].label : ''}
              </span>
            </p>
            {!replaceMode && (
              <button
                type="button"
                onClick={() => setReplaceMode(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-gray-11 text-sm transition-colors hover:bg-gray-4 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Replace video
              </button>
            )}
          </div>

          {isProviderConfigured ? (
            <>
              <VideoPreview playback={playback.data ?? null} />
              {playback.isLoading && (
                <p className="flex items-center gap-1.5 text-gray-10 text-sm">
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  Resolving playback…
                </p>
              )}
              {playback.isError && (
                <p role="alert" className="text-red-11 text-sm">
                  Couldn't resolve playback: {playback.error.message}
                </p>
              )}
            </>
          ) : (
            activeProvider && (
              <div className="flex flex-col gap-4">
                <p className="text-gray-11 text-sm">
                  Connect {VIDEO_PROVIDERS[activeProvider].label} for this
                  course to preview and serve this video.
                </p>
                <ProviderHowTo provider={activeProvider} />
                <ProviderCredentialForm
                  fields={credentialFields}
                  onSubmit={handleCredentialSubmit}
                  serverError={saveCredential.error?.message}
                  isPending={saveCredential.isPending}
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
