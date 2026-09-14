-- Additive normalized tracker storage. Apply only after a fresh backup.
-- This migration does not switch or remove the legacy write path.
begin;

create table public.tracker_seasons (
  id text primary key,
  workspace_id uuid not null references public.tracker_workspaces(id),
  status text not null check (status in ('active', 'archived')),
  boundary_audit_id text,
  source_revision integer not null check (source_revision >= 0),
  metadata jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, boundary_audit_id),
  check (jsonb_typeof(metadata) = 'object'),
  check (not (metadata ? 'matches'))
);
create unique index tracker_one_active_season
  on public.tracker_seasons(workspace_id) where status = 'active';

create table public.tracker_matches (
  season_id text not null references public.tracker_seasons(id),
  match_id text not null,
  ordinal integer not null check (ordinal >= 0),
  player_id text not null check (length(player_id) between 1 and 100),
  hero_id text,
  played_at timestamptz not null,
  mode text not null check (mode in ('ranked', 'classic', 'unknown')),
  result text not null check (result in ('win', 'loss', 'draw', 'unknown')),
  star_delta integer check (star_delta between -10000 and 10000),
  star_delta_present boolean not null,
  source text not null check (source in ('manual', 'screenshot_review')),
  record jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (season_id, match_id),
  unique (season_id, ordinal),
  unique (season_id, played_at),
  check (jsonb_typeof(record) = 'object'),
  check (record->>'id' = match_id),
  check (record->>'playerId' = player_id),
  check ((record->>'playedAt')::timestamptz = played_at),
  check (record->>'mode' = mode),
  check (record->>'result' = result),
  check ((record ? 'starDelta') = star_delta_present),
  check (record->>'source' = source),
  check ((record->>'createdAt')::timestamptz = created_at),
  check ((record->>'updatedAt')::timestamptz = updated_at)
);

alter table public.tracker_seasons enable row level security;
alter table public.tracker_matches enable row level security;
revoke all on public.tracker_seasons, public.tracker_matches from public, anon, authenticated;
grant all on public.tracker_seasons, public.tracker_matches to service_role;

create function public.tracker_v2_insert_matches(sid text, records jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(records) <> 'array' then raise exception 'INVALID_MATCHES'; end if;
  insert into public.tracker_matches(
    season_id, match_id, ordinal, player_id, hero_id, played_at, mode, result,
    star_delta, star_delta_present, source, record, created_at, updated_at
  )
  select sid, r.value->>'id', (r.ordinality - 1)::integer,
    r.value->>'playerId', nullif(r.value->>'heroId', ''),
    (r.value->>'playedAt')::timestamptz, r.value->>'mode', r.value->>'result',
    (r.value->>'starDelta')::integer, r.value ? 'starDelta', r.value->>'source',
    r.value, (r.value->>'createdAt')::timestamptz,
    (r.value->>'updatedAt')::timestamptz
  from jsonb_array_elements(records) with ordinality as r(value, ordinality);
end $$;

create function public.tracker_backfill_v2(wid uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  snapshot jsonb;
  source_rev integer;
  entry jsonb;
  archive jsonb;
  boundary text;
  sid text;
begin
  select state, revision into snapshot, source_rev
    from public.tracker_workspaces where id = wid for update;
  if snapshot is null then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from public.tracker_seasons where workspace_id = wid)
    then raise exception 'ALREADY_BACKFILLED'; end if;

  for entry in select value from jsonb_array_elements(coalesce(snapshot->'audit', '[]'::jsonb)) loop
    if entry->'before' ? 'seasonArchive' then
      archive := entry->'before'->'seasonArchive';
      boundary := entry->>'id';
      if not (archive ?& array['push','players','heroes','matches'])
        then raise exception 'INVALID_ARCHIVE'; end if;
      sid := wid::text || ':season-before:' || boundary;
      insert into public.tracker_seasons(id, workspace_id, status, boundary_audit_id, source_revision, metadata)
      values (sid, wid, 'archived', boundary, source_rev,
        jsonb_build_object('format', snapshot->'format', 'version', 2, 'revision', 0,
          'push', archive->'push', 'players', archive->'players',
          'heroes', archive->'heroes', 'audit', '[]'::jsonb));
      perform public.tracker_v2_insert_matches(sid, archive->'matches');
    end if;
  end loop;

  sid := wid::text || ':season-after:' || coalesce(boundary, 'initial');
  insert into public.tracker_seasons(id, workspace_id, status, boundary_audit_id, source_revision, metadata)
  values (sid, wid, 'active', null, source_rev,
    jsonb_set(snapshot - 'matches' - 'dataset', '{version}', '2'::jsonb));
  perform public.tracker_v2_insert_matches(sid, snapshot->'matches');
  return jsonb_build_object('workspaceId', wid, 'revision', source_rev,
    'seasons', (select count(*) from public.tracker_seasons where workspace_id = wid),
    'matches', (select count(*) from public.tracker_matches m join public.tracker_seasons s on s.id=m.season_id where s.workspace_id=wid));
end $$;

create function public.tracker_load_v2(actor uuid, wid uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.tracker_members where workspace_id=wid and user_id=actor)
    then raise exception 'FORBIDDEN'; end if;
  select jsonb_set(s.metadata, '{matches}', coalesce(
    (select jsonb_agg(m.record order by m.ordinal) from public.tracker_matches m where m.season_id=s.id), '[]'::jsonb))
    into result from public.tracker_seasons s where s.workspace_id=wid and s.status='active';
  if result is null then raise exception 'NOT_MIGRATED'; end if;
  return result;
end $$;

revoke execute on function public.tracker_v2_insert_matches(text,jsonb),
  public.tracker_backfill_v2(uuid), public.tracker_load_v2(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.tracker_v2_insert_matches(text,jsonb),
  public.tracker_backfill_v2(uuid), public.tracker_load_v2(uuid,uuid)
  to service_role;

commit;
