const SHARED_DATA_URL = 'https://x79bsxgw--shared-data.functions.blink.new';

export async function fetchSharedData(table: 'tasks' | 'quizzes' | 'store_items' | 'user_profiles' | 'referral_history', limit?: number) {
  const params = new URLSearchParams({ table });
  if (limit) params.set('limit', String(limit));

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10000);

  const res = await fetch(`${SHARED_DATA_URL}?${params}`, {
    signal: controller.signal,
  });

  if (!res.ok) throw new Error(`Failed to fetch ${table}`);
  const json = await res.json();
  return json.data;
}
