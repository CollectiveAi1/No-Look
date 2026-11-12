import { CONFIG } from '../config.js';
import { createLocalBackend } from './local.js';
import { createSupabaseBackend } from './supabase.js';

export function createBackend() {
  return CONFIG.supabaseUrl && CONFIG.supabaseAnonKey ? createSupabaseBackend(CONFIG) : createLocalBackend();
}
