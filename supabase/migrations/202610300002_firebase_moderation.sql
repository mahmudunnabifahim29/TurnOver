begin;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_new_user();

drop policy if exists profiles_update on public.profiles;
drop policy if exists settings_owner on public.user_settings;
drop policy if exists roles_read on public.user_roles;
drop policy if exists ads_read on public.ads;
drop policy if exists ads_insert on public.ads;
drop policy if exists ads_update on public.ads;
drop policy if exists images_write on public.ad_images;
drop policy if exists favorites_owner on public.favorites;
drop policy if exists conversations_read on public.conversations;
drop policy if exists conversations_create on public.conversations;
drop policy if exists messages_insert on public.messages;
drop policy if exists reports_read on public.reports;
drop policy if exists reports_create on public.reports;
drop policy if exists ad_objects_insert on storage.objects;
drop policy if exists ad_objects_delete on storage.objects;

alter table public.user_settings drop constraint if exists user_settings_user_id_fkey;
alter table public.user_roles drop constraint if exists user_roles_user_id_fkey;
alter table public.favorites drop constraint if exists favorites_user_id_fkey;
alter table public.ads drop constraint if exists ads_seller_id_fkey;
alter table public.ad_images drop constraint if exists ad_images_ad_id_owner_id_fkey;
alter table public.conversations drop constraint if exists conversations_buyer_id_fkey;
alter table public.conversations drop constraint if exists conversations_ad_id_seller_id_fkey;
alter table public.conversations drop constraint if exists conversations_check;
alter table public.messages drop constraint if exists messages_sender_id_fkey;
alter table public.reports drop constraint if exists reports_reporter_id_fkey;
alter table public.moderation_events drop constraint if exists moderation_events_actor_id_fkey;
alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.profiles alter column id type text using id::text;
alter table public.profiles add constraint profiles_id_length check (char_length(id) between 1 and 128);
alter table public.user_settings alter column user_id type text using user_id::text;
alter table public.user_roles alter column user_id type text using user_id::text;
alter table public.favorites alter column user_id type text using user_id::text;
alter table public.ads alter column seller_id type text using seller_id::text;
alter table public.ad_images alter column owner_id type text using owner_id::text;
alter table public.conversations alter column buyer_id type text using buyer_id::text;
alter table public.conversations alter column seller_id type text using seller_id::text;
alter table public.messages alter column sender_id type text using sender_id::text;
alter table public.reports alter column reporter_id type text using reporter_id::text;
alter table public.moderation_events alter column actor_id type text using actor_id::text;

alter table public.user_settings
  add constraint user_settings_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.user_roles
  add constraint user_roles_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.favorites
  add constraint favorites_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.ads
  add constraint ads_seller_id_fkey foreign key (seller_id) references public.profiles(id);
alter table public.ad_images
  add constraint ad_images_ad_id_owner_id_fkey foreign key (ad_id,owner_id) references public.ads(id,seller_id) on delete cascade;
alter table public.conversations
  add constraint conversations_buyer_id_fkey foreign key (buyer_id) references public.profiles(id);
alter table public.conversations
  add constraint conversations_ad_id_seller_id_fkey foreign key (ad_id,seller_id) references public.ads(id,seller_id);
alter table public.conversations add constraint conversations_check check (buyer_id <> seller_id);
alter table public.messages
  add constraint messages_sender_id_fkey foreign key (sender_id) references public.profiles(id);
alter table public.reports
  add constraint reports_reporter_id_fkey foreign key (reporter_id) references public.profiles(id);
alter table public.moderation_events
  add constraint moderation_events_actor_id_fkey foreign key (actor_id) references public.profiles(id);

alter table public.user_roles alter column role drop default;
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check check (role in ('admin','moderator'));

create table private.user_emails (
  firebase_uid text primary key references public.profiles(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  updated_at timestamptz not null default now()
);
revoke all on table private.user_emails from public,anon,authenticated;

create or replace function private.current_user_id() returns text
language sql stable set search_path = '' as $$
  select nullif(auth.jwt()->>'sub','');
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = private.current_user_id() and role = 'admin'
  );
$$;

create or replace function private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = private.current_user_id() and role in ('admin','moderator')
  );
$$;

create or replace function public.ensure_current_profile() returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_id text := private.current_user_id();
  current_email text := nullif(auth.jwt()->>'email','');
  current_name text := coalesce(
    nullif(auth.jwt()->>'name',''),
    nullif(split_part(coalesce(auth.jwt()->>'email',''), '@', 1),''),
    'Seller'
  );
