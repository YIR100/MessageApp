-- ============================================================
-- MessageApp — Supabase SQL Schema
-- Run this in your Supabase project:
--   Dashboard → SQL Editor → New Query → paste & run
-- ============================================================

-- 1. PROFILES
--    Extends Supabase's built-in auth.users table.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. CONVERSATIONS
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  name       text,                        -- null for 1:1, required for groups
  is_group   boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table public.conversations enable row level security;

create policy "Authenticated users can create conversations"
  on public.conversations for insert
  with check (auth.uid() = created_by);


-- 3. CONVERSATION MEMBERS
create table public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  joined_at       timestamptz default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_members enable row level security;

create policy "Members can view membership"
  on public.conversation_members for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_members.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "Conversation creator can add members"
  on public.conversation_members for insert
  with check (auth.uid() is not null);


-- 4. MESSAGES
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id       uuid references auth.users(id),
  content         text not null,
  created_at      timestamptz default now()
);
alter table public.messages enable row level security;

create policy "Members can read messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = messages.conversation_id
        and user_id = auth.uid()
    )
  );

create policy "Members can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.conversation_members
      where conversation_id = messages.conversation_id
        and user_id = auth.uid()
    )
  );

-- Enable Realtime for messages
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

-- Add the conversations select policy now that conversation_members exists
create policy "Members can view their conversations"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = conversations.id
        and user_id = auth.uid()
    )
  );