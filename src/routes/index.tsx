import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';
import { Logo } from '../components/logo';
import { appTitle } from '../styles/theme.generated';

export const Route = createFileRoute('/')({ component: App });

function App() {
  return (
    <AppShell
      header={
        <div className="flex items-center gap-3 h-full ps-4 pe-4">
          <Logo className="h-8" />
          <span className="font-display text-gray-12">{appTitle}</span>
        </div>
      }
      aside={
        <nav aria-label="Primary" className="p-3">
          <ul className="flex flex-col gap-1 text-gray-11">
            <li>Nav item 1</li>
            <li>Nav item 2</li>
            <li>Nav item 3</li>
          </ul>
        </nav>
      }
      main={null}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
