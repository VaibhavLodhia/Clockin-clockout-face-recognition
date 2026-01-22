import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Get environment variables - try multiple sources
// 1. From process.env (works in development)
// 2. From Constants.expoConfig.extra (works in native builds)
// 3. Fallback to placeholder (should never happen in production)
const supabaseUrl = 
  process.env.EXPO_PUBLIC_SUPABASE_URL || 
  Constants.expoConfig?.extra?.supabaseUrl || 
  'https://placeholder.supabase.co';

const supabaseAnonKey = 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
  Constants.expoConfig?.extra?.supabaseAnonKey || 
  'placeholder-key';

// Validate configuration
if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co' || !supabaseUrl.includes('supabase.co')) {
  console.error('❌ Invalid Supabase URL:', supabaseUrl);
  console.error('   Please check your .env file or EAS secrets');
}

if (!supabaseAnonKey || supabaseAnonKey === 'placeholder-key' || supabaseAnonKey.length < 50) {
  console.error('❌ Invalid Supabase Anon Key');
  console.error('   Please check your .env file or EAS secrets');
}

// Log configuration (only in development)
if (__DEV__) {
  console.log('🔧 Supabase Configuration:');
  console.log('   URL:', supabaseUrl?.substring(0, 40) + '...');
  console.log('   Key:', supabaseAnonKey?.substring(0, 20) + '...');
  console.log('   Platform:', Platform.OS);
  console.log('   From process.env:', !!process.env.EXPO_PUBLIC_SUPABASE_URL);
  console.log('   From Constants:', !!Constants.expoConfig?.extra?.supabaseUrl);
  console.log('   URL Valid:', supabaseUrl?.includes('supabase.co'));
}

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








