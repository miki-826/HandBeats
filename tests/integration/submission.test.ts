import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameEngine } from '@/game/engine';
import type { Chart } from '@/game/types';
import {
  submissionSchema,
  verifySubmission,
  type PlaySession,
  type Submission,
} from '@/lib/validation/submission';
const chart: Chart = {
  songId: 'test-song',
  difficulty: 'easy',
  chartVersion: 1,
  level: 1,
  durationMs: 6000,
  offsetMs: 0,
  notes: [
    { id: 'n1', timeMs: 1000, gesture: 'fist', x: 0.5, y: 0.5 },
    { id: 'n2', timeMs: 2000, gesture: 'gun', x: 0.5, y: 0.5 },
  ],
};
const engine = new GameEngine(chart);
engine.input({ gesture: 'fist', x: 0.5, y: 0.5, timestampMs: 1000, confidence: 1, hand: 'right' });
engine.advance(6000);
const now = Date.now();
const session: PlaySession = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: 'user-1',
  song_id: chart.songId,
  difficulty: 'easy',
  chart_version: 1,
  score_version: 1,
  nonce: 'nonce',
  started_at: new Date(now - 12000).toISOString(),
  expires_at: new Date(now + 600000).toISOString(),
  consumed_at: null,
};
const submission: Submission = {
  playSessionId: session.id,
  songId: chart.songId,
  difficulty: 'easy',
  chartVersion: 1,
  scoreVersion: 1,
  displayName: 'MIKI',
  events: engine.events,
};
describe('server replay validation', () => {
  it('recomputes canonical score from event data', () =>
    expect(verifySubmission(session, submission, chart, 'user-1', now).score).toBe(1000));
  it('rejects forged score fields and excessive payload shape', () =>
    expect(submissionSchema.safeParse({ ...submission, score: 999999 }).success).toBe(false));
  it.each([
    [
      'note id',
      {
        ...submission,
        events: [{ ...submission.events[0], noteId: 'fake' }, submission.events[1]],
      },
    ],
    ['chart version', { ...submission, chartVersion: 2 }],
    [
      'gesture',
      {
        ...submission,
        events: [{ ...submission.events[0], gesture: 'clap' }, submission.events[1]],
      },
    ],
    ['order', { ...submission, events: [...submission.events].reverse() }],
    [
      'offset',
      {
        ...submission,
        events: [{ ...submission.events[0], timingOffsetMs: 30 }, submission.events[1]],
      },
    ],
    [
      'judgement',
      {
        ...submission,
        events: [{ ...submission.events[0], judgement: 'good' }, submission.events[1]],
      },
    ],
    [
      'position',
      { ...submission, events: [{ ...submission.events[0], x: 0 }, submission.events[1]] },
    ],
    ['missing note', { ...submission, events: submission.events.slice(1) }],
  ])('rejects invalid %s', (_, input) =>
    expect(() => verifySubmission(session, input as Submission, chart, 'user-1', now)).toThrow(),
  );
  it('rejects consumed, expired, premature, and foreign sessions', () => {
    expect(() =>
      verifySubmission(
        { ...session, consumed_at: new Date(now).toISOString() },
        submission,
        chart,
        'user-1',
        now,
      ),
    ).toThrow();
    expect(() =>
      verifySubmission(
        { ...session, expires_at: new Date(now - 1).toISOString() },
        submission,
        chart,
        'user-1',
        now,
      ),
    ).toThrow();
    expect(() =>
      verifySubmission(
        { ...session, started_at: new Date(now).toISOString() },
        submission,
        chart,
        'user-1',
        now,
      ),
    ).toThrow();
    expect(() => verifySubmission(session, submission, chart, 'user-2', now)).toThrow();
  });
});

// Route contract tests with an explicit DB/auth adapter mock. Real RLS and atomic SQL
// need the separate Supabase database tests, never claimed by these mocks.
const mocked = vi.hoisted(() => ({ configured: true, consumed: false }));
vi.mock('@/lib/catalog', () => ({ getChart: () => chart }));
vi.mock('@/lib/supabase/server', () => ({
  serverConfigured: () => mocked.configured,
  authenticatedUser: async () => 'user-1',
  admin: () => ({
    from: (table: string) => {
      const query: {
        select: () => unknown;
        eq: () => unknown;
        gte: () => Promise<unknown>;
        insert: () => unknown;
        single: () => Promise<unknown>;
      } = {
        select: () => query,
        eq: () => query,
        gte: async () => ({ count: 0, error: null }),
        insert: () => query,
        single: async () => ({
          data:
            table === 'play_sessions'
              ? { ...session, consumed_at: mocked.consumed ? new Date().toISOString() : null }
              : {},
          error: null,
        }),
      };
      return query;
    },
    rpc: async (name: string) => {
      if (name === 'player_rank') return { data: 1, error: null };
      if (mocked.consumed) return { error: new Error('consumed') };
      mocked.consumed = true;
      return { error: null };
    },
  }),
}));
import { POST as issue } from '@/app/api/play-session/route';
import { POST as submit } from '@/app/api/scores/route';
describe('session / submission routes', () => {
  beforeEach(() => {
    mocked.configured = true;
    mocked.consumed = false;
  });
  it('issues a session; accepts canonical result; rejects reuse', async () => {
    const issued = await issue(
      new Request('http://localhost/api/play-session', {
        method: 'POST',
        body: JSON.stringify({
          songId: chart.songId,
          difficulty: 'easy',
          chartVersion: 1,
          scoreVersion: 1,
        }),
      }),
    );
    expect(issued.status).toBe(200);
    expect((await issued.json()).playSessionId).toBe(session.id);
    const request = () =>
      new Request('http://localhost/api/scores', {
        method: 'POST',
        body: JSON.stringify(submission),
      });
    const accepted = await submit(request());
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).score).toBe(1000);
    expect((await submit(request())).status).toBe(400);
  });
  it('fails cleanly when ranking is not configured', async () => {
    mocked.configured = false;
    expect((await issue(new Request('http://localhost', { method: 'POST' }))).status).toBe(503);
    expect((await submit(new Request('http://localhost', { method: 'POST' }))).status).toBe(503);
  });
});
