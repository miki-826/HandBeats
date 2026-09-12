// Offline preparation only. Never called at build time or game start.
import { readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import path from 'node:path';
const titles = ['靴ひもを結ぶ朝', 'ワン・ツー・スリーで笑顔満開！', 'ゆっくりでいい', 'これが私だ'];
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
mkdirSync('.analysis', { recursive: true });
const report = [];
for (const [i,title] of titles.entries()) {
  const source = walk('資料').find(f => path.basename(f,'.mp4') === title);
  if (!source) throw new Error(`Missing source: ${title}`);
  const id = `song-${String(i+1).padStart(2,'0')}`;
  const target = `public/assets/songs/${id}`;
  mkdirSync(target, { recursive: true });
  const probe = spawnSync(ffmpeg, ['-hide_banner','-i',source], { encoding:'utf8' }).stderr;
  writeFileSync(`.analysis/${id}-probe.txt`, probe);
  for (const args of [
    ['-i',source,'-vn','-c:a','copy','-movflags','+faststart',`${target}/audio.m4a`],
    ['-i',source,'-vn','-ar','16000','-ac','1','-f','f32le',`.analysis/${id}.f32`],
  ]) {
    const result = spawnSync(ffmpeg, ['-y','-hide_banner','-loglevel','error',...args]);
    if (result.status !== 0) throw new Error(result.stderr.toString());
  }
  report.push({id,title,source,sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),probe});
  console.log(title,probe);
}
writeFileSync('.analysis/sources.json', JSON.stringify(report,null,2));
