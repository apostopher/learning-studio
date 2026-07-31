import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

interface ConfigSettingRowProps {
  title: string;
  description: string;
  /**
   * Why this setting is restricted or cannot take effect. Rendered below the
   * description in warning styling, so it reads as a caution rather than as
   * more description — the distinction matters when the reason explains a
   * disabled control.
   */
  warning?: string;
  /**
   * `inline` (default) puts a fixed-size control at the inline-end — right for
   * a BinaryToggle. `stacked` drops a full-width control below the text, for
   * one that grows with its content, like a chip picker.
   */
  layout?: 'inline' | 'stacked';
  /** The control (a BinaryToggle), rendered at the inline-end. */
  children: ReactNode;
}

/** One row of the lesson Config tab: text at the start, control at the end. */
export const ConfigSettingRow = ({
  title,
  description,
  warning,
  layout = 'inline',
  children,
}: ConfigSettingRowProps) => {
  const stacked = layout === 'stacked';
  return (
    <div
      className={
        stacked
          ? 'flex flex-col gap-3 border-gray-6 border-b py-4 last:border-b-0'
          : 'flex items-center justify-between gap-6 border-gray-6 border-b py-4 last:border-b-0'
      }
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-medium text-primary text-sm">{title}</h3>
        <p className="text-secondary text-sm">{description}</p>
        {warning && (
          // `<output>` carries an implicit role="status" — polite, not an
          // interruption, which is right for text describing configuration that
          // is already true on render rather than a response to an action.
          // (A literal role="status" on a <p> trips useSemanticElements.)
          //
          // `text-warning-text`, never `warning-9`: only the `-text` step is
          // contrast-checked, and warning-9 measures 1.90:1 on this panel.
          <output className="mt-1 flex items-start gap-1.5 rounded-md border border-warning-7 bg-warning-3 px-2 py-1.5 text-warning-text text-xs">
            <TriangleAlert
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>{warning}</span>
          </output>
        )}
      </div>
      <div className={stacked ? 'min-w-0' : 'shrink-0'}>{children}</div>
    </div>
  );
};
