import { getChart } from '@/lib/catalog';
import { admin, authenticatedUser, serverConfigured } from '@/lib/supabase/server';
import { submissionSchema, verifySubmission, type PlaySession } from '@/lib/validation/submission';
export async function POST(request: Request) {
  if (!serverConfigured())
    return Response.json({ error: '世界ランキングは未接続です。' }, { status: 503 });
  try {
    const raw = await request.text();
    if (raw.length > 2000000)
      return Response.json({ error: 'リクエストが大きすぎます。' }, { status: 413 });
    const submission = submissionSchema.parse(JSON.parse(raw));
    const userId = await authenticatedUser(request);
    const db = admin();
    const { data: session, error: sessionError } = await db
      .from('play_sessions')
      .select('*')
      .eq('id', submission.playSessionId)
      .single();
    if (sessionError || !session) throw new Error('プレイセッションが見つかりません。');
    const chart = getChart(submission.songId, submission.difficulty);
    const result = verifySubmission(session as PlaySession, submission, chart, userId);
    const { error } = await db.rpc('submit_verified_score', {
      p_session_id: session.id,
      p_user_id: userId,
      p_display_name: submission.displayName,
      p_score: result.score,
      p_max_combo: result.maxCombo,
      p_perfect: result.counts.perfect,
      p_great: result.counts.great,
      p_good: result.counts.good,
      p_miss: result.counts.miss,
      p_accuracy: result.accuracy,
    });
    if (error)
      throw new Error('登録できません。登録済み、またはセッション期限切れの可能性があります。');
    const { data: worldRank, error: rankError } = await db.rpc('player_rank', {
      p_user_id: userId,
      p_song_id: submission.songId,
      p_difficulty: submission.difficulty,
      p_chart_version: submission.chartVersion,
      p_score_version: submission.scoreVersion,
    });
    return Response.json(
      { score: result.score, worldRank: rankError ? null : worldRank },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'スコア送信に失敗しました。' },
      { status: 400 },
    );
  }
}
