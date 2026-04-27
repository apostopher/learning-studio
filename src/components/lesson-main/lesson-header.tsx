export type LessonHeaderState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'title'; name: string };

type LessonHeaderProps = {
  state: LessonHeaderState;
};

export const LessonHeader = ({ state }: LessonHeaderProps) => {
  if (state.kind === 'idle') return null;
  if (state.kind === 'loading') {
    return (
      // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; aria-label gives SRs the loading announcement
      <div
        className="lesson-header lesson-header--loading"
        role="status"
        aria-busy="true"
        aria-label="Loading lesson"
      >
        <div className="lesson-header__skeleton" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="lesson-header">
      <h1 className="lesson-header__title">{state.name}</h1>
    </div>
  );
};
