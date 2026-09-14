-- Transactional v2 writes and a temporary legacy adapter for safe rollout.
-- Requires 202609140002_tracker_v2.sql and a completed backfill.
begin;

create function public.tracker_save_v2(
  actor uuid, wid uuid, expected integer, next_state jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  active_id text;
  active_state jsonb;
  archive_entry jsonb;
  archive_state jsonb;
  new_boundary text;
  unknown_boundaries integer;
  next_revision integer := expected + 1;
  canonical jsonb;
  legacy jsonb;
begin
  if not exists(select 1 from public.tracker_members where workspace_id=wid and user_id=actor)
    then raise exception 'FORBIDDEN'; end if;
  if next_state->>'format' <> 'mlbb-manual-tracker'
    or next_state->>'version' <> '2'
    or (next_state->>'revision')::integer <> expected
    or jsonb_typeof(next_state->'matches') <> 'array'
    then raise exception 'INVALID_STATE'; end if;

  select s.id, jsonb_set(s.metadata, '{matches}', coalesce(
    (select jsonb_agg(m.record order by m.ordinal) from public.tracker_matches m where m.season_id=s.id), '[]'::jsonb))
  into active_id, active_state
  from public.tracker_seasons s
  where s.workspace_id=wid and s.status='active'
  for update of s;
  if active_id is null then raise exception 'NOT_MIGRATED'; end if;

  select count(*)::integer into unknown_boundaries
  from jsonb_array_elements(coalesce(next_state->'audit','[]'::jsonb)) e
  where e->'before' ? 'seasonArchive'
    and not exists(select 1 from public.tracker_seasons s
      where s.workspace_id=wid and s.boundary_audit_id=e->>'id');
  if unknown_boundaries > 1 then raise exception 'INVALID_ROLLOVER'; end if;
  if unknown_boundaries = 1 then
    select e.value into archive_entry
    from jsonb_array_elements(next_state->'audit') with ordinality e(value, n)
    where e.value->'before' ? 'seasonArchive'
      and not exists(select 1 from public.tracker_seasons s
        where s.workspace_id=wid and s.boundary_audit_id=e.value->>'id')
    order by e.n desc limit 1;
    archive_state := archive_entry->'before'->'seasonArchive';
    new_boundary := archive_entry->>'id';
    if not (archive_state ?& array['push','players','heroes','matches'])
      or archive_state->'push' <> active_state->'push'
      or archive_state->'players' <> active_state->'players'
      or archive_state->'heroes' <> active_state->'heroes'
      or archive_state->'matches' <> active_state->'matches'
      then raise exception 'INVALID_ROLLOVER'; end if;
  end if;

  canonical := jsonb_set(next_state, '{revision}', to_jsonb(next_revision));
  legacy := jsonb_set(jsonb_set(canonical, '{version}', '1'::jsonb), '{dataset}', '"real"'::jsonb);
  update public.tracker_workspaces
    set state=legacy, revision=next_revision, updated_at=now()
    where id=wid and revision=expected;
  if not found then raise exception 'CONFLICT'; end if;

  if new_boundary is not null then
    update public.tracker_seasons set status='archived', boundary_audit_id=new_boundary,
      source_revision=next_revision, updated_at=now() where id=active_id;
    active_id := wid::text || ':season-after:' || new_boundary;
    insert into public.tracker_seasons(id,workspace_id,status,boundary_audit_id,source_revision,metadata)
      values(active_id,wid,'active',null,next_revision,canonical-'matches');
  else
    update public.tracker_seasons set metadata=canonical-'matches',
      source_revision=next_revision, updated_at=now() where id=active_id;
    delete from public.tracker_matches where season_id=active_id;
  end if;
  perform public.tracker_v2_insert_matches(active_id, canonical->'matches');
  insert into public.tracker_history(workspace_id,revision,actor_id,state)
    values(wid,next_revision,actor,legacy);
  return canonical;
end $$;

-- Existing clients remain consistent only during rollout. The final Worker
-- rejects their write routes; this adapter also provides the tested rollback.
create or replace function public.tracker_save(
  actor uuid, wid uuid, expected integer, next_state jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare canonical jsonb;
declare saved jsonb;
begin
  canonical := jsonb_set(jsonb_set(next_state - 'dataset', '{version}', '2'::jsonb),
    '{revision}', to_jsonb(expected));
  saved := public.tracker_save_v2(actor,wid,expected,canonical);
  return jsonb_set(jsonb_set(saved, '{version}', '1'::jsonb), '{dataset}', '"real"'::jsonb);
end $$;

revoke execute on function public.tracker_save_v2(uuid,uuid,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.tracker_save_v2(uuid,uuid,integer,jsonb)
  to service_role;

commit;
