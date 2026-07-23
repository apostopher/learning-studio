import type { UIMessage } from 'ai';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { brand } from '#/ai/prompts/brand';
import { cn } from '#/lib/cn';

export interface ChatMessageProps {
  text: string;
  role?: UIMessage['role'];
  /** Body font size in px. Overrides the ambient `--chat-message-font-size`
   * CSS var (set by the widget window from `chatWidgetFontSizeAtom`) when
   * provided; otherwise the var (with its own fallback) is honored as-is. */
  fontSize?: number;
  className?: string;
}

/** `code` renders as an inline chip unless remark-gfm/rehype tagged it with a
 * `language-*` class (i.e. it's inside a fenced ```block``` and already
 * nested in a styled `pre`). */
const isFencedCode = (className?: string) => /language-/.test(className ?? '');

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-3 list-disc ps-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal ps-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-12">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-gray-7 border-s-2 ps-3 text-gray-11 italic last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-6" />,
  code: ({ className, children, ...props }) =>
    isFencedCode(className) ? (
      <code className={cn('font-mono text-[0.85em]', className)} {...props}>
        {children}
      </code>
    ) : (
      <code
        className="rounded bg-gray-4 px-1 py-0.5 font-mono text-[0.85em] text-gray-12"
        {...props}
      >
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-md bg-gray-4 p-3 last:mb-0">
      {children}
    </pre>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-accent-11 underline decoration-1 underline-offset-2 transition-colors hover:text-accent-12"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-start">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-gray-6 border-b px-2 py-1 text-start font-semibold text-gray-12">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-gray-6 border-b px-2 py-1 text-start">{children}</td>
  ),
};

const Markdown = ({ children }: { children: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
    {children}
  </ReactMarkdown>
);

/** Renders one chat bubble: assistant text as markdown (GFM), user/system
 * text as plain, whitespace-preserving text. Hookless — `ReactMarkdown`'s
 * default export is a synchronous, hookless render (see `MarkdownHooks` for
 * the async/hooked variant, which is intentionally not used here). */
export const ChatMessage = ({
  text,
  role = 'user',
  fontSize,
  className,
}: ChatMessageProps) => {
  const isAssistant = role === 'assistant';
  const fontSizeStyle =
    typeof fontSize === 'number' ? { fontSize: `${fontSize}px` } : undefined;

  return (
    <div
      className={cn(
        'rounded-lg p-3',
        isAssistant ? 'bg-gray-3 text-gray-12' : 'bg-accent-3 text-accent-12',
        className,
      )}
    >
      <p
        className={cn(
          'mb-1 text-xs font-semibold',
          isAssistant ? 'text-gray-11' : 'text-accent-11',
        )}
      >
        {isAssistant ? brand.ai.name : 'You'}
      </p>
      <div
        className="text-[length:var(--chat-message-font-size,0.875rem)] leading-relaxed"
        style={fontSizeStyle}
      >
        {isAssistant ? (
          <Markdown>{text}</Markdown>
        ) : (
          <p className="whitespace-pre-wrap">{text}</p>
        )}
      </div>
    </div>
  );
};
