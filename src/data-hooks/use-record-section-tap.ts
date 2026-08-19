import { useMutation } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';
import { extractPromotion, pendingPromotionAtom } from '#/atoms/promotion';
import {
  isTrackedLessonSection,
  type TrackedLessonSection,
} from '#/lib/lesson-visit-section';
import { saveJson } from './save-json';

export interface RecordSectionTapInput {
  lessonSlug: string;
  section: TrackedLessonSection;
}

/**
 * Record that the learner opened a material tab.
 *
 * A normal fetch, NOT `sendBeacon` — unlike the resume pointer, a tab tap
 * happens mid-session with the page very much alive, so there is no unload to
 * survive and a real request buys a status code and a retry. That matters
 * here: this is the only signal the sections component has, and a beacon's
 * failure is both invisible and unretryable.
 *
 * `/api/user/lesson-section` returns a `promotion` alongside the save, so
 * `parse` pulls it out and the pending-promotion atom gets set on success.
 */
export function useRecordSectionTap() {
  const setPromotion = useSetAtom(pendingPromotionAtom);

  return useMutation({
    mutationFn: (input: RecordSectionTapInput) =>
      saveJson({
        url: '/api/user/lesson-section',
        method: 'POST',
        body: input,
        parse: extractPromotion,
      }),
    retry: 1,
    onSuccess: (promotion) => {
      if (promotion) setPromotion(promotion);
    },
  });
}

/**
 * Whether a tab change should be written, or null to write nothing.
 *
 * Extracted so it can be tested without `renderHook`, which this repo's Vite
 * pipeline breaks for any hook calling a raw React hook (see
 * use-record-last-viewed.ts for the same split).
 *
 * `recorded` is the set of sections already written during this component's
 * life — re-selecting a tab must not re-fire, and neither must the quiz /
 * debrief tab, which is not a tracked section (D22).
 */
export function nextSectionTapWrite({
  recorded,
  section,
  enabled,
}: {
  recorded: ReadonlySet<string>;
  section: string;
  enabled: boolean;
}): TrackedLessonSection | null {
  if (!enabled) return null;
  if (!isTrackedLessonSection(section)) return null;
  if (recorded.has(section)) return null;
  return section;
}

/**
 * Returns a recorder for the active material tab, deduped per lesson.
 *
 * The dedupe set is keyed by lesson so navigating away and back records again
 * for a different lesson but not for the same one. `enabled` should be false
 * until the material has actually rendered — recording a tab the learner never
 * saw would inflate the ring for content that was never on screen.
 */
export function useSectionTapRecorder({
  lessonSlug,
  enabled,
}: {
  lessonSlug: string;
  enabled: boolean;
}) {
  const { mutate } = useRecordSectionTap();
  const recordedRef = useRef<{ slug: string; sections: Set<string> }>({
    slug: lessonSlug,
    sections: new Set(),
  });

  return useCallback(
    (section: string) => {
      if (recordedRef.current.slug !== lessonSlug) {
        recordedRef.current = { slug: lessonSlug, sections: new Set() };
      }
      const next = nextSectionTapWrite({
        recorded: recordedRef.current.sections,
        section,
        enabled,
      });
      if (next == null) return;
      recordedRef.current.sections.add(next);
      mutate({ lessonSlug, section: next });
    },
    [enabled, lessonSlug, mutate],
  );
}
