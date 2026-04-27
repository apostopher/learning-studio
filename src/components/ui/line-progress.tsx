import { Progress } from "@base-ui/react/progress";

type LineProgressProps = {
  value: number;
  ariaLabel: string;
  className?: string;
};

export const LineProgress = ({
  value,
  ariaLabel,
  className,
}: LineProgressProps) => (
  <Progress.Root
    value={value}
    aria-label={ariaLabel}
    className={["w-full", className ?? ""].join(" ").trim()}
  >
    <Progress.Track className="block h-[2px] w-full overflow-hidden rounded-full bg-gray-a4">
      <Progress.Indicator className="block h-full bg-accent-9 transition-[width] duration-300 ease-out motion-reduce:transition-none" />
    </Progress.Track>
  </Progress.Root>
);
