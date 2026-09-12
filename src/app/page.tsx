import { getChart, getSongs } from '@/lib/catalog';
import { DIFFICULTIES } from '@/game/types';
import { HandBeat } from '@/components/HandBeat';
export default function Page() {
  const songs = getSongs();
  const charts = Object.fromEntries(
    songs.map((song) => [
      song.id,
      Object.fromEntries(DIFFICULTIES.map((d) => [d, getChart(song.id, d)])),
    ]),
  );
  return <HandBeat songs={songs} charts={charts} />;
}