begin
  if current_id is null or current_email is null
    or coalesce((auth.jwt()->>'email_verified')::boolean,false) is not true then
    raise exception 'A verified Firebase email is required';
  end if;
  insert into public.profiles(id,display_name)
  values (current_id,left(current_name,80))
  on conflict (id) do nothing;
  insert into public.user_settings(user_id)
  values (current_id)
  on conflict (user_id) do nothing;
  insert into private.user_emails(firebase_uid,email)
  values (current_id,lower(current_email))
  on conflict (firebase_uid) do update
  set email = excluded.email, updated_at = now();
end;
$$;
revoke all on function public.ensure_current_profile() from public,anon;
grant execute on function public.ensure_current_profile() to authenticated;

create or replace function public.admin_list_users()
returns table (user_id text,email text,display_name text,role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
    select p.id,e.email,p.display_name,coalesce(r.role,'user')
    from public.profiles p
    join private.user_emails e on e.firebase_uid = p.id
    left join public.user_roles r on r.user_id = p.id
    order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_moderator(target_user_id text, enabled boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'User does not exist';
  end if;
  if exists (select 1 from public.user_roles where user_id = target_user_id and role = 'admin') then
    raise exception 'Administrator roles are managed through trusted database administration';
  end if;
  if enabled then
    insert into public.user_roles(user_id,role) values (target_user_id,'moderator')
    on conflict (user_id) do update set role = 'moderator'
    where public.user_roles.role = 'moderator';
  else
    delete from public.user_roles where user_id = target_user_id and role = 'moderator';
  end if;
end;
$$;
revoke all on function public.admin_list_users() from public,anon;
revoke all on function public.admin_set_moderator(text,boolean) from public,anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_moderator(text,boolean) to authenticated;

create table public.site_issues (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 4 and 140),
  details text not null check (char_length(btrim(details)) between 10 and 4000),
  page_path text not null default '/' check (char_length(page_path) between 1 and 500),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_issues_status_idx on public.site_issues(status,created_at desc);
create index site_issues_reporter_idx on public.site_issues(reporter_id);
alter table public.site_issues enable row level security;
revoke all on public.site_issues from anon,authenticated;
grant select,insert,update on public.site_issues to authenticated;
create policy issues_read on public.site_issues for select to authenticated
  using (reporter_id = (select private.current_user_id()) or private.is_moderator());
create policy issues_create on public.site_issues for insert to authenticated
  with check (reporter_id = (select private.current_user_id()));
create policy issues_admin_update on public.site_issues for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create or replace function private.guard_ad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if not private.is_admin() then
      new.status := 'draft';
      new.created_at := now();
      new.published_at := null;
    end if;
  else
    if new.id <> old.id or new.seller_id <> old.seller_id or new.created_at <> old.created_at then
      raise exception 'Ad identity and creation date cannot be changed';
    end if;
    if private.is_moderator() and not private.is_admin() then
      if (new.title,new.description,new.price,new.category_id,new.location_id,new.condition,new.attributes,new.negotiable,new.slug)
        is distinct from
        (old.title,old.description,old.price,old.category_id,old.location_id,old.condition,old.attributes,old.negotiable,old.slug) then
        raise exception 'Moderators can only review ad status';
      end if;
      if new.status is distinct from old.status
        and not (old.status = 'pending' and new.status in ('active','rejected')) then
        raise exception 'Moderators can only approve or reject pending ads';
      end if;
      if new.published_at is distinct from old.published_at then
        raise exception 'Only moderation can set publication dates';
      end if;
    elsif not private.is_admin() then
      if new.published_at is distinct from old.published_at then
        raise exception 'Only moderation can set publication dates';
      end if;
      if new.status = 'active' and old.status <> 'active' then
        raise exception 'Only admins or moderators can approve ads';
      end if;
      if new.status = 'rejected' and old.status <> 'rejected' then
        raise exception 'Only admins or moderators can reject ads';
      end if;
      if new.status = 'sold' and old.status not in ('active','sold') then
        raise exception 'Only published ads can be marked sold';
      end if;
      if (new.title,new.description,new.price,new.category_id,new.location_id,new.condition,new.attributes,new.negotiable,new.slug)
        is distinct from
        (old.title,old.description,old.price,old.category_id,old.location_id,old.condition,old.attributes,old.negotiable,old.slug)
        and old.status in ('active','sold','rejected') then
        new.status := 'draft';
      end if;
    end if;
    if new.status = 'active' and old.status <> 'active' then
      new.published_at := now();
    end if;
  end if;
  if new.status in ('pending','active') then
    if not exists (
      select 1 from public.ad_images i join storage.objects o
      on o.bucket_id = 'ad-images' and o.name = i.storage_path where i.ad_id = new.id
    ) then
      raise exception 'Upload at least one photo before submitting';
    end if;
    if not exists (select 1 from public.locations where id = new.location_id and level = 'area') then
      raise exception 'Select an area before submitting';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.audit_ad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.moderation_events(ad_id,actor_id,from_status,to_status)
    values (new.id,private.current_user_id(),old.status,new.status);
  end if;
  return new;
end;
$$;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select private.current_user_id()))
  with check (id = (select private.current_user_id()));

