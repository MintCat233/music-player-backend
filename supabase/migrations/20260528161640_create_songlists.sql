create table if not exists public.songlists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.songlist_songs (
  id uuid primary key default gen_random_uuid(),
  songlist_id uuid not null references public.songlists(id) on delete cascade,
  song_id text not null,
  created_at timestamptz not null default now(),
  unique (songlist_id, song_id)
);

create index if not exists songlists_user_id_idx
  on public.songlists (user_id);

create index if not exists songlist_songs_songlist_id_idx
  on public.songlist_songs (songlist_id);

alter table public.songlists enable row level security;
alter table public.songlist_songs enable row level security;

create or replace function public.set_songlists_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_songlists_updated_at on public.songlists;

create trigger set_songlists_updated_at
before update on public.songlists
for each row
execute function public.set_songlists_updated_at();;
