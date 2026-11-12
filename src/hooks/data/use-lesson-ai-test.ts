import { useAtom } from 'jotai';
import { activeTabAtom } from '#/atoms/lesson-ai-test';

// The debrief's requests (start, answer, draft) live in
// `#/data-hooks/use-debrief-attempt`. What is left here is the lesson page's
// tab selection.

export const useActiveTab = () => useAtom(activeTabAtom);
