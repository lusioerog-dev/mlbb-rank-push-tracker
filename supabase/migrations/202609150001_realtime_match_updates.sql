-- Let authenticated workspace members receive match invalidations through
-- Supabase Realtime without exposing membership or privileged write access.
begin;

create function public.tracker_is_member(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tracker_members
    where workspace_id = wid and user_id = auth.uid()
  )
$$;

revoke execute on function public.tracker_is_member(uuid) from public, anon;
grant execute on function public.tracker_is_member(uuid) to authenticated;

create policy tracker_matches_member_realtime
  on public.tracker_matches for select to authenticated
  using (public.tracker_is_member(workspace_id));
grant select on public.tracker_matches to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'tracker_matches'
    ) then
    alter publication supabase_realtime add table public.tracker_matches;
  end if;
end $$;

commit;
