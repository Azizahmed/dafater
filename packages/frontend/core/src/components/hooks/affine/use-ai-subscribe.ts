import { useCallback } from 'react';

/**
 * Upstream started an AI subscription checkout here. Dafater has no payments
 * or AI subscriptions (the server administrator configures the AI for every
 * user), so this is a no-op kept for the existing `onAISubscribe` plumbing.
 */
export const useAISubscribe = () => {
  return useCallback(async () => {}, []);
};
