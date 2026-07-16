import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import type { CSSProperties } from 'react';

import { configureLessonIdAtom } from '@/atoms/admin';
import type { BoardLesson } from '@/lib/admin-schemas';

/**
 * Sidebar sections. Each is a vertical tab whose content renders in the main
 * panel. Placeholder content for now — each panel will hold the real controls.
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

/** Big JIRA-style lesson configuration modal (fixed-width tab sidebar + main). */
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
            <Dialog.Title className="font-semibold text-gray-12 text-lg">
              Configure lesson
            </Dialog.Title>
            <Dialog.Close className="shrink-0 rounded-md p-1.5 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <Tabs.Root
            defaultValue={SECTIONS[0].value}
            orientation="vertical"
            className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)]"
          >
            <Tabs.List className="flex min-h-0 flex-col overflow-y-auto border-gray-6 border-e bg-gray-1">
              {SECTIONS.map((section) => (
                <Tabs.Tab
                  key={section.value}
                  value={section.value}
                  className="border-gray-6 border-b px-4 py-3 text-left font-medium text-gray-11 text-sm transition-colors hover:bg-gray-3 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-9 aria-selected:bg-gray-3 aria-selected:text-gray-12"
                >
                  {section.title}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            <main className="flex min-h-0 flex-col gap-6 overflow-y-auto p-6">
              <h2 className="break-words font-semibold text-2xl text-gray-12">
                {lesson?.name ?? ''}
              </h2>
              {SECTIONS.map((section) => (
                <Tabs.Panel
                  key={section.value}
                  value={section.value}
                  className="flex flex-1 items-center justify-center rounded-lg border border-gray-6 border-dashed p-8 text-center text-gray-10 text-sm"
                >
                  {section.hint}
                </Tabs.Panel>
              ))}
            </main>
          </Tabs.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
