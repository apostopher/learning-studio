import type { ReactNode } from 'react';

interface ConfigSettingRowProps {
  title: string;
  description: string;
  /** The control (a BinaryToggle), rendered at the inline-end. */
  children: ReactNode;
}

/** One row of the lesson Config tab: text at the start, control at the end. */
export const ConfigSettingRow = ({
  title,
  description,
  children,
}: ConfigSettingRowProps) => {
  return (
    <div className="flex items-center justify-between gap-6 border-gray-6 border-b py-4 last:border-b-0">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-gray-12 text-sm">{title}</h3>
        <p className="text-gray-11 text-sm">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
};
