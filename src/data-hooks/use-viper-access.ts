import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from '#/data-hooks/keys';

const viperAccessSchema = z.object({ allowed: z.boolean() });

/**
 * Whether the signed-in user may use Viper (a paid feature): false for a
 * student whose every seat is FREE. Backed by GET /api/user/viper-access,
 * which applies `hasViperAccess`; the Viper endpoints refuse on the same rule.
 */
export function useViperAccess(enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.viperAccess(),
    queryFn: async () => {
      const res = await fetch('/api/user/viper-access');
      if (!res.ok) {
        throw new Error(`Failed to check Viper access (${res.status})`);
      }
      return viperAccessSchema.parse(await res.json()).allowed;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}
