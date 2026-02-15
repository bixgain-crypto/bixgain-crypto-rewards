import { supabase } from './supabase';

export async function fetchSharedData(table: 'tasks' | 'quizzes' | 'store_items' | 'user_profiles' | 'referral_history' | 'platform_metrics', limit?: number) {
  let query = supabase.from(table).select('*');
  
  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error(`Error fetching ${table}:`, error);
    throw error;
  }
  
  return data;
}
