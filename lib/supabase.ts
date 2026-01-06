import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Use localStorage for web, AsyncStorage for native
let storage: any;
if (Platform.OS === 'web') {
  // For web, use localStorage (available in browser)
  // During static export (SSR), window is undefined, so provide a no-op storage
  if (typeof window !== 'undefined') {
    storage = {
      getItem: (key: string) => Promise.resolve(window.localStorage.getItem(key)),
      setItem: (key: string, value: string) => Promise.resolve(window.localStorage.setItem(key, value)),
      removeItem: (key: string) => Promise.resolve(window.localStorage.removeItem(key)),
    };
  } else {
    // Fallback for SSR (static export) - sessions will be handled client-side
    storage = {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    };
  }
} else {
  // For native, use AsyncStorage (lazy import to avoid SSR issues)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  storage = AsyncStorage;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database types
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'admin';
  cafe_location: 'Hodge Hall' | 'Read Cafe' | null;
  created_at: string;
  disabled: boolean;
}

export interface FaceEmbedding {
  id: string;
  user_id: string;
  embedding: number[][]; // Array of arrays: 4 embeddings, each 128 dimensions
  model_version: string;
  created_at: string;
}

export interface TimeLog {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  work_cycle: string;
  verified_by: 'face' | 'admin_code' | 'admin_manual';
  flagged: boolean;
  flag_reason: string | null;
  matched_employee_id: string | null;
  confidence_score: number | null;
  created_at: string;
}

export interface AdminCode {
  id: string;
  code_hash: string;
  user_id: string | null;
  action: 'signup' | 'clock_in' | 'clock_out';
  expires_at: string;
  used: boolean;
  created_by: string;
}

export interface AuditLog {
  id: string;
  action: string;
  performed_by: string;
  target_user: string | null;
  metadata: any;
  created_at: string;
}








