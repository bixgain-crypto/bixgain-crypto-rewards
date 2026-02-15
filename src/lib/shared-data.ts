import { blink } from './blink';

const SHARED_DATA_URL = 'https://gh9qbc8y--shared-data.functions.blink.new';

export async function fetchSharedData(table: 'tasks' | 'quizzes' | 'store_items' | 'user_profiles' | 'referral_history' | 'platform_metrics', limit?: number) {
  const params = new URLSearchParams({ table });
  if (limit) params.set('limit', String(limit));

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10000);

  // Include auth token since edge function requires JWT verification
  let headers: Record<string, string> = {};
  try {
    const token = await blink.auth.getValidToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Continue without auth - function may still work for some tables
  }

  const res = await fetch(`${SHARED_DATA_URL}?${params}`, {
    signal: controller.signal,
    headers,
  });

  if (!res.ok) throw new Error(`Failed to fetch ${table}`);
  const json = await res.json();
  return json.data;
}
