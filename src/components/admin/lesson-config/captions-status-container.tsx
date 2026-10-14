import { useLessonCaptions } from '#/data-hooks/use-lesson-captions';
import { useRequestLessonCaptions } from '#/data-hooks/use-request-lesson-captions';
import { labelForLang, type VideoLang } from '#/lib/video-languages';
import { CaptionsStatus } from './captions-status';

export function CaptionsStatusContainer({
  lessonId,
  courseId,
  lang,
}: {
  lessonId: number;
  courseId: number;
  lang: VideoLang;
}) {
  const captions = useLessonCaptions({ lessonId, courseId, lang });
  const request = useRequestLessonCaptions();
  if (!captions.data) return null;
  // The mutation is shared across languages; only show its state for this one.
  const isThisLang = request.variables?.lang === lang;
  return (
    <CaptionsStatus
      status={captions.data.status}
      languageLabel={labelForLang(captions.data.lang)}
      error={captions.data.error}
      onRequest={() => request.mutate({ lessonId, courseId, lang })}
      isRequesting={isThisLang && request.isPending}
      requestError={
        isThisLang && request.isError ? request.error.message : null
      }
    />
  );
}
