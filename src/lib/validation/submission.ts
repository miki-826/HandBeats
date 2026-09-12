import { z } from 'zod';
import { DIFFICULTIES, GESTURES, type Chart, type JudgedEvent } from '@/game/types';
import { GOOD_WINDOW_MS, POSITION_RADIUS, SCORE_VERSION } from '@/game/config';
import { calculateResult, judgeTiming } from '@/game/scoring';
import { distance } from '@/game/coordinates';
export const sessionRequestSchema = z
  .object({
    songId: z.string().regex(/^[a-z0-9-]+$/),
    difficulty: z.enum(DIFFICULTIES),
    chartVersion: z.number().int().positive(),
    scoreVersion: z.literal(SCORE_VERSION),
  })
  .strict();
export const submissionSchema = sessionRequestSchema
  .extend({
    playSessionId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(20),
    events: z
      .array(
        z
          .object({
            noteId: z.string().min(1).max(30),
            gesture: z.enum(GESTURES),
            judgedAtMs: z.number().finite().min(0),
            timingOffsetMs: z.number().finite(),
            judgement: z.enum(['perfect', 'great', 'good', 'miss']),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type Submission = z.infer<typeof submissionSchema>;
export interface PlaySession {
  id: string;
  user_id: string;
  song_id: string;
  difficulty: string;
  chart_version: number;
  score_version: number;
  started_at: string;
  expires_at: string;
  consumed_at: string | null;
  nonce: string;
}
export function verifySubmission(
  session: PlaySession,
  submission: Submission,
  chart: Chart,
  userId: string,
  now = Date.now(),
) {
  if (session.user_id !== userId || session.id !== submission.playSessionId)
    throw new Error('このプレイセッションは使用できません。');
  if (session.consumed_at) throw new Error('この結果は登録済みです。');
  if (now > Date.parse(session.expires_at))
    throw new Error('プレイセッションの有効期限が切れました。');
  if (now - Date.parse(session.started_at) < chart.durationMs + 2500)
    throw new Error('楽曲が終了する前の送信です。');
  if (
    session.song_id !== chart.songId ||
    session.difficulty !== chart.difficulty ||
    session.chart_version !== chart.chartVersion ||
    session.score_version !== SCORE_VERSION ||
    submission.songId !== chart.songId ||
    submission.difficulty !== chart.difficulty ||
    submission.chartVersion !== chart.chartVersion ||
    submission.scoreVersion !== session.score_version
  )
    throw new Error('楽曲・譜面バージョンが一致しません。');
  if (submission.events.length !== chart.notes.length) throw new Error('ノーツ数が一致しません。');
  const verified: JudgedEvent[] = submission.events.map((event, i) => {
    const note = chart.notes[i];
    if (event.noteId !== note.id || event.gesture !== note.gesture)
      throw new Error('ノーツID・順番・ジェスチャーが不正です。');
    const offset = event.judgedAtMs - (note.timeMs + chart.offsetMs);
    if (Math.abs(offset - event.timingOffsetMs) > 0.5) throw new Error('判定時刻が一致しません。');
    const judgement = judgeTiming(offset);
    if (judgement !== event.judgement) throw new Error('判定結果が一致しません。');
    if (judgement === 'miss') {
      if (offset <= GOOD_WINDOW_MS || offset > GOOD_WINDOW_MS + 2)
        throw new Error('MISSの時刻が不正です。');
    } else if (distance(event, note) > POSITION_RADIUS[chart.difficulty])
      throw new Error('ノーツ位置が不正です。');
    return { ...event, judgement };
  });
  return calculateResult(verified, chart.notes.length);
}
