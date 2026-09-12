import { CLAP_COOLDOWN_MS, CLAP_DISTANCE_THRESHOLD, CLAP_REARM_DISTANCE } from '@/game/config';
import { distance } from '@/game/coordinates';
import type { Point } from '@/game/types';
export class ClapDetector {
  private armed = false;
  private lastClap = -Infinity;
  private history: { distance: number; time: number }[] = [];
  update(hands: Point[], time: number): Point | null {
    if (hands.length !== 2) {
      this.history = [];
      this.armed = false;
      return null;
    }
    const gap = distance(hands[0], hands[1]);
    this.history = this.history.filter((h) => time - h.time <= 250);
    if (gap >= CLAP_REARM_DISTANCE) this.armed = true;
    const closing = this.history.some(
      (h) =>
        h.distance - gap > 0.1 &&
        time - h.time >= 30 &&
        (h.distance - gap) / (time - h.time) > 0.00055,
    );
    this.history.push({ distance: gap, time });
    if (
      this.armed &&
      closing &&
      gap <= CLAP_DISTANCE_THRESHOLD &&
      time - this.lastClap >= CLAP_COOLDOWN_MS
    ) {
      this.lastClap = time;
      this.armed = false;
      this.history = [];
      return { x: (hands[0].x + hands[1].x) / 2, y: (hands[0].y + hands[1].y) / 2 };
    }
    return null;
  }
}
