import { GESTURE_STABLE_FRAMES } from '@/game/config';
import type { Gesture } from '@/game/types';
export class GestureStabilizer {
  private candidate: Gesture | null = null;
  private count = 0;
  private confirmed: Gesture | null = null;
  update(gesture: Gesture | null): Gesture | null {
    if (gesture !== this.candidate) {
      this.candidate = gesture;
      this.count = 1;
    } else this.count++;
    if (this.count >= GESTURE_STABLE_FRAMES && this.confirmed !== gesture) {
      this.confirmed = gesture;
      return gesture;
    }
    return null;
  }
  reset() {
    this.candidate = null;
    this.confirmed = null;
    this.count = 0;
  }
}
