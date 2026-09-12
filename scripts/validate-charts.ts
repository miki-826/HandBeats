import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chartSchema } from '../src/lib/validation/charts';
import { DIFFICULTIES, type Song } from '../src/game/types';
const root = 'src/data/songs';
const lock = JSON.parse(readFileSync('src/data/chart-lock.json', 'utf8')) as Record<string, string>;
const keys = new Set<string>();
let count = 0;
for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const song = JSON.parse(readFileSync(path.join(root, dir.name, 'metadata.json'), 'utf8')) as Song;
  if (song.id !== dir.name || !existsSync(path.join('public', song.audio)))
    throw new Error(`Invalid song ${dir.name}`);
  for (const difficulty of DIFFICULTIES) {
    const raw = readFileSync(path.join(root, dir.name, `${difficulty}.json`), 'utf8');
    const chart = chartSchema.parse(JSON.parse(raw));
    if (
      chart.songId !== song.id ||
      chart.difficulty !== difficulty ||
      chart.durationMs !== song.durationMs ||
      chart.notes.length !== song.difficulties[difficulty].noteCount ||
      chart.chartVersion !== song.difficulties[difficulty].chartVersion
    )
      throw new Error(`Metadata mismatch ${song.id}:${difficulty}`);
    const key = `${chart.songId}:${chart.difficulty}:${chart.chartVersion}`;
    if (keys.has(key)) throw new Error(`Duplicate chart ${key}`);
    keys.add(key);
    if (lock[key] !== createHash('sha256').update(raw).digest('hex'))
      throw new Error(
        `CHART IMMUTABILITY VIOLATION: ${key}. Increment chartVersion; preserve old lock entries.`,
      );
    count++;
    console.log(`${key}: ${chart.notes.length} notes, SHA-256 verified`);
  }
}
console.log(`Validated ${count} fixed charts.`);
