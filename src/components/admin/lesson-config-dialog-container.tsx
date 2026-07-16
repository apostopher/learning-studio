import { Accordion } from '@base-ui/react/accordion';
import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { ChevronDown, X } from 'lucide-react';
import type { CSSProperties } from 'react';

import { configureLessonIdAtom } from '@/atoms/admin';
import type { BoardLesson } from '@/lib/admin-schemas';

/**
 * Sidebar sections (accordion). Placeholder content for now — each panel will
 * hold the real controls for that part of the lesson.
 */
const SECTIONS: { value: string; title: string; hint: string }[] = [
  { value: 'video', title: 'Video', hint: 'Main video and additional clips.' },
  {
    value: 'availability',
    title: 'Availability',
    hint: 'Publish state and release rules.',
  },
  {
    value: 'access',
    title: 'Access',
    hint: 'Which subscriptions unlock this lesson.',
  },
  { value: 'debrief', title: 'Debrief', hint: 'Post-lesson debrief settings.' },
];

/** Big JIRA-style lesson configuration modal (fixed-width sidebar + main). */
export const LessonConfigDialogContainer = ({
  lessons,
}: {
  lessons: BoardLesson[];
}) => {
  const [lessonId, setLessonId] = useAtom(configureLessonIdAtom);
  const lesson = lessons.find((l) => l.id === lessonId) ?? null;

  return (
    <Dialog.Root
      open={lessonId !== null}
      onOpenChange={(open) => {
        if (!open) setLessonId(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup
          style={{ '--modal-dialog-width': '1280px' } as CSSProperties}
          className="fixed inset-0 z-40 m-auto grid h-[85vh] max-h-[calc(100vh-2rem)] w-[var(--modal-dialog-width)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl"
        >
          <div className="flex items-center justify-between gap-4 border-b border-gray-6 px-6 py-4">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Configure lesson
            </Dialog.Title>
            <Dialog.Close className="shrink-0 rounded-md p-1.5 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-e border-gray-6 bg-gray-1">
              <Accordion.Root className="flex flex-col">
                {SECTIONS.map((section) => (
                  <Accordion.Item
                    key={section.value}
                    value={section.value}
                    className="border-b border-gray-6"
                  >
                    <Accordion.Header>
                      <Accordion.Trigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-gray-12 transition-colors hover:bg-gray-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-9">
                        {section.title}
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-gray-10 transition-transform group-data-[panel-open]:rotate-180"
                          aria-hidden="true"
                        />
                      </Accordion.Trigger>
                    </Accordion.Header>
                    <Accordion.Panel className="px-4 pb-3 text-xs text-gray-10">
                      {section.hint}
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion.Root>
            </aside>

            <main className="flex min-h-0 flex-col gap-6 overflow-y-auto p-6">
              <h2 className="break-words text-2xl font-semibold text-gray-12">
                {lesson?.name ?? ''}
              </h2>
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-6 p-8 text-center text-sm text-gray-10">
                Select a section on the left to configure this lesson.
              </div>
            </main>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
