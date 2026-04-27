import type { ReactNode } from 'react';
import { ResizeHandle } from './resize-handle';
import { ScrollArea } from './scroll-area';
import { UnsupportedScreen } from './unsupported-screen';

const ASIDE_ID = 'app-shell-aside';

type AppShellProps = {
  header: ReactNode;
  aside: ReactNode;
  main: ReactNode;
  footer: ReactNode;
};

export const AppShell = ({ header, aside, main, footer }: AppShellProps) => (
  <div className="app-shell">
    <header className="app-shell__header">{header}</header>
    <aside id={ASIDE_ID} className="app-shell__aside" aria-label="Sidebar">
      <ScrollArea>{aside}</ScrollArea>
    </aside>
    <div className="app-shell__separator">
      <ResizeHandle controlledAsideId={ASIDE_ID} />
    </div>
    <main className="app-shell__main">
      <ScrollArea>{main}</ScrollArea>
    </main>
    <footer className="app-shell__footer">{footer}</footer>
    <div className="app-shell__unsupported" role="alert">
      <UnsupportedScreen />
    </div>
  </div>
);
