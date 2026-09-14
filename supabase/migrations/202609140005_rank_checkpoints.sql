-- Explicit rank targets and confirmed match-boundary rank checkpoints.
-- This checkpoint is locally verified only; apply during the final release.
begin;

create table public.tracker_rank_targets (
  season_id text primary key references public.tracker_seasons(id) on delete cascade,
  workspace_id uuid not null references public.tracker_workspaces(id),
  tier text not null check (tier in
    ('Warrior', 'Elite', 'Master', 'Grandmaster', 'Epic', 'Legend', 'Mythic')),
  division integer,
  stars integer not null check (stars between 0 and 1000000),
  rules_version text not null,
  source text not null check (source in ('explicit', 'legacy_mythic_target')),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  updated_at timestamptz not null default now(),
  check ((tier = 'Mythic') = (division is null)),
  check (division is null or division between 1 and
    case tier when 'Warrior' then 3 when 'Elite' then 3
      when 'Master' then 4 else 5 end),
  check (tier = 'Mythic' or stars <=
    case tier when 'Warrior' then 3 when 'Elite' then 4
      when 'Master' then 4 else 5 end),
  check (rules_version = 'mlbb-stars-2026-09'),
  check (record->>'tier' = tier),
  check ((record->>'division')::integer is not distinct from division),
  check ((record->>'stars')::integer = stars),
  check (record->>'rulesVersion' = rules_version)
);

