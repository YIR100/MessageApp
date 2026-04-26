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

-- Helper to avoid infinite recursion in conversation_members RLS.
-- (Policies on conversation_members cannot safely subquery conversation_members.)
create or replace function public.is_conversation_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = cid
      and cm.user_id = auth.uid()
  );
$$;

create policy "Members can view membership"
  on public.conversation_members for select
  using (
    user_id = auth.uid() or
    public.is_conversation_member(conversation_id)
  );

create policy "Conversation creator can add members"
  on public.conversation_members for insert
  with check (auth.uid() is not null);


-- 4. MESSAGES
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id       uuid references public.profiles(id),
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
    created_by = auth.uid() OR
    exists (
      select 1 from public.conversation_members
      where conversation_id = conversations.id
        and user_id = auth.uid()
    )
  );
-- ============================================================
-- ADDITIONS FOR MEDIA, READ RECEIPTS, EDIT/DELETE
-- ============================================================

-- 1. Add support for Media Attachments, Editing, and Deleting Messages
ALTER TABLE public.messages
ADD COLUMN media_url text,
ADD COLUMN updated_at timestamptz,
ADD COLUMN is_deleted boolean DEFAULT false;

-- 2. Create the attachments storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attachments', 'attachments', true);

-- 3. Storage Policies for the attachments bucket
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attachments' AND 
  auth.uid() = owner
);

CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'attachments');

CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'attachments' AND 
  auth.uid() = owner
);

-- 4. Create Read Receipts table
CREATE TABLE public.message_reads (
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- 5. Read Receipts Policies
CREATE POLICY "Users can insert their own read receipts"
ON public.message_reads FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view read receipts for their conversations"
ON public.message_reads FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON m.conversation_id = cm.conversation_id
    WHERE m.id = message_reads.message_id
      AND cm.user_id = auth.uid()
  )
);
