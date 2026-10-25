-- CMS foundation only: not applied or connected to this frontend yet.
-- Editor membership must be provisioned by a trusted database administrator.
create table public.content_editors (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.content_editors enable row level security;
revoke all on public.content_editors from anon, authenticated;
grant select on public.content_editors to authenticated;
create policy "Editors can see their own membership" on public.content_editors
 for select to authenticated using (user_id = (select auth.uid()));

create table public.content_items (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('news','hero','person','about','recording')),
 slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 status text not null default 'draft' check (status in ('draft','published','archived')),
 position integer not null default 0,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 published_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(kind,slug),
 check (status <> 'published' or published_at is not null)
);
alter table public.content_items enable row level security;
revoke all on public.content_items from anon, authenticated;
grant select on public.content_items to anon, authenticated;
grant insert,update,delete on public.content_items to authenticated;
create policy "Public reads published content" on public.content_items
 for select to anon, authenticated using (status = 'published' and published_at <= now());
create policy "Editors read all content" on public.content_items
 for select to authenticated using (exists(select 1 from public.content_editors where user_id = (select auth.uid())));
create policy "Editors create content" on public.content_items
 for insert to authenticated with check (exists(select 1 from public.content_editors where user_id = (select auth.uid())));
create policy "Editors update content" on public.content_items
 for update to authenticated using (exists(select 1 from public.content_editors where user_id = (select auth.uid())))
 with check (exists(select 1 from public.content_editors where user_id = (select auth.uid())));
create policy "Editors delete content" on public.content_items
 for delete to authenticated using (exists(select 1 from public.content_editors where user_id = (select auth.uid())));
create function public.content_set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger content_updated before update on public.content_items for each row execute function public.content_set_updated_at();
create index content_public_order on public.content_items(kind,position,published_at desc) where status='published';
