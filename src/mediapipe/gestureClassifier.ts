import type { Gesture, Point } from '@/game/types';
export interface Landmark extends Point {
  z: number;
}
const length = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function angle(a: Landmark, b: Landmark, c: Landmark) {
  const u = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z },
    v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const cosine =
    (u.x * v.x + u.y * v.y + u.z * v.z) /
    (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
}
export function classifyGesture(hand: Landmark[]): Gesture | null {
  if (hand.length !== 21 || hand.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))) return null;
  // Ignore degenerate data before calculating finger proportions.
  if (length(hand[0], hand[9]) < 0.00001) return null;
  const extended = [5, 9, 13, 17].map(
    (i) =>
      angle(hand[i], hand[i + 1], hand[i + 3]) > 140 &&
      length(hand[0], hand[i + 3]) > length(hand[0], hand[i + 1]) * 1.08,
  );
  const folded = [5, 9, 13, 17].map(
    (i) =>
      angle(hand[i], hand[i + 1], hand[i + 3]) < 130 ||
      length(hand[0], hand[i + 3]) < length(hand[0], hand[i + 1]) * 1.05,
  );
  const thumb =
    angle(hand[1], hand[2], hand[4]) > 140 &&
    length(hand[4], hand[5]) > length(hand[5], hand[17]) * 0.55;
  // A natural open palm often has one bent/occluded finger, especially the pinky.
  // Three extended fingers are sufficient; a V sign or a pointing pose is not.
  if (extended.filter(Boolean).length >= 3) return 'open';
  if (folded.every(Boolean)) return 'fist';
  if (extended[0] && thumb && folded.slice(1).every(Boolean)) return 'gun';
  return null;
}
export function palmCenter(hand: Landmark[]): Point {
  const indices = [0, 5, 9, 13, 17];
  return {
    x: indices.reduce((sum, i) => sum + hand[i].x, 0) / 5,
    y: indices.reduce((sum, i) => sum + hand[i].y, 0) / 5,
  };
}
