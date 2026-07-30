import type { ProviderId } from '#/lib/video-providers';
import { VIDEO_PROVIDERS } from '#/lib/video-providers';

interface ProviderHowToProps {
  provider: ProviderId;
}

export const ProviderHowTo = ({ provider }: ProviderHowToProps) => {
  const { title, steps } = VIDEO_PROVIDERS[provider].howTo;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-6 bg-gray-2 p-4">
      <h3 className="font-medium text-primary text-sm">{title}</h3>
      <ol className="flex list-decimal flex-col gap-1.5 ps-5 text-secondary text-sm">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
};
