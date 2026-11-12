import { MaterialProse } from './material-prose';

type JobOfTheDayProps = {
  jobOfTheDay: string | null;
  /** Follows the course's label for the tab — see `closingTabEmptyText`. */
  emptyText: string;
};

export const JobOfTheDay = ({ jobOfTheDay, emptyText }: JobOfTheDayProps) => (
  <MaterialProse html={jobOfTheDay} emptyText={emptyText} />
);
