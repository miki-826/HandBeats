import { GOOD_WINDOW_MS, GREAT_WINDOW_MS, PERFECT_WINDOW_MS } from './config';
import type { Judgement, JudgedEvent, Result } from './types';
export function judgeTiming(offsetMs: number): Judgement {
  const delta = Math.abs(offsetMs);
  if (delta <= PERFECT_WINDOW_MS) return 'perfect';
  if (delta <= GREAT_WINDOW_MS) return 'great';
  if (delta <= GOOD_WINDOW_MS) return 'good';
  return 'miss';
}
export const POINTS: Record<Judgement, number> = { perfect: 1000, great: 700, good: 300, miss: 0 };
export function calculateResult(
  events: Pick<JudgedEvent, 'judgement'>[],
  totalNotes: number,
): Result {
  const counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  let score = 0,
    combo = 0,
    maxCombo = 0;
  for (const event of events) {
    counts[event.judgement]++;
    score += POINTS[event.judgement];
    combo = event.judgement === 'miss' ? 0 : combo + 1;
    maxCombo = Math.max(maxCombo, combo);
  }
  return {
    score,
    counts,
    maxCombo,
    totalNotes,
    accuracy: totalNotes ? score / (totalNotes * 10) : 0,
  };
}
