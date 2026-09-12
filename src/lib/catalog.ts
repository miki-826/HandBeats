import 'server-only';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Chart, Difficulty, Song } from '@/game/types';
import { chartSchema } from './validation/charts';
const root = path.join(process.cwd(), 'src/data/songs');
export function getSongs(): Song[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => JSON.parse(readFileSync(path.join(root, d.name, 'metadata.json'), 'utf8')) as Song)
    .map((song) => ({
      ...song,
      jacket: existsSync(path.join(process.cwd(), 'public', song.jacket)) ? song.jacket : '',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function getChart(songId: string, difficulty: Difficulty): Chart {
  if (!getSongs().some((s) => s.id === songId) || !['easy', 'normal', 'hard'].includes(difficulty))
    throw new Error('譜面が見つかりません。');
  return chartSchema.parse(
    JSON.parse(readFileSync(path.join(root, songId, `${difficulty}.json`), 'utf8')),
  );
}
