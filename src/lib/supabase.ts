import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://uhnhhgmpozvjaliwnfia.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVobmhoZ21wb3p2amFsaXduZmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTAyMjYsImV4cCI6MjA4NjY4NjIyNn0.oWP7yfVbmAjRWPctcOP3XQVdyA0kG0Ml5wZl5NTYHbw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
