import { expect, it } from 'vitest';
import rules from '@/data/score-rules.json';
import {
  GOOD_WINDOW_MS,
  GREAT_WINDOW_MS,
  PERFECT_WINDOW_MS,
  POSITION_RADIUS,
  SCORE_VERSION,
} from '@/game/config';
import { POINTS } from '@/game/scoring';
it('requires a new score version when judgement windows, spatial tolerance or points change', () => {
  expect({
    perfectMs: PERFECT_WINDOW_MS,
    greatMs: GREAT_WINDOW_MS,
    goodMs: GOOD_WINDOW_MS,
    radius: POSITION_RADIUS,
    points: POINTS,
  }).toEqual(rules[String(SCORE_VERSION) as keyof typeof rules]);
});
