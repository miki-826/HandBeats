import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { calculateResult, judgeTiming } from '@/game/scoring';
import { chartSchema } from '@/lib/validation/charts';
import { GameEngine } from '@/game/engine';
import { containRect, mirrorPoint } from '@/game/coordinates';
import { GestureStabilizer } from '@/mediapipe/gestureStabilizer';
import { ClapDetector } from '@/mediapipe/clapDetector';
import { classifyGesture, palmCenter, type Landmark } from '@/mediapipe/gestureClassifier';
import { bestPerUser, rankingKey } from '@/lib/ranking';
import type { Chart, GestureEvent } from '@/game/types';
const chart: Chart = {
  songId: 'test',
  difficulty: 'normal',
  chartVersion: 1,
  level: 3,
  durationMs: 6000,
  offsetMs: 100,
  notes: [
    { id: 'n1', timeMs: 1000, gesture: 'fist', x: 0.25, y: 0.4 },
    { id: 'n2', timeMs: 2000, gesture: 'gun', x: 0.7, y: 0.4 },
    { id: 'n3', timeMs: 3000, gesture: 'clap', x: 0.5, y: 0.5 },
  ],
};
const input: GestureEvent = {
  x: 0.25,
  y: 0.4,
  gesture: 'fist',
  timestampMs: 1100,
  confidence: 1,
  hand: 'right',
};
describe('timing and scoring', () => {
  it.each([
    [-251, 'miss'],
    [-250, 'good'],
    [-150, 'great'],
    [-80, 'perfect'],
    [0, 'perfect'],
    [80, 'perfect'],
    [81, 'great'],
    [150, 'great'],
    [151, 'good'],
    [250, 'good'],
    [251, 'miss'],
  ])('judges %s ms as %s', (time, judgement) => expect(judgeTiming(Number(time))).toBe(judgement));
  it('computes weighted accuracy, total score and combo resets', () => {
    const result = calculateResult(
      ['perfect', 'great', 'miss', 'good', 'perfect'].map((judgement) => ({
        judgement: judgement as 'perfect' | 'great' | 'good' | 'miss',
      })),
      5,
    );
    expect(result).toMatchObject({
      score: 3000,
      accuracy: 60,
      maxCombo: 2,
      counts: { perfect: 2, great: 1, good: 1, miss: 1 },
    });
    expect(calculateResult([], 0).accuracy).toBe(0);
  });
  it('requires position AND gesture AND timing; consumes once', () => {
    const engine = new GameEngine(chart);
    expect(engine.input({ ...input, x: 0.9 })).toBeUndefined();
    expect(engine.input({ ...input, gesture: 'open' })).toBeUndefined();
    expect(engine.input({ ...input, timestampMs: 800 })).toBeUndefined();
    expect(engine.input(input)?.judgement).toBe('perfect');
    expect(engine.input(input)).toBeUndefined();
    engine.advance(6000);
    expect(engine.result.counts).toEqual({ perfect: 1, great: 0, good: 0, miss: 2 });
    expect(engine.events.map((e) => e.noteId)).toEqual(['n1', 'n2', 'n3']);
  });
  it('uses nearest matching note, absolute audio time and chart offset', () => {
    const c = { ...chart, notes: [chart.notes[0], { ...chart.notes[0], id: 'n2', timeMs: 1300 }] };
    const engine = new GameEngine(c);
    expect(engine.input({ ...input, timestampMs: 1320 })?.noteId).toBe('n2');
    expect(engine.advance(1350)).toHaveLength(0);
    expect(engine.advance(1351)[0].noteId).toBe('n1');
  });
});
describe('coordinates', () => {
  it('mirrors once and preserves vertical position', () => {
    expect(mirrorPoint({ x: 0.2, y: 0.7 })).toEqual({ x: 0.8, y: 0.7 });
    expect(mirrorPoint({ x: 0.2, y: 0.7 }, false)).toEqual({ x: 0.2, y: 0.7 });
  });
  it('letterboxes 4:3 video on a wide screen without cropping', () => {
    expect(containRect(1600, 900, 640, 480)).toEqual({ x: 200, y: 0, width: 1200, height: 900 });
    expect(containRect(600, 900, 1280, 720)).toEqual({
      x: 0,
      y: 281.25,
      width: 600,
      height: 337.5,
    });
  });
});
describe('gesture transitions', () => {
  it('requires stability, emits only on change, and allows release/re-entry', () => {
    const s = new GestureStabilizer();
    expect(s.update('fist')).toBeNull();
    expect(s.update('fist')).toBe('fist');
    expect(s.update('fist')).toBeNull();
    expect(s.update('open')).toBeNull();
    expect(s.update('fist')).toBeNull();
    expect(s.update('fist')).toBeNull();
    s.update(null);
    s.update(null);
    s.update('fist');
    expect(s.update('fist')).toBe('fist');
  });
  it('detects fast closing clap only once, rearms after separation, applies cooldown', () => {
    const c = new ClapDetector();
    const hands = (gap: number) => [
      { x: 0.5 - gap / 2, y: 0.5 },
      { x: 0.5 + gap / 2, y: 0.5 },
    ];
    expect(c.update(hands(0.5), 0)).toBeNull();
    expect(c.update(hands(0.1), 100)).toEqual({ x: 0.5, y: 0.5 });
    expect(c.update(hands(0.1), 150)).toBeNull();
    expect(c.update(hands(0.5), 180)).toBeNull();
    expect(c.update(hands(0.1), 230)).toBeNull();
    expect(c.update(hands(0.5), 400)).toBeNull();
    expect(c.update(hands(0.1), 500)).not.toBeNull();
  });
  it('rejects static contact, slow closure, and one-hand motion', () => {
    const c = new ClapDetector();
    const hands = (gap: number) => [
      { x: 0.5 - gap / 2, y: 0.5 },
      { x: 0.5 + gap / 2, y: 0.5 },
    ];
    expect(c.update(hands(0.1), 0)).toBeNull();
    c.update(hands(0.4), 1000);
    expect(c.update(hands(0.1), 1600)).toBeNull();
    c.update(hands(0.4), 1700);
    c.update([{ x: 0.5, y: 0.5 }], 1750);
    expect(c.update(hands(0.1), 1800)).toBeNull();
  });
  it('handles missing landmarks and averages palm anchors', () => {
    expect(classifyGesture([])).toBeNull();
    const hand: Array<Landmark> = Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.6, z: 0 }));
    expect(palmCenter(hand)).toEqual({ x: 0.4, y: 0.6 });
  });
});
describe('fixed charts', () => {
  it('validates every song × difficulty against immutable SHA-256 locks, ten loads each', () => {
    const lock = JSON.parse(readFileSync('src/data/chart-lock.json', 'utf8')) as Record<
      string,
      string
    >;
    let count = 0;
    for (const song of readdirSync('src/data/songs'))
      for (const difficulty of ['easy', 'normal', 'hard']) {
        const source = `src/data/songs/${song}/${difficulty}.json`,
          raw = readFileSync(source, 'utf8'),
          parsed = chartSchema.parse(JSON.parse(raw));
        expect(parsed.songId).toBe(song);
        expect(parsed.difficulty).toBe(difficulty);
        for (let i = 0; i < 10; i++)
          expect(createHash('sha256').update(readFileSync(source)).digest('hex')).toBe(
            lock[`${song}:${difficulty}:${parsed.chartVersion}`],
          );
        count++;
      }
    expect(count).toBe(12);
  });
  it('rejects invalid notes, duplicate IDs, wrong order and invalid versions', () => {
    expect(chartSchema.safeParse(chart).success).toBe(true);
    for (const bad of [
      { ...chart, chartVersion: 1.2 },
      { ...chart, difficulty: 'impossible' },
      { ...chart, notes: [chart.notes[0], chart.notes[0]] },
      { ...chart, notes: [chart.notes[1], chart.notes[0]] },
      { ...chart, notes: [{ ...chart.notes[0], x: 1.1 }] },
      { ...chart, notes: [{ ...chart.notes[0], timeMs: 7000 }] },
      { ...chart, notes: [{ ...chart.notes[0], timeMs: -1 }] },
      { ...chart, notes: [{ ...chart.notes[0], gesture: 'fake' }] },
    ])
      expect(chartSchema.safeParse(bad).success).toBe(false);
  });
});
describe('ranking keys', () => {
  it('isolates chart version and retains each user’s highest score', () => {
    expect(rankingKey('test', 'hard', 2)).toBe('test:hard:2:1');
    const row = { display_name: 'Player', accuracy: 95, max_combo: 5, created_at: '2026-01-01' };
    expect(
      bestPerUser([
        { ...row, user_id: 'a', score: 20 },
        { ...row, user_id: 'b', score: 25 },
        { ...row, user_id: 'a', score: 30 },
      ]).map((r) => [r.user_id, r.score]),
    ).toEqual([
      ['a', 30],
      ['b', 25],
    ]);
  });
});
