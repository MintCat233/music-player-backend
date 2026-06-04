create table if not exists public.together_rooms (
  id text primary key,
  name text not null check (length(btrim(name)) > 0),
  owner_id text not null,
  owner jsonb not null default '{}'::jsonb,
  is_private boolean not null default false,
  password_hash text,
  playlist jsonb not null default '[]'::jsonb,
  playback jsonb not null default jsonb_build_object(
    'currentSongId',
    null,
    'isPlaying',
    false,
    'positionMs',
    0,
    'durationMs',
    0,
    'updatedAt',
    0
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists together_rooms_owner_id_idx
  on public.together_rooms(owner_id);

create index if not exists together_rooms_updated_at_idx
  on public.together_rooms(updated_at desc);

create or replace function public.set_together_rooms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_together_rooms_updated_at
  on public.together_rooms;

create trigger set_together_rooms_updated_at
before update on public.together_rooms
for each row
execute function public.set_together_rooms_updated_at();

alter table public.together_rooms enable row level security;

revoke all on table public.together_rooms from anon, authenticated;
grant all on table public.together_rooms to service_role;
revoke execute on function public.set_together_rooms_updated_at()
  from anon, authenticated;
grant execute on function public.set_together_rooms_updated_at()
  to service_role;
