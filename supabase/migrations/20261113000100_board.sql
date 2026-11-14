create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'in_review', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null check (color in ('violet', 'blue', 'green', 'amber', 'rose', 'slate')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 32),
  color text not null check (color in ('violet', 'blue', 'green', 'amber', 'rose', 'slate')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.task_assignees (
  task_id uuid not null,
  member_id uuid not null,
  user_id uuid not null default auth.uid(),
  primary key (task_id, member_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (member_id, user_id) references public.team_members(id, user_id) on delete cascade
);

create table public.task_labels (
  task_id uuid not null,
  label_id uuid not null,
  user_id uuid not null default auth.uid(),
  primary key (task_id, label_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (label_id, user_id) references public.labels(id, user_id) on delete cascade
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);

create table public.task_activity (
  id bigint generated always as identity primary key,
  task_id uuid not null,
  user_id uuid not null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);

create index tasks_by_owner on public.tasks(user_id, created_at desc);
create unique index team_member_names on public.team_members(user_id, lower(btrim(name)));
create unique index label_names on public.labels(user_id, lower(btrim(name)));
create index assignments_by_member on public.task_assignees(member_id);
create index task_labels_by_label on public.task_labels(label_id);
create index comments_by_task on public.comments(task_id, created_at, id);
create index activity_by_task on public.task_activity(task_id, id desc);

do $$
declare
  relation text;
begin
  foreach relation in array array['tasks', 'team_members', 'labels', 'task_assignees', 'task_labels', 'comments', 'task_activity']
  loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on table public.%I from public, anon, authenticated', relation);
    execute format(
      'create policy guest_reads_own on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      relation
    );
    execute format('grant select on table public.%I to authenticated', relation);

    if relation <> 'task_activity' then
      execute format(
        'create policy guest_creates_own on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
        relation
      );
      execute format('grant insert on table public.%I to authenticated', relation);
    end if;

    if relation <> 'task_activity' and relation <> 'comments' then
      execute format(
        'create policy guest_deletes_own on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
        relation
      );
      execute format('grant delete on table public.%I to authenticated', relation);
    end if;
  end loop;
end;
$$;

create policy guest_updates_own on public.tasks for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant update (title, description, status, priority, due_date) on public.tasks to authenticated;

create function public.touch_task() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger touch_task before update on public.tasks for each row execute function public.touch_task();

create function public.record_task_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity(task_id, user_id, action) values (new.id, new.user_id, 'created');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_activity(task_id, user_id, action, details)
    values (new.id, new.user_id, 'moved', jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  if (new.title, new.description, new.priority, new.due_date)
       is distinct from (old.title, old.description, old.priority, old.due_date) then
    insert into public.task_activity(task_id, user_id, action, details)
    values (new.id, new.user_id, 'edited', jsonb_build_object('fields', array_remove(array[
      case when new.title is distinct from old.title then 'title' end,
      case when new.description is distinct from old.description then 'description' end,
      case when new.priority is distinct from old.priority then 'priority' end,
      case when new.due_date is distinct from old.due_date then 'due date' end
    ], null)));
  end if;
  return new;
end;
$$;

create trigger record_task_activity after insert or update on public.tasks
for each row execute function public.record_task_activity();

create function public.record_relation_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  parent_id uuid;
  owner_id uuid;
  item_name text;
  action_name text;
begin
  item := case when tg_op = 'INSERT' then to_jsonb(new) else to_jsonb(old) end;
  parent_id := (item->>'task_id')::uuid;
  owner_id := (item->>'user_id')::uuid;

  -- During a cascading task deletion the activity history is deleted as well.
  if not exists (select 1 from public.tasks where id = parent_id and user_id = owner_id) then
    return null;
  end if;

  if tg_table_name = 'task_assignees' then
    select name into item_name from public.team_members where id = (item->>'member_id')::uuid;
    action_name := case when tg_op = 'INSERT' then 'assigned' else 'unassigned' end;
  else
    select name into item_name from public.labels where id = (item->>'label_id')::uuid;
    action_name := case when tg_op = 'INSERT' then 'label_added' else 'label_removed' end;
  end if;

  insert into public.task_activity(task_id, user_id, action, details)
  values (parent_id, owner_id, action_name, jsonb_build_object('name', item_name));
  return null;
end;
$$;

create trigger record_assignee_activity after insert or delete on public.task_assignees
for each row execute function public.record_relation_activity();
create trigger record_label_activity after insert or delete on public.task_labels
for each row execute function public.record_relation_activity();

revoke execute on function public.touch_task() from public, anon, authenticated;
revoke execute on function public.record_task_activity() from public, anon, authenticated;
revoke execute on function public.record_relation_activity() from public, anon, authenticated;

create function public.save_task(
  task_id uuid, expected_updated_at timestamptz, task_title text, task_description text,
  task_status text, task_priority text, task_due_date date, member_ids uuid[], label_ids uuid[]
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  saved_id uuid;
begin
  if task_id is null then
    insert into public.tasks(title, description, status, priority, due_date)
    values (btrim(task_title), btrim(task_description), task_status, task_priority, task_due_date)
    returning id into saved_id;
  else
    update public.tasks
    set title = btrim(task_title), description = btrim(task_description), status = task_status,
        priority = task_priority, due_date = task_due_date
    where id = task_id and updated_at = expected_updated_at
    returning id into saved_id;
    if saved_id is null then
      raise exception 'This task changed since it was opened. Close it and refresh the board before editing again.'
        using errcode = 'P0001';
    end if;
  end if;

  delete from public.task_assignees as existing
  where existing.task_id = saved_id and not (existing.member_id = any(coalesce(member_ids, '{}')));
  insert into public.task_assignees(task_id, member_id)
  select saved_id, member_id from unnest(member_ids) as wanted(member_id)
  on conflict on constraint task_assignees_pkey do nothing;

  delete from public.task_labels as existing
  where existing.task_id = saved_id and not (existing.label_id = any(coalesce(label_ids, '{}')));
  insert into public.task_labels(task_id, label_id)
  select saved_id, label_id from unnest(label_ids) as wanted(label_id)
  on conflict on constraint task_labels_pkey do nothing;

  return saved_id;
end;
$$;

revoke all on function public.save_task(uuid, timestamptz, text, text, text, text, date, uuid[], uuid[])
from public, anon, authenticated;
grant execute on function public.save_task(uuid, timestamptz, text, text, text, text, date, uuid[], uuid[])
to authenticated;
