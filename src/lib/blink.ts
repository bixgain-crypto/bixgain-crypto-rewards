import { createClient } from '@blinkdotnew/sdk';

/**
 * Blink SDK client instance for BixGain Rewards App.
 * Handles Auth, Database, Storage, and AI.
 */
export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'bixgain-rewards-app-gh9qbc8y',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY,
  auth: {
    mode: 'managed',
  },
});
