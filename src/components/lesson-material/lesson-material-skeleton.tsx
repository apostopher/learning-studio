const TAB_COUNT = 6;

export const LessonMaterialSkeleton = () => (
  <div
    className="flex flex-col gap-4"
    aria-busy="true"
    aria-label="Loading lesson material"
  >
    <div
      className="flex gap-1 border-b border-gray-6 px-1"
      aria-hidden="true"
    >
      {Array.from({ length: TAB_COUNT }, (_, index) => (
        <div
          key={index}
          className="lesson-material-skeleton-tab h-9"
          style={{ inlineSize: `${64 + ((index * 13) % 36)}px` }}
        />
      ))}
    </div>
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div className="lesson-material-skeleton-line h-4 w-11/12" />
      <div className="lesson-material-skeleton-line h-4 w-10/12" />
      <div className="lesson-material-skeleton-line h-4 w-9/12" />
      <div className="lesson-material-skeleton-line h-4 w-8/12" />
      <div className="lesson-material-skeleton-line h-4 w-7/12" />
    </div>
  </div>
);
