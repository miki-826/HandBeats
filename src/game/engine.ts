import { GOOD_WINDOW_MS, POSITION_RADIUS } from './config';
import { distance } from './coordinates';
import { calculateResult, judgeTiming } from './scoring';
import type { Chart, GestureEvent, JudgedEvent } from './types';
export class GameEngine {
  readonly judged = new Map<string, JudgedEvent>();
  private missCursor = 0;
  constructor(readonly chart: Chart) {}
  input(input: GestureEvent): JudgedEvent | undefined {
    let candidate: (typeof this.chart.notes)[number] | undefined;
    let nearest = Infinity;
    for (let i = this.missCursor; i < this.chart.notes.length; i++) {
      const note = this.chart.notes[i];
      const offset = input.timestampMs - (note.timeMs + this.chart.offsetMs);
      if (offset < -GOOD_WINDOW_MS) break;
      if (
        this.judged.has(note.id) ||
        note.gesture !== input.gesture ||
        Math.abs(offset) > GOOD_WINDOW_MS
      )
        continue;
      if (distance(note, input) > POSITION_RADIUS[this.chart.difficulty] || input.confidence < 0.5)
        continue;
      if (Math.abs(offset) < nearest) {
        candidate = note;
        nearest = Math.abs(offset);
      }
    }
    if (!candidate) return;
    const timingOffsetMs = input.timestampMs - (candidate.timeMs + this.chart.offsetMs);
    const event: JudgedEvent = {
      noteId: candidate.id,
      gesture: input.gesture,
      judgedAtMs: input.timestampMs,
      timingOffsetMs,
      judgement: judgeTiming(timingOffsetMs),
      x: input.x,
      y: input.y,
    };
    this.judged.set(candidate.id, event);
    return event;
  }
  advance(timeMs: number): JudgedEvent[] {
    const missed: JudgedEvent[] = [];
    while (this.missCursor < this.chart.notes.length) {
      const note = this.chart.notes[this.missCursor];
      if (timeMs <= note.timeMs + this.chart.offsetMs + GOOD_WINDOW_MS) break;
      if (!this.judged.has(note.id)) {
        const event: JudgedEvent = {
          noteId: note.id,
          gesture: note.gesture,
          judgedAtMs: note.timeMs + this.chart.offsetMs + GOOD_WINDOW_MS + 1,
          timingOffsetMs: GOOD_WINDOW_MS + 1,
          judgement: 'miss',
          x: note.x,
          y: note.y,
        };
        this.judged.set(note.id, event);
        missed.push(event);
      }
      this.missCursor++;
    }
    return missed;
  }
  get events(): JudgedEvent[] {
    return this.chart.notes.flatMap((n) => {
      const e = this.judged.get(n.id);
      return e ? [e] : [];
    });
  }
  get result() {
    return calculateResult(this.events, this.chart.notes.length);
  }
  get combo() {
    let count = 0;
    for (const e of this.events) count = e.judgement === 'miss' ? 0 : count + 1;
    return count;
  }
}
