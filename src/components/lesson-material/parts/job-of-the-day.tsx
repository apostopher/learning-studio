import { MaterialProse } from './material-prose';

type JobOfTheDayProps = {
  jobOfTheDay: string | null;
};

export const JobOfTheDay = ({ jobOfTheDay }: JobOfTheDayProps) => (
  <MaterialProse
    html={jobOfTheDay}
    emptyText="No job of the day available for this lesson yet."
  />
);
