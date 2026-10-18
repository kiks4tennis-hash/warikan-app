-- Keep shared groups for the remaining members while removing the current user's
-- account-linked data. Receipt object paths are queued for deletion by the
-- delete-account Edge Function using the Storage API.
create table if not exists public.account_deletion_storage_queue (
  user_id uuid not null,
  object_path text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, object_path)
);

alter table public.account_deletion_storage_queue enable row level security;
revoke all on table public.account_deletion_storage_queue from public, anon, authenticated;
grant select, delete on table public.account_deletion_storage_queue to service_role;

create or replace function public.prepare_my_account_deletion()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_owned_group record;
  v_delete_group_ids uuid[] := '{}'::uuid[];
  v_keep_group_ids uuid[] := '{}'::uuid[];
  v_object_paths text[] := '{}'::text[];
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  -- Transfer owned groups to the earliest remaining member. A group with no
  -- other members is deleted, including all of its ledger records.
  for v_owned_group in
    select
      g.id,
      (
        select gm.user_id
        from public.group_members gm
        where gm.group_id = g.id and gm.user_id <> v_user_id
        order by gm.joined_at asc, gm.user_id asc
        limit 1
      ) as successor_id
    from public.ledger_groups g
    where g.owner_id = v_user_id
  loop
    if v_owned_group.successor_id is null then
      v_delete_group_ids := array_append(v_delete_group_ids, v_owned_group.id);
    else
      update public.ledger_groups
      set owner_id = v_owned_group.successor_id
      where id = v_owned_group.id;

      update public.group_members
      set role = 'owner'
      where group_id = v_owned_group.id and user_id = v_owned_group.successor_id;
    end if;
  end loop;

  select coalesce(array_agg(gm.group_id), '{}'::uuid[])
  into v_keep_group_ids
  from public.group_members gm
  where gm.user_id = v_user_id
    and not (gm.group_id = any(v_delete_group_ids));

  -- Save receipt paths before deleting their expense rows or groups. This
  -- queue makes a partially failed Storage deletion safe to retry.
  insert into public.account_deletion_storage_queue(user_id, object_path)
  select v_user_id, e.receipt_path
  from public.group_expenses e
  where e.receipt_path is not null
    and (
      e.created_by = v_user_id
      or e.payer_id = v_user_id
      or e.group_id = any(v_delete_group_ids)
    )
  on conflict (user_id, object_path) do nothing;

  -- In expenses that remain, remove the former member from the split. The
  -- app's weighted allocator redistributes the amount among remaining active
  -- members. If none remain, assign the expense to its payer.
  with cleaned as (
    select
      e.id,
      e.payer_id,
      coalesce(
        jsonb_agg(item.value order by item.ordinality)
          filter (where item.value ->> 'memberId' <> v_user_id::text),
        '[]'::jsonb
      ) as shares
    from public.group_expenses e
    cross join lateral jsonb_array_elements(e.shares) with ordinality as item(value, ordinality)
    where e.group_id = any(v_keep_group_ids)
      and e.created_by <> v_user_id
      and e.payer_id <> v_user_id
    group by e.id, e.payer_id
  )
  update public.group_expenses e
  set shares = case
    when exists (
      select 1
      from jsonb_array_elements(cleaned.shares) remaining(value)
      where coalesce((remaining.value ->> 'excluded')::boolean, false) = false
        and coalesce((remaining.value ->> 'weight')::numeric, 0) > 0
    ) then cleaned.shares
    else jsonb_build_array(jsonb_build_object(
      'memberId', cleaned.payer_id::text,
      'weight', 1,
      'excluded', false
    ))
  end
  from cleaned
  where e.id = cleaned.id;

  -- Remove the user's own entries from retained groups. Expenses they paid
  -- are also removed because the payer identity is part of the ledger.
  delete from public.group_expenses e
  where e.group_id = any(v_keep_group_ids)
    and (e.created_by = v_user_id or e.payer_id = v_user_id);

  delete from public.ledger_groups g
  where g.id = any(v_delete_group_ids);

  -- Assigned checklist entries become unassigned via the FK; entries created
  -- by this user are removed later when the Auth user is deleted.
  delete from public.group_members gm where gm.user_id = v_user_id;

  select coalesce(array_agg(q.object_path), '{}'::text[])
  into v_object_paths
  from public.account_deletion_storage_queue q
  where q.user_id = v_user_id;

  return v_object_paths;
end;
$$;

revoke all on function public.prepare_my_account_deletion() from public, anon;
grant execute on function public.prepare_my_account_deletion() to authenticated;
