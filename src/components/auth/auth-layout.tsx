import type { ReactNode } from "react";
import { AuthBrandPanel } from "./auth-brand-panel";

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => (
  <div className="min-h-screen grid grid-cols-1 md:grid-cols-[2fr_3fr]">
    <AuthBrandPanel />
    <main className="flex items-center justify-center bg-gray-1 p-8">
      {children}
    </main>
  </div>
);
