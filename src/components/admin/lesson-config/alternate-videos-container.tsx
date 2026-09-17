import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useLessonAlternateVideos } from '#/data-hooks/use-lesson-alternate-videos';
import { useRemoveLessonAlternateVideo } from '#/data-hooks/use-remove-lesson-alternate-video';
import { useSetLessonAlternateVideo } from '#/data-hooks/use-set-lesson-alternate-video';
import {
  type AlternateLang,
  alternateLangSchema,
  availableLanguages,
  labelForLang,
} from '#/lib/video-languages';
import { VIDEO_PROVIDERS } from '#/lib/video-providers';
import { detectVideoUrl } from '#/lib/video-providers/detect';
import { AlternateVideoForm } from './alternate-video-form';
import { AlternateVideosList } from './alternate-videos-list';

const formSchema = z.object({
  lang: alternateLangSchema,
  url: z.string().trim().min(1, 'Paste a video URL or ID'),
});
type FormValues = z.infer<typeof formSchema>;

interface AlternateVideosContainerProps {
  lessonId: number;
}

/**
 * The Video tab's "Other languages": the attached list and an add form.
 * Each add/remove saves immediately, like the primary URL field, and the
 * list refetches. The chosen language lives in the form (react-hook-form),
 * not an atom — it is the form's own draft and nothing else reads it.
 */
export const AlternateVideosContainer = ({
  lessonId,
}: AlternateVideosContainerProps) => {
  const alternates = useLessonAlternateVideos(lessonId, true);
  const setAlternate = useSetLessonAlternateVideo();
  const removeAlternate = useRemoveLessonAlternateVideo();

  const used = (alternates.data ?? []).map((a) => a.lang);
  const options = availableLanguages(used).map((code) => ({
    code,
    label: labelForLang(code),
  }));

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onSubmit',
    defaultValues: { lang: options[0]?.code ?? 'fr', url: '' },
  });
  const rawLang = form.watch('lang');
  // The default may have been taken by the time the list arrives; fall to
  // the first still-available code without an effect.
  const lang: AlternateLang | null =
    options.length === 0
      ? null
      : options.some((o) => o.code === rawLang)
        ? rawLang
        : options[0].code;
  const urlValue = form.watch('url');
  const detected = urlValue.trim() ? detectVideoUrl(urlValue) : null;

  const onSubmit = form.handleSubmit((values) => {
    const hit = detectVideoUrl(values.url);
    if (!hit || lang === null) return;
    setAlternate.mutate(
      { lessonId, lang, provider: hit.provider, ref: hit.ref },
      {
        onSuccess: () =>
          form.reset({
            lang: options.find((o) => o.code !== lang)?.code ?? lang,
            url: '',
          }),
      },
    );
  });

  const removingLang = removeAlternate.isPending
    ? removeAlternate.variables?.lang
    : undefined;
  // A failed remove belongs beside the list it concerns, named by language —
  // not under the add form, which is gone once every language is attached.
  const removeFailure =
    removeAlternate.error && removeAlternate.variables
      ? `Couldn't remove ${labelForLang(removeAlternate.variables.lang)}: ${removeAlternate.error.message}`
      : null;

  return (
    <section
      aria-labelledby="alternate-videos-heading"
      className="flex flex-col gap-3"
    >
      <h3
        id="alternate-videos-heading"
        className="font-medium text-primary text-sm"
      >
        Other languages
      </h3>
      {alternates.isError ? (
        <p role="alert" className="text-error-text text-sm">
          Couldn't load languages: {alternates.error.message}
        </p>
      ) : alternates.isPending ? (
        // Not the empty state: until the list arrives we cannot say which
        // languages are free, so neither the "none yet" line nor the form
        // shows — the form would otherwise offer a code already attached.
        <p className="flex items-center gap-1.5 text-tertiary text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading languages…
        </p>
      ) : (
        <>
          <AlternateVideosList
            rows={alternates.data.map((a) => ({
              lang: a.lang,
              label: labelForLang(a.lang),
              providerLabel: VIDEO_PROVIDERS[a.provider].label,
              removing: removingLang === a.lang,
            }))}
            onRemove={(l) => removeAlternate.mutate({ lessonId, lang: l })}
          />
          {removeFailure && (
            <p role="alert" className="text-error-text text-sm">
              {removeFailure}
            </p>
          )}
          <AlternateVideoForm
            onSubmit={onSubmit}
            lang={lang}
            langOptions={options}
            onLangChange={(code) => form.setValue('lang', code)}
            registerUrl={form.register('url')}
            urlError={form.formState.errors.url?.message}
            detectedLabel={
              detected ? VIDEO_PROVIDERS[detected.provider].label : null
            }
            showUnsupported={urlValue.trim().length > 0 && !detected}
            isPending={setAlternate.isPending}
            serverError={setAlternate.error?.message}
          />
        </>
      )}
    </section>
  );
};
