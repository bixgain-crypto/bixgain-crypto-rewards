import { supabase } from './supabase';

interface PendingInsert {
  id: string;
  table: string;
  data: any;
  timestamp: number;
}

const STORAGE_KEY = 'supabase_pending_inserts';

class SupabaseSync {
  private isSyncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.sync());
      // Try sync on load
      this.sync();
    }
  }

  async insert(table: string, data: any) {
    // Generate a temporary ID if not provided
    const id = data.id || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const record = { ...data, id };

    if (!navigator.onLine) {
      this.saveToOffline(table, record);
      return { data: record, error: null, offline: true };
    }

    try {
      const { data: result, error } = await supabase.from(table).insert(record).select().single();
      if (error) throw error;
      return { data: result, error: null, offline: false };
    } catch (error) {
      console.error(`Sync error for ${table}:`, error);
      this.saveToOffline(table, record);
      return { data: record, error: null, offline: true };
    }
  }

  private saveToOffline(table: string, data: any) {
    const pending = this.getPending();
    pending.push({
      id: data.id,
      table,
      data,
      timestamp: Date.now()
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  }

  private getPending(): PendingInsert[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  async sync() {
    if (this.isSyncing || !navigator.onLine) return;
    this.isSyncing = true;

    const pending = this.getPending();
    if (pending.length === 0) {
      this.isSyncing = false;
      return;
    }

    console.log(`Syncing ${pending.length} pending records...`);
    const remaining: PendingInsert[] = [];

    for (const item of pending) {
      try {
        const { error } = await supabase.from(item.table).insert(item.data);
        if (error && error.code !== '23505') { // Ignore duplicate key errors
          console.error(`Failed to sync item ${item.id}:`, error);
          remaining.push(item);
        }
      } catch (error) {
        remaining.push(item);
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    this.isSyncing = false;
    
    if (remaining.length < pending.length) {
      console.log(`Successfully synced ${pending.length - remaining.length} records.`);
    }
  }
}

export const supabaseSync = new SupabaseSync();
