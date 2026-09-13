-- Manual tracker storage. Not a FightHistory production schema.
begin;
create table public.tracker_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  state jsonb not null,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
create table public.tracker_members (
  workspace_id uuid not null references public.tracker_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  primary key (workspace_id, user_id)
);
create table public.tracker_history (
  workspace_id uuid not null references public.tracker_workspaces(id),
  revision integer not null,
  actor_id uuid not null references auth.users(id),
  state jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (workspace_id, revision)
);
create table public.tracker_invites (
  token_hash text primary key,
  workspace_id uuid not null references public.tracker_workspaces(id),
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.tracker_workspaces enable row level security;
alter table public.tracker_members enable row level security;
alter table public.tracker_history enable row level security;
alter table public.tracker_invites enable row level security;
revoke all on public.tracker_workspaces, public.tracker_members, public.tracker_history, public.tracker_invites from anon, authenticated;

create function public.tracker_create(actor uuid, initial_state jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare wid uuid;
begin
  insert into public.tracker_workspaces(owner_id, state) values (actor, jsonb_set(initial_state, '{revision}', '0')) returning id into wid;
  insert into public.tracker_members values (wid, actor);
  insert into public.tracker_history(workspace_id, revision, actor_id, state) select wid, 0, actor, state from public.tracker_workspaces where id = wid;
  return wid;
end $$;

create function public.tracker_save(actor uuid, wid uuid, expected integer, next_state jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare saved jsonb;
begin
  if not exists(select 1 from public.tracker_members where workspace_id = wid and user_id = actor) then raise exception 'FORBIDDEN'; end if;
  update public.tracker_workspaces set state = jsonb_set(next_state, '{revision}', to_jsonb(expected + 1)), revision = expected + 1, updated_at = now()
    where id = wid and revision = expected returning state into saved;
  if saved is null then raise exception 'CONFLICT'; end if;
  insert into public.tracker_history(workspace_id, revision, actor_id, state) values (wid, expected + 1, actor, saved);
  return saved;
end $$;

create function public.tracker_join(actor uuid, invite_hash text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare wid uuid;
begin
  delete from public.tracker_invites where token_hash = invite_hash and expires_at > now() returning workspace_id into wid;
  if wid is null then raise exception 'INVALID_INVITE'; end if;
  insert into public.tracker_members values (wid, actor) on conflict do nothing;
  return wid;
end $$;
revoke execute on function public.tracker_create(uuid, jsonb), public.tracker_save(uuid, uuid, integer, jsonb), public.tracker_join(uuid, text) from public, anon, authenticated;
grant execute on function public.tracker_create(uuid, jsonb), public.tracker_save(uuid, uuid, integer, jsonb), public.tracker_join(uuid, text) to service_role;
grant all on public.tracker_workspaces, public.tracker_members, public.tracker_history, public.tracker_invites to service_role;
commit;
