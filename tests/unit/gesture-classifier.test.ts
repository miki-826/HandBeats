import { describe, expect, it } from 'vitest';
import { classifyGesture, type Landmark } from '@/mediapipe/gestureClassifier';
import { GestureStabilizer } from '@/mediapipe/gestureStabilizer';
function pose(extended: boolean[]): Landmark[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[0] = { x: 0, y: 0.2, z: 0 };
  points[1] = { x: 0.1, y: 0.14, z: 0 };
  points[2] = { x: 0.17, y: 0.12, z: 0 };
  points[3] = { x: 0.24, y: 0.1, z: 0 };
  points[4] = { x: 0.31, y: 0.08, z: 0 };
  [5, 9, 13, 17].forEach((base, finger) => {
    const x = -0.12 + finger * 0.08;
    points[base] = { x, y: 0, z: 0 };
    points[base + 1] = { x, y: -0.1, z: 0 };
    points[base + 2] = { x, y: extended[finger] ? -0.16 : 0, z: 0 };
    points[base + 3] = { x, y: extended[finger] ? -0.23 : 0.07, z: 0 };
  });
  return points;
}
describe('anatomical gesture classification', () => {
  it('accepts a relaxed open palm with any one bent finger', () => {
    for (let bent = 0; bent < 4; bent++) {
      expect(classifyGesture(pose([0, 1, 2, 3].map((i) => i !== bent)))).toBe('open');
    }
  });
  it('accepts softly curved fingers with a folded thumb', () => {
    const points = pose([true, true, true, true]);
    [5, 9, 13, 17].forEach((base) => {
      points[base + 3] = { x: points[base].x + 0.05, y: -0.18, z: 0 };
    });
    points[4] = { x: -0.05, y: 0.12, z: 0 };
    expect(classifyGesture(points)).toBe('open');
  });
  it('preserves an open palm across left/right reflection and depth rotation', () => {
    for (const rotation of [Math.PI / 4, Math.PI / 2, Math.PI * 0.7]) {
      for (const mirror of [-1, 1]) {
        const points = pose([true, true, true, false]).map((p) => ({
          x: p.x * mirror,
          y: p.y * Math.cos(rotation),
          z: p.y * Math.sin(rotation),
        }));
        expect(classifyGesture(points)).toBe('open');
      }
    }
  });
  it('rejects absent, degenerate and non-finite tracking data', () => {
    expect(classifyGesture([])).toBeNull();
    expect(classifyGesture(Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })))).toBeNull();
    const points = pose([true, true, true, true]);
    points[8].x = NaN;
    expect(classifyGesture(points)).toBeNull();
  });
  it('keeps OPEN stable through brief uncertainty without duplicate hits', () => {
    const stable = new GestureStabilizer();
    const open = classifyGesture(pose([true, true, true, false]));
    expect(stable.update(open)).toBeNull();
    expect(stable.update(open)).toBe('open');
    for (let i = 0; i < 3; i++) expect(stable.update(null)).toBeNull();
    expect(stable.gesture).toBe('open');
    expect(stable.update(open)).toBeNull();
    expect(stable.update(open)).toBeNull();
    for (let i = 0; i < 4; i++) stable.update(null);
    expect(stable.gesture).toBeNull();
    stable.update(open);
    expect(stable.update(open)).toBe('open');
    stable.reset();
    expect(stable.gesture).toBeNull();
  });
  it.each([
    [[false, false, false, false], 'fist'],
    [[true, false, false, false], 'gun'],
    [[true, true, true, true], 'open'],
    [[true, true, false, false], null],
  ] as const)(
    'classifies a pose independently of in-plane rotation and scale',
    (fingers, expected) => {
      for (const rotation of [0, Math.PI / 2, Math.PI]) {
        const points = pose([...fingers]).map((p) => ({
          x: (p.x * Math.cos(rotation) - p.y * Math.sin(rotation)) * 2 + 0.3,
          y: (p.x * Math.sin(rotation) + p.y * Math.cos(rotation)) * 2 + 0.2,
          z: 0,
        }));
        expect(classifyGesture(points)).toBe(expected);
      }
    },
  );
});