drop policy if exists settings_owner on public.user_settings;
create policy settings_owner on public.user_settings for all to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));

drop policy if exists roles_read on public.user_roles;
create policy roles_read on public.user_roles for select to authenticated
  using (user_id = (select private.current_user_id()) or private.is_admin());
create policy roles_admin_manage on public.user_roles for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists ads_read on public.ads;
create policy ads_read on public.ads for select
  using (status = 'active' or seller_id = (select private.current_user_id()) or private.is_moderator());

drop policy if exists ads_insert on public.ads;
create policy ads_insert on public.ads for insert to authenticated
  with check (seller_id = (select private.current_user_id()) and status = 'draft');

drop policy if exists ads_update on public.ads;
create policy ads_update on public.ads for update to authenticated
  using (seller_id = (select private.current_user_id()) or private.is_moderator())
  with check (seller_id = (select private.current_user_id()) or private.is_moderator());

drop policy if exists images_write on public.ad_images;
create policy images_write on public.ad_images for all to authenticated
  using (owner_id = (select private.current_user_id()) and exists (
    select 1 from public.ads a where a.id = ad_id and a.seller_id = (select private.current_user_id()) and a.status = 'draft'
  ))
  with check (owner_id = (select private.current_user_id()) and exists (
    select 1 from public.ads a where a.id = ad_id and a.seller_id = (select private.current_user_id()) and a.status = 'draft'
  ));

drop policy if exists favorites_owner on public.favorites;
create policy favorites_owner on public.favorites for all to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));

drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations for select to authenticated
  using ((select private.current_user_id()) in (buyer_id,seller_id));

drop policy if exists conversations_create on public.conversations;
create policy conversations_create on public.conversations for insert to authenticated
  with check (buyer_id = (select private.current_user_id()) and exists (
    select 1 from public.ads a
    where a.id = conversations.ad_id and a.seller_id = conversations.seller_id and a.status = 'active'
  ));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select private.current_user_id()) and exists (
    select 1 from public.conversations c where c.id = conversation_id
  ));

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select private.current_user_id()) or private.is_admin());

drop policy if exists reports_create on public.reports;
create policy reports_create on public.reports for insert to authenticated
  with check (reporter_id = (select private.current_user_id()) and resolved = false and exists (
    select 1 from public.ads a where a.id = ad_id and a.status = 'active'
  ));

drop policy if exists ad_objects_insert on storage.objects;
create policy ad_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ad-images' and exists (
      select 1 from public.ad_images i join public.ads a on a.id = i.ad_id
      where i.storage_path = name and i.owner_id = (select private.current_user_id()) and a.status = 'draft'
    )
  );

drop policy if exists ad_objects_delete on storage.objects;
create policy ad_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'ad-images' and exists (
      select 1 from public.ad_images i join public.ads a on a.id = i.ad_id
      where i.storage_path = name and i.owner_id = (select private.current_user_id()) and a.status = 'draft'
    )
  );

grant insert,update,delete on public.user_roles to authenticated;
revoke all on function private.current_user_id() from public,anon,authenticated;
revoke all on function private.is_admin() from public,anon,authenticated;
revoke all on function private.is_moderator() from public,anon,authenticated;
grant execute on function private.current_user_id() to anon,authenticated;
grant execute on function private.is_admin() to anon,authenticated;
grant execute on function private.is_moderator() to anon,authenticated;

commit;
