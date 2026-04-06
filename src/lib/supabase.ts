import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'YOUR_ANON_KEY';

if (SUPABASE_URL.includes('YOUR_PROJECT_ID') || SUPABASE_ANON_KEY === 'YOUR_ANON_KEY') {
  console.warn(
    'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Profile = {
  id: string;
  username: string;
  avatar_url?: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  name: string | null;
  is_group: boolean;
  created_at: string;
  // Joined fields
  last_message?: string;
  last_message_at?: string;
  other_user?: Profile; // for 1:1
  members?: Profile[];  // for group
  unread_count?: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Profile;
};
