import { randomBytes } from 'node:crypto';
import { getChart } from '@/lib/catalog';
import { admin, authenticatedUser, serverConfigured } from '@/lib/supabase/server';
import { sessionRequestSchema } from '@/lib/validation/submission';
export async function POST(request: Request) {
  if (!serverConfigured())
    return Response.json(
      { error: '世界ランキングは未接続です。ローカルでプレイできます。' },
      { status: 503 },
    );
  try {
    const raw = await request.text();
    if (raw.length > 2000)
      return Response.json({ error: 'リクエストが大きすぎます。' }, { status: 413 });
    const input = sessionRequestSchema.parse(JSON.parse(raw));
    const userId = await authenticatedUser(request);
    const chart = getChart(input.songId, input.difficulty);
    if (chart.chartVersion !== input.chartVersion)
      throw new Error('譜面バージョンが一致しません。');
    const db = admin();
    const { count, error: countError } = await db
      .from('play_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('started_at', new Date(Date.now() - 60000).toISOString());
    if (countError) throw new Error('ランキング接続を確認できません。');
    if ((count ?? 0) >= 8)
      return Response.json({ error: '少し待ってから再試行してください。' }, { status: 429 });
    const { data, error } = await db
      .from('play_sessions')
      .insert({
        user_id: userId,
        song_id: input.songId,
        difficulty: input.difficulty,
        chart_version: chart.chartVersion,
        score_version: input.scoreVersion,
        nonce: randomBytes(24).toString('hex'),
        expires_at: new Date(Date.now() + chart.durationMs + 600000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error('プレイセッションを開始できません。');
    return Response.json({ playSessionId: data.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '開始に失敗しました。' },
      { status: 400 },
    );
  }
}
