import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// Supabase publishable client configuration.
// Publishable keys are designed to be exposed in web/mobile clients.
// Environment variables can still override these defaults for development.
const DEFAULT_URL = 'https://ufryvzzzegoltrwcpkls.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_aeZDV23ZRp855C9bKmRlCw_F9NpihWS';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? DEFAULT_URL;
const publishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(url && publishableKey);

let client: SupabaseClient | null = null;

if (url && publishableKey) {
  client = createClient(url, publishableKey, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (!client) return;
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }
}

export const supabase = client;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Crocat online could not initialize Supabase.');
  }
  return supabase;
}
