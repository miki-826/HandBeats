import { z } from 'zod';
import { DIFFICULTIES, GESTURES } from '@/game/types';
export const chartSchema = z
  .object({
    songId: z.string().regex(/^[a-z0-9-]+$/),
    difficulty: z.enum(DIFFICULTIES),
    chartVersion: z.number().int().positive(),
    level: z.number().int().positive(),
    durationMs: z.number().int().positive(),
    offsetMs: z.number().int().min(-2000).max(2000),
    notes: z
      .array(
        z.object({
          id: z.string().min(1),
          timeMs: z.number().int().nonnegative(),
          gesture: z.enum(GESTURES),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
        }),
      )
      .min(1),
  })
  .superRefine((chart, ctx) => {
    const ids = new Set<string>();
    chart.notes.forEach((n, i) => {
      if (ids.has(n.id))
        ctx.addIssue({ code: 'custom', message: 'Duplicate note id', path: ['notes', i, 'id'] });
      ids.add(n.id);
      if (i > 0 && n.timeMs <= chart.notes[i - 1].timeMs)
        ctx.addIssue({
          code: 'custom',
          message: 'Notes must be strictly ascending',
          path: ['notes', i],
        });
      if (
        n.timeMs > chart.durationMs ||
        n.timeMs + chart.offsetMs < 0 ||
        n.timeMs + chart.offsetMs > chart.durationMs
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Note outside audio duration',
          path: ['notes', i],
        });
    });
  });
