-- Account-wide battle identity, canonical heroes and observed played position.
-- This checkpoint is locally verified only; apply during the final release.
begin;

create table public.tracker_heroes (
  workspace_id uuid not null references public.tracker_workspaces(id),
  hero_id text not null check (length(hero_id) between 1 and 100),
  game_id text,
  name text not null check (length(trim(name)) between 1 and 80),
  aliases jsonb not null default '[]'::jsonb,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, hero_id),
  check (game_id is null or length(trim(game_id)) between 1 and 100),
  check (jsonb_typeof(aliases) = 'array'),
  check (jsonb_typeof(record) = 'object'),
  check (record->>'id' = hero_id),
  check (record->>'name' = name),
  check (record->>'gameId' is not distinct from game_id)
);
create unique index tracker_hero_game_id
  on public.tracker_heroes(workspace_id, game_id) where game_id is not null;

alter table public.tracker_heroes enable row level security;
revoke all on public.tracker_heroes from public, anon, authenticated;
grant all on public.tracker_heroes to service_role;

create function public.tracker_v2_sync_heroes(wid uuid, records jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(records) <> 'array' then raise exception 'INVALID_HEROES'; end if;
  insert into public.tracker_heroes(
    workspace_id, hero_id, game_id, name, aliases, record
  )
  select wid, h.value->>'id', nullif(h.value->>'gameId', ''),
    h.value->>'name', coalesce(h.value->'aliases', '[]'::jsonb), h.value
  from jsonb_array_elements(records) h(value)
  on conflict (workspace_id, hero_id) do update set
    game_id=excluded.game_id, name=excluded.name, aliases=excluded.aliases,
    record=excluded.record, updated_at=now();
end $$;

-- Build the account hero registry from every stored season. Active metadata is
-- applied last so its canonical labels win while each season keeps its own JSON.
do $$
declare s record;
begin
  for s in
    select workspace_id, metadata->'heroes' heroes
    from public.tracker_seasons
    order by (status = 'active'), created_at
  loop
    perform public.tracker_v2_sync_heroes(s.workspace_id, coalesce(s.heroes, '[]'::jsonb));
  end loop;
end $$;

alter table public.tracker_matches
  add column workspace_id uuid,
  add column battle_id text,
  add column played_position text,
  add column observed_hero_name text,
  add column observed_hero_game_id text;

update public.tracker_matches m set
  workspace_id=s.workspace_id,
  battle_id=nullif(m.record->>'battleId', ''),
  played_position=nullif(m.record->>'playedPosition', ''),
  observed_hero_name=nullif(m.record#>>'{heroObservation,name}', ''),
  observed_hero_game_id=nullif(m.record#>>'{heroObservation,gameId}', '')
from public.tracker_seasons s where s.id=m.season_id;

alter table public.tracker_matches
  alter column workspace_id set not null,
  add constraint tracker_matches_workspace_fk
    foreign key (workspace_id) references public.tracker_workspaces(id),
  add constraint tracker_matches_hero_fk
    foreign key (workspace_id, hero_id)
    references public.tracker_heroes(workspace_id, hero_id),
  add constraint tracker_matches_battle_id_shape
    check (battle_id is null or length(trim(battle_id)) between 1 and 100),
  add constraint tracker_matches_position_shape
    check (played_position is null or played_position in
      ('exp_lane', 'gold_lane', 'mid_lane', 'roam', 'jungle')),
  add constraint tracker_matches_battle_id_record
    check (record->>'battleId' is not distinct from battle_id),
  add constraint tracker_matches_position_record
    check (record->>'playedPosition' is not distinct from played_position),
  add constraint tracker_matches_observed_hero_name_record
    check (record#>>'{heroObservation,name}' is not distinct from observed_hero_name),
  add constraint tracker_matches_observed_hero_id_record
    check (record#>>'{heroObservation,gameId}' is not distinct from observed_hero_game_id);

create unique index tracker_match_battle_id
  on public.tracker_matches(workspace_id, battle_id)
  where battle_id is not null;

create or replace function public.tracker_v2_insert_matches(sid text, records jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare wid uuid;
begin
  if jsonb_typeof(records) <> 'array' then raise exception 'INVALID_MATCHES'; end if;
  select workspace_id into wid from public.tracker_seasons where id=sid;
  if wid is null then raise exception 'INVALID_SEASON'; end if;
  perform public.tracker_v2_sync_heroes(wid, coalesce(
    (select metadata->'heroes' from public.tracker_seasons where id=sid),
    '[]'::jsonb));
  insert into public.tracker_matches(
    season_id, workspace_id, match_id, ordinal, battle_id, player_id, hero_id,
    played_position, observed_hero_name, observed_hero_game_id, played_at,
    mode, result, star_delta, star_delta_present, source, record, created_at,
    updated_at
  )
  select sid, wid, r.value->>'id', (r.ordinality - 1)::integer,
    nullif(r.value->>'battleId', ''), r.value->>'playerId',
    nullif(r.value->>'heroId', ''), nullif(r.value->>'playedPosition', ''),
    nullif(r.value#>>'{heroObservation,name}', ''),
    nullif(r.value#>>'{heroObservation,gameId}', ''),
    (r.value->>'playedAt')::timestamptz, r.value->>'mode', r.value->>'result',
    (r.value->>'starDelta')::integer, r.value ? 'starDelta', r.value->>'source',
    r.value, (r.value->>'createdAt')::timestamptz,
    (r.value->>'updatedAt')::timestamptz
  from jsonb_array_elements(records) with ordinality as r(value, ordinality);
end $$;

revoke execute on function public.tracker_v2_sync_heroes(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.tracker_v2_sync_heroes(uuid,jsonb)
  to service_role;

commit;
