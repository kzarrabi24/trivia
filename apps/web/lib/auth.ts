import { supabase } from './supabase';

export async function ensureUser(displayName?: string) {
  let { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
    user = result.data.user;
  }
  if (!user) throw new Error('Could not create a player session.');
  await supabase.rpc('ensure_profile', { p_display_name: displayName ?? null });
  return user;
}

export function cleanCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
