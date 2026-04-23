import type { ReactNode } from 'react';
import { UnsupportedScreen } from './unsupported-screen';

type AppShellProps = {
  header: ReactNode;
  aside: ReactNode;
  main: ReactNode;
  footer: ReactNode;
};

export const AppShell = ({ header, aside, main, footer }: AppShellProps) => (
  <div className="app-shell">
    <header className="app-shell__header">{header}</header>
    <aside className="app-shell__aside" aria-label="Sidebar">
      {aside}
    </aside>
    <main className="app-shell__main">{main}</main>
    <footer className="app-shell__footer">{footer}</footer>
    <div className="app-shell__unsupported" role="alert">
      <UnsupportedScreen />
    </div>
  </div>
);
