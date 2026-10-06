create extension if not exists pgcrypto with schema extensions;

create table if not exists public.ledger_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 60),
  kind text not null check (kind in ('trip', 'event', 'household', 'shared-home')),
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.ledger_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 32),
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  category text not null default 'その他',
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  rate_to_base numeric not null check (rate_to_base > 0),
  payer_id uuid not null,
  shares jsonb not null default '[]'::jsonb check (jsonb_typeof(shares) = 'array'),
  memo text not null default '',
  receipt_path text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (group_id, payer_id) references public.group_members(group_id, user_id) on delete cascade
);

create table if not exists public.group_checklist_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  kind text not null check (kind in ('packing', 'todo', 'plan', 'itinerary', 'shopping')),
  completed boolean not null default false,
  assigned_to uuid,
  due_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (group_id, assigned_to) references public.group_members(group_id, user_id) on delete set null (assigned_to)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ledger_groups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create index if not exists group_members_user_idx on public.group_members(user_id);
create index if not exists group_expenses_group_created_idx on public.group_expenses(group_id, created_at desc);
create index if not exists group_checklist_group_created_idx on public.group_checklist_items(group_id, created_at desc);
create index if not exists group_invites_group_idx on public.group_invites(group_id);

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

create or replace function public.create_group(
  p_title text,
  p_kind text,
  p_base_currency text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 60 then raise exception 'Group name must be 1 to 60 characters'; end if;
  if p_kind not in ('trip', 'event', 'household', 'shared-home') then raise exception 'Unsupported group type'; end if;
  if p_base_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be an ISO 4217 code'; end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 32 then raise exception 'Name must be 1 to 32 characters'; end if;

  insert into public.ledger_groups(title, kind, base_currency, owner_id)
  values (trim(p_title), p_kind, p_base_currency, v_user_id)
  returning id into v_group_id;

  insert into public.group_members(group_id, user_id, display_name, role)
  values (v_group_id, v_user_id, trim(p_display_name), 'owner');
  return v_group_id;
end;
$$;

create or replace function public.create_group_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_group_member(p_group_id) then raise exception 'Group access denied'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.group_invites(group_id, token_hash, created_by)
  values (p_group_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), (select auth.uid()));
  return v_token;
end;
$$;

create or replace function public.join_group_by_invite(p_token text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 32 then raise exception 'Name must be 1 to 32 characters'; end if;
  if p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invite link is invalid or expired'; end if;
  select gi.group_id into v_group_id
  from public.group_invites gi
  where gi.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and gi.expires_at > now();
  if v_group_id is null then raise exception 'Invite link is invalid or expired'; end if;
  insert into public.group_members(group_id, user_id, display_name, role)
  values (v_group_id, v_user_id, trim(p_display_name), 'member')
  on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  return v_group_id;
end;
$$;

revoke all on function public.create_group(text, text, text, text) from public;
revoke all on function public.create_group_invite(uuid) from public;
revoke all on function public.join_group_by_invite(text, text) from public;
grant execute on function public.create_group(text, text, text, text) to authenticated;
grant execute on function public.create_group_invite(uuid) to authenticated;
grant execute on function public.join_group_by_invite(text, text) to authenticated;

alter table public.ledger_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_expenses enable row level security;
alter table public.group_checklist_items enable row level security;
alter table public.group_invites enable row level security;

grant select, update on public.ledger_groups to authenticated;
grant select, update on public.group_members to authenticated;
grant select, insert, update, delete on public.group_expenses to authenticated;
grant select, insert, update, delete on public.group_checklist_items to authenticated;

create policy "Members can view their groups" on public.ledger_groups
  for select to authenticated using (public.is_group_member(id));
create policy "Members can update their groups" on public.ledger_groups
  for update to authenticated using (public.is_group_member(id)) with check (public.is_group_member(id));

create policy "Members can view group membership" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "Members can update their own display name" on public.group_members
  for update to authenticated using (user_id = (select auth.uid()) and public.is_group_member(group_id))
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));

create policy "Members can read expenses" on public.group_expenses
  for select to authenticated using (public.is_group_member(group_id));
create policy "Members can add expenses" on public.group_expenses
  for insert to authenticated with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
create policy "Members can update expenses" on public.group_expenses
  for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "Members can delete expenses" on public.group_expenses
  for delete to authenticated using (public.is_group_member(group_id));

create policy "Members can read checklist items" on public.group_checklist_items
  for select to authenticated using (public.is_group_member(group_id));
create policy "Members can add checklist items" on public.group_checklist_items
  for insert to authenticated with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
create policy "Members can update checklist items" on public.group_checklist_items
  for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "Members can delete checklist items" on public.group_checklist_items
  for delete to authenticated using (public.is_group_member(group_id));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('group-receipts', 'group-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "Group members can view receipts" on storage.objects
  for select to authenticated using (
    bucket_id = 'group-receipts'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.is_group_member(split_part(name, '/', 1)::uuid)
  );
create policy "Group members can upload receipts" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'group-receipts'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.is_group_member(split_part(name, '/', 1)::uuid)
  );
create policy "Group members can remove receipts" on storage.objects
  for delete to authenticated using (
    bucket_id = 'group-receipts'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.is_group_member(split_part(name, '/', 1)::uuid)
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ledger_groups') then
      execute 'alter publication supabase_realtime add table public.ledger_groups';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members') then
      execute 'alter publication supabase_realtime add table public.group_members';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_expenses') then
      execute 'alter publication supabase_realtime add table public.group_expenses';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_checklist_items') then
      execute 'alter publication supabase_realtime add table public.group_checklist_items';
    end if;
  end if;
end $$;

