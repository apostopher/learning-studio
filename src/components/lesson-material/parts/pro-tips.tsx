import { MaterialProse } from './material-prose';

type ProTipsProps = {
  proTips: string | null;
};

export const ProTips = ({ proTips }: ProTipsProps) => (
  <MaterialProse
    html={proTips}
    emptyText="No pro tips available for this lesson yet."
  />
);
