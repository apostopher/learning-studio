import { appTitle, logoDark, logoLight } from '../styles/theme.generated';

type LogoSlotData = { kind: 'svg'; svg: string } | { kind: 'url'; src: string };

const LogoSlot = ({
  data,
  className,
}: {
  data: LogoSlotData;
  className: string;
}) =>
  data.kind === 'svg' ? (
    <span
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: env input is Zod-validated and sanitized by the generator
      dangerouslySetInnerHTML={{ __html: data.svg }}
    />
  ) : (
    <img className={className} src={data.src} alt="" />
  );

export const Logo = ({ className }: { className?: string }) => (
  <span role="img" aria-label={appTitle} className={className}>
    <LogoSlot data={logoLight} className="block dark:hidden" />
    <LogoSlot data={logoDark} className="hidden dark:block" />
  </span>
);
