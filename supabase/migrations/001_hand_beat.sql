create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.play_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  song_id text not null, difficulty text not null check (difficulty in ('easy','normal','hard')),
  chart_version int not null check(chart_version>0), score_version int not null check(score_version>0),
  nonce text not null unique, started_at timestamptz not null default now(), expires_at timestamptz not null, consumed_at timestamptz
);
create index sessions_user_started on public.play_sessions(user_id,started_at desc);
create table public.scores (
  id uuid primary key default gen_random_uuid(), session_id uuid not null unique references public.play_sessions(id),
  user_id uuid not null references public.profiles(id) on delete cascade, song_id text not null, difficulty text not null,
  chart_version int not null, score_version int not null, score int not null check(score>=0), max_combo int not null check(max_combo>=0),
  perfect_count int not null check(perfect_count>=0), great_count int not null check(great_count>=0), good_count int not null check(good_count>=0), miss_count int not null check(miss_count>=0),
  accuracy numeric not null check(accuracy between 0 and 100), created_at timestamptz not null default now()
);
create index score_ranking on public.scores(song_id,difficulty,chart_version,score_version,score desc,user_id);
alter table public.profiles enable row level security;
alter table public.play_sessions enable row level security;
alter table public.scores enable row level security;
create policy profiles_read on public.profiles for select using (true);
create policy profiles_self_update on public.profiles for update to authenticated using(auth.uid()=id) with check(auth.uid()=id);
create policy scores_read on public.scores for select using(true);
revoke all on public.play_sessions from anon, authenticated;
revoke insert,update,delete on public.scores from anon,authenticated;
revoke insert,update,delete on public.profiles from anon,authenticated;
grant select on public.scores,public.profiles to anon,authenticated;
grant update(display_name,updated_at) on public.profiles to authenticated;
grant all on public.profiles,public.scores,public.play_sessions to service_role;

create view public.rankings with (security_invoker=true) as
select distinct on(s.song_id,s.difficulty,s.chart_version,s.score_version,s.user_id)
  s.user_id,p.display_name,s.song_id,s.difficulty,s.chart_version,s.score_version,s.score,s.accuracy,s.max_combo,s.created_at
from public.scores s join public.profiles p on p.id=s.user_id
order by s.song_id,s.difficulty,s.chart_version,s.score_version,s.user_id,s.score desc,s.accuracy desc,s.created_at asc;
grant select on public.rankings to anon,authenticated;

-- Only the server role can call this function. Consumption and insertion are atomic.
create function public.submit_verified_score(p_session_id uuid,p_user_id uuid,p_display_name text,p_score int,p_max_combo int,p_perfect int,p_great int,p_good int,p_miss int,p_accuracy numeric)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.play_sessions%rowtype;
begin
  select * into s from public.play_sessions where id=p_session_id for update;
  if not found or s.user_id<>p_user_id or s.consumed_at is not null or s.expires_at<now() then raise exception 'Invalid or consumed session'; end if;
  insert into public.profiles(id,display_name) values(p_user_id,p_display_name)
    on conflict(id) do update set display_name=excluded.display_name,updated_at=now();
  insert into public.scores(session_id,user_id,song_id,difficulty,chart_version,score_version,score,max_combo,perfect_count,great_count,good_count,miss_count,accuracy)
    values(s.id,p_user_id,s.song_id,s.difficulty,s.chart_version,s.score_version,p_score,p_max_combo,p_perfect,p_great,p_good,p_miss,p_accuracy);
  update public.play_sessions set consumed_at=now() where id=s.id;
end; $$;
revoke all on function public.submit_verified_score(uuid,uuid,text,int,int,int,int,int,int,numeric) from public,anon,authenticated;
grant execute on function public.submit_verified_score(uuid,uuid,text,int,int,int,int,int,int,numeric) to service_role;

create function public.player_rank(p_user_id uuid,p_song_id text,p_difficulty text,p_chart_version int,p_score_version int)
returns bigint language sql stable security invoker set search_path=public,pg_temp as $$
  select place from (
    select user_id,row_number() over(order by score desc,accuracy desc,created_at asc,user_id asc) as place
    from public.rankings where song_id=p_song_id and difficulty=p_difficulty and chart_version=p_chart_version and score_version=p_score_version
  ) ranked where user_id=p_user_id;
$$;
revoke all on function public.player_rank(uuid,text,text,int,int) from public,anon,authenticated;
grant execute on function public.player_rank(uuid,text,text,int,int) to service_role;
