import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env'
  );
}

const capacitorStorage = {
  async getItem(key: string) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  async setItem(key: string, value: string) {
    await Preferences.set({ key, value });
  },
  async removeItem(key: string) {
    await Preferences.remove({ key });
  },
};

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // On native (Capacitor), localStorage can be flaky depending on WebView settings.
          // Preferences gives us reliable persistence so requests include the JWT (auth.uid() works).
          storage: Capacitor.isNativePlatform() ? (capacitorStorage as any) : undefined,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: !Capacitor.isNativePlatform(),
        },
      })
    : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env');
  }
  return supabase;
}

export type Profile = {
  id: string;
  username: string;
  avatar_url?: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  name: string | null;
  is_group: boolean;
  created_at: string;
  created_by?: string;
  members?: Profile[];
  other_user?: Profile;
  last_message?: string;
  last_message_at?: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  media_url?: string;
  updated_at?: string;
  is_deleted?: boolean;
  sender?: Profile;
  message_reads?: { user_id: string; read_at: string }[];
};

