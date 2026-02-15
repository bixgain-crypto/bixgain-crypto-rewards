import { createClient } from '@blinkdotnew/sdk';

/**
 * Blink SDK client instance for BixGain Rewards App.
 * Handles Authentication only (Migration to Supabase for DB complete).
 */
export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'bixgain-rewards-app-gh9qbc8y',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY,
  auth: {
    mode: 'managed',
  },
});
