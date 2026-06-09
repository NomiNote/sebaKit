// Supabase client — initialized from environment variables.
// Used by all API functions and the Realtime subscription hook.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Device ID — used to scope all queries to this device
export const DEVICE_ID = (import.meta.env.VITE_DEVICE_ID as string) || 'sevakit-001';
