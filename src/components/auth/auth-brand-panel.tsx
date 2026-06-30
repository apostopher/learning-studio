import { Logo } from "../logo";
import { appTitle } from "../../styles/theme.generated";

export const AuthBrandPanel = () => (
  <aside
    aria-hidden="true"
    className="hidden md:flex flex-col justify-between bg-apple-9 text-apple-contrast p-12 select-none"
  >
    <div className="flex items-center gap-3">
      <Logo className="w-8 h-8 text-apple-contrast" />
      <span className="text-sm font-semibold tracking-wide">{appTitle}</span>
    </div>

    <div className="space-y-4">
      <p className="text-4xl font-bold leading-tight tracking-tight">
        Train smarter.<br />Fly better.
      </p>
      <p className="text-sm text-apple-contrast/60 max-w-xs leading-relaxed">
        Aviation ground school, quizzes, and mission briefs — all in one place.
      </p>
    </div>

    <p className="text-xs text-apple-contrast/40">
      © {new Date().getFullYear()} {appTitle}
    </p>
  </aside>
);
