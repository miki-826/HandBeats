import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | undefined;
export const rankingConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export async function authToken() {
  if (!rankingConfigured)
    throw new Error('世界ランキングは未接続です。ローカルプレイをご利用ください。');
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  const { data: current, error: currentError } = await client.auth.getSession();
  if (currentError) throw currentError;
  if (current.session) return current.session.access_token;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error('ランキングのゲスト認証に失敗しました。');
  if (!data.session) throw new Error('ランキングの認証を開始できません。');
  return data.session.access_token;
}
