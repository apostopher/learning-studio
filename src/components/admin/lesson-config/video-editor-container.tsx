import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useLessonVideo } from '#/data-hooks/use-lesson-video';
import { useSetLessonVideo } from '#/data-hooks/use-set-lesson-video';
import type { ProviderId } from '#/lib/admin-schemas';
import { VIDEO_PROVIDERS } from '#/lib/video-providers';
import { detectVideoUrl } from '#/lib/video-providers/detect';
import { AlternateVideosContainer } from './alternate-videos-container';
import { useVersionGate, type VersionedLesson } from './use-version-gate';
import { VersionFieldContainer } from './version-field-container';
import { VideoUrlForm } from './video-url-form';

const videoUrlFormSchema = z.object({
  url: z.string().trim().min(1, 'Paste a video URL or ID'),
});
type VideoUrlFormValues = z.infer<typeof videoUrlFormSchema>;

/**
 * Every way of changing the working copy's video: its URL, its other
 * languages, and the version those changes are made at. Disciplines only.
 */
export const VideoEditorContainer = ({
  lesson,
  hasVideo,
  onDraft,
}: {
  lesson: VersionedLesson;
  hasVideo: boolean;
  /** The video just submitted, ahead of the refetch; null once refused. */
  onDraft: (draft: { provider: ProviderId; ref: string } | null) => void;
}) => {
  const setLessonVideo = useSetLessonVideo(lesson.id);
  const gate = useVersionGate(lesson);

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
    gate.attempt((version) => {
      onDraft(hit);
      setLessonVideo.mutate(
        { provider: hit.provider, ref: hit.ref, version },
        {
          // Back to pristine: the refetched current video then flows into the
          // field through `values` above, so it shows what was just saved.
          onSuccess: () => urlForm.reset(),
          onError: () => onDraft(null),
        },
      );
    });
  });

  return (
    <>
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
      {hasVideo && (
        <AlternateVideosContainer lessonId={lesson.id} versioned={lesson} />
      )}
      <VersionFieldContainer lesson={lesson} />
    </>
  );
};
