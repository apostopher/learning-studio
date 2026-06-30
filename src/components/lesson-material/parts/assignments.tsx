import { MaterialProse } from './material-prose';

type AssignmentsProps = {
  assignments: string | null;
};

export const Assignments = ({ assignments }: AssignmentsProps) => (
  <MaterialProse
    html={assignments}
    emptyText="No assignments available for this lesson yet."
  />
);
