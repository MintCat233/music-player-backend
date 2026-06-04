create table if not exists public.like_list (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create index if not exists like_list_user_id_idx
  on public.like_list (user_id);

alter table public.like_list enable row level security;
