-- Retire generic platform entry points without deleting any user data.
-- Apply after the private-push Worker is deployed. No CASCADE: unexpected
-- dependencies must stop this migration instead of removing related objects.
begin;
drop function public.tracker_join(uuid, text);
drop function public.tracker_create(uuid, jsonb);
revoke all on public.tracker_invites from service_role;
-- Keep the invite rows until final archival review, along with all workspace,
-- membership and immutable history rows. tracker_save remains unchanged.
commit;
