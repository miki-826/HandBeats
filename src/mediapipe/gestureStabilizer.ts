import { GESTURE_STABLE_FRAMES } from '@/game/config';
import type { Gesture } from '@/game/types';
export class GestureStabilizer {
  private candidate: Gesture | null = null;
  private count = 0;
  private confirmed: Gesture | null = null;
  get gesture(): Gesture | null {
    return this.confirmed;
  }
  update(gesture: Gesture | null): Gesture | null {
    if (gesture !== this.candidate) {
      this.candidate = gesture;
      this.count = 1;
    } else this.count++;
    // Brief tracking uncertainty must not release and retrigger a held pose.
    const requiredFrames = gesture === null ? GESTURE_STABLE_FRAMES * 2 : GESTURE_STABLE_FRAMES;
    if (this.count >= requiredFrames && this.confirmed !== gesture) {
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
