alter table proposals
  add column if not exists consistency_flags     jsonb    not null default '[]'::jsonb,
  add column if not exists consistency_check_ran boolean  not null default false;
