// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

// A src component with hooks needs one React: the CJS shim, as in
// question-card.test.tsx.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('../parts/debrief-panel-container', () => ({
  DebriefPanelContainer: () => <p>debrief panel</p>,
}));
vi.mock('../parts/quiz/lesson-quiz-container', () => ({
  LessonQuizContainer: () => null,
}));

import { LessonMaterialView } from '../lesson-material';

type Props = Parameters<typeof LessonMaterialView>[0];

const material = {
  lessonSlug: 'l1',
  text: 'body',
  keyPoints: [],
  quiz: [],
  proTips: [],
  links: [],
  assignments: [],
  jobOfTheDay: null,
  testThis: [],
  extraTab: 'testThis',
} as unknown as Props['material'];

const facts = (passed: boolean): Props['debriefFacts'] => ({
  bearing: true,
  clockStartAt: '2020-01-01T00:00:00.000Z',
  passed,
  lastFinishedAt: null,
  hasOpenAttempt: true,
  mastery: null,
});

const store = createStore();
const view = (debriefFacts: Props['debriefFacts']) => (
  <Provider store={store}>
    <LessonMaterialView
      material={material}
      courseSlug="c1"
      transcriptUsable={false}
      readOnly={false}
      debriefFacts={debriefFacts}
    />
  </Provider>
);

describe('LessonMaterialView', () => {
  it('keeps a Debrief tab opened by default on screen when the answer that passes it re-reads progress', () => {
    // Progress still loading, then the debrief is due: it opens by default.
    const { rerender } = render(view(undefined));
    expect(screen.queryByText('debrief panel')).toBeNull();
    rerender(view(facts(false)));
    expect(screen.queryByText('debrief panel')).not.toBeNull();

    // Set 1 passed: the ring is now 'passed', so Key Points is the default.
    rerender(view(facts(true)));
    expect(screen.queryByText('debrief panel')).not.toBeNull();
  });
});
