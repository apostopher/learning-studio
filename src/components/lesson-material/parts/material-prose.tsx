type MaterialProseProps = {
  html: string | null;
  emptyText: string;
};

export const MaterialProse = ({ html, emptyText }: MaterialProseProps) => {
  if (!html || html.trim().length === 0) {
    return <p className="text-sm text-secondary">{emptyText}</p>;
  }

  return (
    <div
      className="material-prose text-sm leading-relaxed text-primary"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: lesson material is stored as sanitized HTML upstream
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
