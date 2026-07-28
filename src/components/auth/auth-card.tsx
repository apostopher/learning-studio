import type { ReactNode } from 'react';

interface AuthCardProps {
  heading: string;
  description?: string;
  children: ReactNode;
}

export const AuthCard = ({ heading, description, children }: AuthCardProps) => (
  <div className="w-full max-w-sm">
    <div className="mb-8">
      <h1 className="text-2xl font-semibold text-primary tracking-tight">
        {heading}
      </h1>
      {description && (
        <p className="mt-2 text-sm text-secondary leading-relaxed">
          {description}
        </p>
      )}
    </div>
    {children}
  </div>
);
