-- Read-only, one PostgreSQL statement snapshot. Save the full backup cell as
-- private JSON and record backup_md5 separately. Excludes Auth credentials and
-- retired invitations; this is an application-data backup, not a project dump.
with snapshot as (
  select jsonb_build_object(
    'workspaces', (select jsonb_agg(to_jsonb(w) order by w.id) from public.tracker_workspaces w),
    'members', (select jsonb_agg(to_jsonb(m) order by m.workspace_id,m.user_id) from public.tracker_members m),
    'history', (select jsonb_agg(to_jsonb(h) order by h.workspace_id,h.revision) from public.tracker_history h)
  ) as backup
)
select backup, md5(backup::text) as backup_md5 from snapshot;
