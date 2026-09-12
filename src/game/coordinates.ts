import type { Point } from './types';
export function mirrorPoint(point: Point, mirrored = true): Point {
  return { x: mirrored ? 1 - point.x : point.x, y: point.y };
}
// Both video and canvas occupy this exact rectangle. No object-fit: cover cropping.
export function containRect(
  width: number,
  height: number,
  videoWidth: number,
  videoHeight: number,
) {
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const w = videoWidth * scale,
    h = videoHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
