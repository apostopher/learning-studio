type MaterialProseProps = {
  html: string | null;
  emptyText: string;
};

export const MaterialProse = ({ html, emptyText }: MaterialProseProps) => {
  if (!html || html.trim().length === 0) {
    return <p className="text-sm text-gray-11">{emptyText}</p>;
  }

  return (
    <div
      className="material-prose text-sm leading-relaxed text-gray-12"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: lesson material is stored as sanitized HTML upstream
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
