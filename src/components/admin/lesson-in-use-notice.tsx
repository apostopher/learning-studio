/** Why a lesson cannot be deleted, where it cannot: no confirmation to fill in. */
export const LessonInUseNotice = ({
  name,
  reason,
  onClose,
}: {
  name: string;
  /** Names the courses, or their number. */
  reason: string;
  onClose: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <p className="text-secondary text-sm">
      <span className="font-medium text-primary">{name}</span> cannot be deleted
      while a course shows it.
    </p>
    <p className="break-words text-primary text-sm">{reason}</p>
    <div className="mbs-2 flex items-center justify-end">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7"
      >
        Close
      </button>
    </div>
  </div>
);
