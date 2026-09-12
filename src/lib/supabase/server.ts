import 'server-only';
import { createClient } from '@supabase/supabase-js';
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('ランキングは未接続です。');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
export function serverConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}
export async function authenticatedUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) throw new Error('認証が必要です。');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Error('認証の有効期限が切れました。');
  return data.user.id;
}
