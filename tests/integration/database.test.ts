import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let db: PGlite;
const user = '11111111-1111-4111-8111-111111111111';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated; insert into auth.users(id) values('${user}');`,
  );
  await db.exec(readFileSync('supabase/migrations/001_hand_beat.sql', 'utf8'));
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function newSession(nonce: string) {
  return (
    await db.query<{ id: string }>(
      `insert into public.play_sessions(user_id,song_id,difficulty,chart_version,score_version,nonce,expires_at) values($1,'song-01','normal',1,1,$2,now()+interval '10 minutes') returning id`,
      [user, nonce],
    )
  ).rows[0].id;
}
const register = (id: string, score = 1000) =>
  db.query(`select public.submit_verified_score($1,$2,'MIKI',$3,1,1,0,0,0,100)`, [id, user, score]);
describe('PostgreSQL migration security and ranking (PGlite)', () => {
  it('enables RLS on all three tables', async () => {
    const result = await db.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relname in ('profiles','scores','play_sessions')`,
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it('atomically consumes a session, rejects reuse, and preserves only best score in ranking', async () => {
    const first = await newSession('first');
    await register(first, 1000);
    await expect(register(first, 1000)).rejects.toThrow();
    const second = await newSession('second');
    await register(second, 2000);
    const lower = await newSession('lower');
    await register(lower, 500);
    const ranking = await db.query<{ score: number; display_name: string }>(
      `select * from public.rankings`,
    );
    expect(ranking.rows).toHaveLength(1);
    expect(ranking.rows[0]).toMatchObject({ score: 2000, display_name: 'MIKI' });
    const place = await db.query<{ place: number }>(
      `select public.player_rank($1,'song-01','normal',1,1) as place`,
      [user],
    );
    expect(Number(place.rows[0].place)).toBe(1);
  });
  it('rolls back consumption when the score insert fails', async () => {
    const id = await newSession('rollback');
    await expect(register(id, -1)).rejects.toThrow();
    const row = await db.query<{ consumed_at: string | null }>(
      `select consumed_at from play_sessions where id=$1`,
      [id],
    );
    expect(row.rows[0].consumed_at).toBeNull();
    await register(id, 1000);
  });
  it('rejects expired sessions in the final atomic transaction', async () => {
    const id = await newSession('expired');
    await db.query(`update play_sessions set expires_at=now()-interval '1 second' where id=$1`, [
      id,
    ]);
    await expect(register(id)).rejects.toThrow();
  });
  it('denies browser writes, session reads, and privileged RPC execution', async () => {
    await db.exec('set role authenticated');
    try {
      await expect(db.query('select * from play_sessions')).rejects.toThrow();
      await expect(db.query('delete from scores')).rejects.toThrow();
      await expect(db.query('update scores set score=999999')).rejects.toThrow();
      await expect(db.query(`insert into scores(score) values(999999)`)).rejects.toThrow();
      await expect(register('00000000-0000-4000-8000-000000000001')).rejects.toThrow();
      expect((await db.query('select * from rankings')).rows).toHaveLength(1);
    } finally {
      await db.exec('reset role');
    }
  });
  it('only permits the profile owner to change their display name', async () => {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);`,
    );
    try {
      expect(
        (
          await db.query(`update profiles set display_name='FORGED' where id=$1 returning id`, [
            user,
          ])
        ).rows,
      ).toHaveLength(0);
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [user]);
      expect(
        (
          await db.query(`update profiles set display_name='NEW NAME' where id=$1 returning id`, [
            user,
          ])
        ).rows,
      ).toHaveLength(1);
    } finally {
      await db.exec('reset role');
    }
  });
});
