import type { User } from '@supabase/supabase-js';
import { requireSupabase } from '@/src/lib/supabase';

export async function ensureGuest(displayName: string): Promise<User> {
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session?.user) {
    const current = sessionData.session.user;
    if (displayName && current.user_metadata?.display_name !== displayName) {
      await supabase.auth.updateUser({ data: { display_name: displayName } });
    }
    return current;
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
