create function public.load_example_board(board_date date) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  example record;
  new_task uuid;
begin
  if owner_id is null then
    raise exception 'Sign in to load the example board.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if exists (select 1 from public.tasks where user_id = owner_id) then
    raise exception 'The example board can only be loaded into an empty board.';
  end if;

  insert into public.team_members(name, color) values
    ('Maya Chen', 'violet'), ('Jordan Lee', 'blue'), ('Sam Rivera', 'green'), ('Alex Kim', 'amber')
  on conflict do nothing;

  insert into public.labels(name, color) values
    ('Design', 'violet'), ('Research', 'blue'), ('Product', 'green'),
    ('Engineering', 'amber'), ('Content', 'rose')
  on conflict do nothing;

  for example in select * from (values
    ('Define onboarding goals', 'Outline the first-session outcomes and decide how we will measure activation.', 'todo', 'high', 1, 'Maya Chen', 'Product'),
    ('Audit empty states', 'Inventory empty states and capture where guidance could be clearer.', 'todo', 'normal', 5, 'Jordan Lee', 'Design'),
    ('Draft launch checklist', 'Collect owners and dependencies for the launch plan.', 'todo', 'low', null, 'Alex Kim', 'Content'),
    ('Design the task detail panel', 'Explore layouts for task information, comments, and activity.', 'in_progress', 'high', 0, 'Maya Chen', 'Design'),
    ('Map the guest sign-in flow', 'Document the first visit and session recovery states.', 'in_progress', 'normal', 2, 'Sam Rivera', 'Engineering'),
    ('Review board navigation', 'Check the workspace navigation on desktop and mobile.', 'in_review', 'normal', -1, 'Jordan Lee', 'Design'),
    ('Synthesize discovery notes', 'Summarize the recurring themes from the first round of interviews.', 'in_review', 'low', 4, 'Alex Kim', 'Research'),
    ('Create the project workspace', 'Set up the project and agree on the first set of milestones.', 'done', 'normal', -5, 'Sam Rivera', 'Product'),
    ('Agree on the release scope', 'Capture the features that belong in the first public release.', 'done', 'low', null, 'Maya Chen', 'Product')
  ) as data(title, description, status, priority, days_until_due, member_name, label_name)
  loop
    new_task := public.save_task(null, null, example.title, example.description, example.status,
      example.priority, coalesce(board_date, current_date) + example.days_until_due,
      array(select id from public.team_members where user_id = owner_id and lower(btrim(name)) = lower(example.member_name)),
      array(select id from public.labels where user_id = owner_id and lower(btrim(name)) = lower(example.label_name)));
    if example.title = 'Design the task detail panel' then
      insert into public.comments(task_id, body) values (new_task, 'Check that the panel also works on small screens.');
    end if;
  end loop;
end;
$$;

revoke all on function public.load_example_board(date) from public, anon, authenticated;
grant execute on function public.load_example_board(date) to authenticated;
