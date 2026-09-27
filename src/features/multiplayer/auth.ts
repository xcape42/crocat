import type { User } from '@supabase/supabase-js';
import { requireSupabase } from '@/src/lib/supabase';

export async function ensureGuest(displayName = 'Crocat'): Promise<User> {
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: displayName } },
  });

  if (error || !data.user) {
    throw error ?? new Error('Could not create guest session.');
  }

  return data.user;
}

export async function currentUser() {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  return data.user;
}
