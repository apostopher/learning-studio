export const LessonEmpty = () => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <div className="lesson-empty" role="status">
    <p>Pick a lesson from the sidebar to begin.</p>
  </div>
);