create table public.tracker_rank_checkpoints (
  season_id text not null,
  match_id text not null,
  workspace_id uuid not null references public.tracker_workspaces(id),
  kind text not null check (kind in ('placement', 'observation', 'correction', 'legacy')),
  tier text not null check (tier in
    ('Warrior', 'Elite', 'Master', 'Grandmaster', 'Epic', 'Legend', 'Mythic')),
  division integer,
  stars integer not null check (stars between 0 and 1000000),
  rules_version text not null,
  confirmed_at timestamptz not null,
  reason text not null check (length(trim(reason)) between 1 and 300),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  primary key (season_id, match_id),
  foreign key (season_id, match_id)
    references public.tracker_matches(season_id, match_id) on delete cascade,
  check ((tier = 'Mythic') = (division is null)),
  check (division is null or division between 1 and
    case tier when 'Warrior' then 3 when 'Elite' then 3
      when 'Master' then 4 else 5 end),
  check (tier = 'Mythic' or stars <=
    case tier when 'Warrior' then 3 when 'Elite' then 4
      when 'Master' then 4 else 5 end),
  check (rules_version = 'mlbb-stars-2026-09'),
  check (record->>'kind' = kind),
  check (record#>>'{position,tier}' = tier),
  check ((record#>>'{position,division}')::integer is not distinct from division),
  check ((record#>>'{position,stars}')::integer = stars),
  check (record#>>'{position,rulesVersion}' = rules_version),
  check ((record->>'confirmedAt')::timestamptz = confirmed_at),
  check (record->>'reason' = reason)
);

alter table public.tracker_rank_targets enable row level security;
alter table public.tracker_rank_checkpoints enable row level security;
revoke all on public.tracker_rank_targets, public.tracker_rank_checkpoints
  from public, anon, authenticated;
grant all on public.tracker_rank_targets, public.tracker_rank_checkpoints
  to service_role;

create function public.tracker_v2_sync_target(sid text) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  target jsonb;
  metadata jsonb;
  wid uuid;
  target_source text := 'explicit';
begin
  select s.metadata, s.workspace_id into metadata, wid
    from public.tracker_seasons s where s.id=sid;
  if wid is null then raise exception 'INVALID_SEASON'; end if;
  target := metadata#>'{push,targetRank}';
  if target is null or target = 'null'::jsonb then
    if metadata#>>'{push,startingRank,tier}' = 'Mythic'
      and jsonb_typeof(metadata#>'{push,targetStars}') = 'number' then
      target := jsonb_build_object(
        'tier', 'Mythic', 'division', null,
        'stars', (metadata#>>'{push,targetStars}')::integer,
        'rulesVersion', metadata#>>'{push,startingRank,rulesVersion}');
      target_source := 'legacy_mythic_target';
    else
      delete from public.tracker_rank_targets where season_id=sid;
      return;
    end if;
  end if;
  if jsonb_typeof(target) <> 'object' then raise exception 'INVALID_RANK_TARGET'; end if;
  insert into public.tracker_rank_targets(
    season_id, workspace_id, tier, division, stars, rules_version, source, record
  ) values (
    sid, wid, target->>'tier', (target->>'division')::integer,
    (target->>'stars')::integer, target->>'rulesVersion', target_source, target
  ) on conflict (season_id) do update set
    tier=excluded.tier, division=excluded.division, stars=excluded.stars,
    rules_version=excluded.rules_version, source=excluded.source,
    record=excluded.record, updated_at=now();
end $$;

create function public.tracker_v2_sync_checkpoint(
  sid text, mid text, wid uuid, match_record jsonb
) returns void
language plpgsql security invoker set search_path = '' as $$
declare checkpoint jsonb;
begin
  checkpoint := match_record->'rankCheckpoint';
  delete from public.tracker_rank_checkpoints
    where season_id=sid and match_id=mid;
  if checkpoint is null or checkpoint = 'null'::jsonb then
    if match_record ? 'mythicCheckpoint' then
      checkpoint := jsonb_build_object(
        'kind', 'legacy',
        'position', jsonb_build_object(
          'tier', 'Mythic', 'division', null,
          'stars', (match_record->>'mythicCheckpoint')::integer,
          'rulesVersion', 'mlbb-stars-2026-09'),
        'confirmedAt', match_record->>'updatedAt',
        'reason', 'Legacy Mythic checkpoint');
    else
      return;
    end if;
  end if;
  if jsonb_typeof(checkpoint) <> 'object'
    or jsonb_typeof(checkpoint->'position') <> 'object'
    then raise exception 'INVALID_RANK_CHECKPOINT'; end if;
  insert into public.tracker_rank_checkpoints(
    season_id, match_id, workspace_id, kind, tier, division, stars,
    rules_version, confirmed_at, reason, record
  ) values (
    sid, mid, wid, checkpoint->>'kind', checkpoint#>>'{position,tier}',
    (checkpoint#>>'{position,division}')::integer,
    (checkpoint#>>'{position,stars}')::integer,
    checkpoint#>>'{position,rulesVersion}',
    (checkpoint->>'confirmedAt')::timestamptz, checkpoint->>'reason', checkpoint
  );
end $$;

create function public.tracker_v2_season_target_trigger() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.tracker_v2_sync_target(new.id);
  return new;
end $$;
create trigger tracker_v2_season_target_after_write
after insert or update of metadata on public.tracker_seasons
for each row execute function public.tracker_v2_season_target_trigger();

create function public.tracker_v2_checkpoint_trigger() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.tracker_v2_sync_checkpoint(
    new.season_id, new.match_id, new.workspace_id, new.record);
  return new;
end $$;
create trigger tracker_v2_checkpoint_after_write
after insert or update of record on public.tracker_matches
for each row execute function public.tracker_v2_checkpoint_trigger();

do $$
declare s record;
declare m record;
begin
  for s in select id from public.tracker_seasons loop
    perform public.tracker_v2_sync_target(s.id);
  end loop;
  for m in select season_id, match_id, workspace_id, record
    from public.tracker_matches loop
    perform public.tracker_v2_sync_checkpoint(
      m.season_id, m.match_id, m.workspace_id, m.record);
  end loop;
end $$;

revoke execute on function public.tracker_v2_sync_target(text),
  public.tracker_v2_sync_checkpoint(text,text,uuid,jsonb),
  public.tracker_v2_season_target_trigger(),
  public.tracker_v2_checkpoint_trigger()
  from public, anon, authenticated;
grant execute on function public.tracker_v2_sync_target(text),
  public.tracker_v2_sync_checkpoint(text,text,uuid,jsonb),
  public.tracker_v2_season_target_trigger(),
  public.tracker_v2_checkpoint_trigger()
  to service_role;

commit;
