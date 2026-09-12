import type { Difficulty } from '@/game/types';
import { SCORE_VERSION } from '@/game/config';
export interface RankingEntry {
  user_id: string;
  display_name: string;
  score: number;
  accuracy: number;
  max_combo: number;
  created_at: string;
}
export function rankingKey(songId: string, difficulty: Difficulty, chartVersion: number) {
  return `${songId}:${difficulty}:${chartVersion}:${SCORE_VERSION}`;
}
export function bestPerUser(rows: RankingEntry[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      b.score - a.score ||
      b.accuracy - a.accuracy ||
      a.created_at.localeCompare(b.created_at) ||
      a.user_id.localeCompare(b.user_id),
  );
  const seen = new Set<string>();
  return sorted
    .filter((row) => {
      if (seen.has(row.user_id)) return false;
      seen.add(row.user_id);
      return true;
    })
    .slice(0, 100);
}
