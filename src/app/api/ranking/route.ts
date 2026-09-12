import { getChart } from '@/lib/catalog';
import { admin, serverConfigured } from '@/lib/supabase/server';
import { sessionRequestSchema } from '@/lib/validation/submission';
import { SCORE_VERSION } from '@/game/config';
export async function GET(request: Request) {
  if (!serverConfigured())
    return Response.json(
      { entries: [], configured: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const params = new URL(request.url).searchParams;
    const input = sessionRequestSchema.parse({
      songId: params.get('songId'),
      difficulty: params.get('difficulty'),
      chartVersion: Number(params.get('chartVersion')),
      scoreVersion: SCORE_VERSION,
    });
    const chart = getChart(input.songId, input.difficulty);
    if (chart.chartVersion !== input.chartVersion)
      throw new Error('譜面バージョンが一致しません。');
    const { data, error } = await admin()
      .from('rankings')
      .select('*')
      .eq('song_id', input.songId)
      .eq('difficulty', input.difficulty)
      .eq('chart_version', input.chartVersion)
      .eq('score_version', SCORE_VERSION)
      .order('score', { ascending: false })
      .order('accuracy', { ascending: false })
      .order('created_at', { ascending: true })
      .order('user_id', { ascending: true })
      .limit(100);
    if (error) throw new Error('ランキングを取得できません。');
    return Response.json(
      { entries: data, configured: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '取得に失敗しました。' },
      { status: 400 },
    );
  }
}
