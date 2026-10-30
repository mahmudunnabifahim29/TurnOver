begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

create type public.ad_status as enum ('draft','pending','active','rejected','sold','deleted');
create type public.product_condition as enum ('new','used');
create type public.location_level as enum ('division','district','area');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Seller' check (char_length(display_name) between 1 and 80),
  avatar_path text,
  contact_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (phone ~ '^\+8801[3-9][0-9]{8}$'),
  show_phone boolean not null default false,
  whatsapp_enabled boolean not null default false,
  language text not null default 'en' check (language in ('en','bn'))
);
create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin')
);
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()));
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en text not null,
  name_bn text not null,
  icon text not null default 'tag',
  field_definitions jsonb not null default '[]'::jsonb check (jsonb_typeof(field_definitions) = 'array'),
  sort_order integer not null default 0,
  check (parent_id is distinct from id)
);
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.locations(id),
  level public.location_level not null,
  slug text not null unique,
  name_en text not null,
  name_bn text not null,
  check ((level = 'division' and parent_id is null) or (level <> 'division' and parent_id is not null))
);
create function private.validate_location() returns trigger
language plpgsql set search_path = '' as $$
declare parent_level public.location_level;
begin
  if new.parent_id is not null then
    select level into parent_level from public.locations where id = new.parent_id;
    if (new.level = 'district' and parent_level is distinct from 'division')
      or (new.level = 'area' and parent_level is distinct from 'district') then
      raise exception 'Locations must follow division > district > area';
    end if;
  end if;
  if TG_OP = 'UPDATE' and new.level is distinct from old.level then
    raise exception 'Create a new location instead of changing its level';
  end if;
  return new;
end;
$$;
create trigger validate_location before insert or update on public.locations
for each row execute function private.validate_location();

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  category_id uuid not null references public.categories(id),
  location_id uuid not null references public.locations(id),
  slug text not null unique default gen_random_uuid()::text check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 5 and 120),
  description text not null check (char_length(description) between 20 and 10000),
  price numeric(14,2) not null check (price >= 0),
  negotiable boolean not null default false,
  condition public.product_condition not null,
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  status public.ad_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))
  ) stored,
  unique (id, seller_id)
);
create index ads_browse_idx on public.ads (status, category_id, location_id, created_at desc);
create index ads_price_idx on public.ads (price) where status = 'active';
create index ads_latest_idx on public.ads (created_at desc) where status = 'active';
create index ads_search_idx on public.ads using gin (search_document);
create index ads_seller_idx on public.ads (seller_id);
create index categories_parent_idx on public.categories (parent_id);
create index locations_parent_idx on public.locations (parent_id);
create unique index ads_duplicate_idx on public.ads
  (seller_id, md5(lower(btrim(title))), md5(lower(btrim(description))))
  where status in ('pending','active');

create table public.ad_images (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads(id) on delete cascade,
  owner_id uuid not null,
  position smallint not null check (position between 0 and 7),
  storage_path text not null unique,
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  foreign key (ad_id, owner_id) references public.ads(id, seller_id) on delete cascade,
  unique(ad_id, position),
  check (storage_path = owner_id::text || '/' || ad_id::text || '/' || id::text || '.webp')
);
create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ad_id uuid not null references public.ads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, ad_id)
);
create index favorites_ad_idx on public.favorites (ad_id);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null,
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (ad_id, seller_id) references public.ads(id, seller_id),
  unique (ad_id,buyer_id),
  check (buyer_id <> seller_id)
);
create index conversations_buyer_idx on public.conversations (buyer_id);
create index conversations_seller_idx on public.conversations (seller_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id,created_at,id);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads(id),
  reporter_id uuid not null references public.profiles(id),
  reason text not null check (reason in ('spam','fraud','prohibited','duplicate','other')),
  details text not null default '' check (char_length(details) <= 2000),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (ad_id,reporter_id)
);
create table public.ad_promotions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
create index promotions_ad_idx on public.ad_promotions (ad_id,ends_at);
create table public.moderation_events (
  id bigint generated always as identity primary key,
  ad_id uuid not null references public.ads(id),
  actor_id uuid references public.profiles(id),
  from_status public.ad_status,
  to_status public.ad_status not null,
  created_at timestamptz not null default now()
);

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  insert into public.user_settings(user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create function private.guard_ad() returns trigger
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
    if not private.is_admin() then
      if new.published_at is distinct from old.published_at then
        raise exception 'Only moderation can set publication dates';
      end if;
      if new.status = 'active' and old.status <> 'active' then
        raise exception 'Only admins can approve ads';
      end if;
      if new.status = 'rejected' and old.status <> 'rejected' then
        raise exception 'Only admins can reject ads';
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
create trigger guard_ad before insert or update on public.ads
for each row execute function private.guard_ad();
create function private.audit_ad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.moderation_events(ad_id,actor_id,from_status,to_status)
    values (new.id,auth.uid(),old.status,new.status);
  end if;
  return new;
end;
$$;
create trigger audit_ad after update on public.ads for each row execute function private.audit_ad();

-- Explicit privileges: policies alone do not constrain writable columns.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles,public.categories,public.locations,public.ads,public.ad_images,public.ad_promotions to anon,authenticated;
grant select on public.user_settings,public.user_roles,public.favorites,public.conversations,public.messages,public.reports,public.moderation_events to authenticated;
grant update(display_name,avatar_path) on public.profiles to authenticated;
grant update(phone,show_phone,whatsapp_enabled,language) on public.user_settings to authenticated;
grant insert,update on public.ads,public.ad_images,public.categories,public.locations,public.ad_promotions to authenticated;
grant delete on public.ad_images,public.favorites,public.ad_promotions to authenticated;
grant insert on public.favorites,public.conversations,public.messages,public.reports to authenticated;
grant update(resolved) on public.reports to authenticated;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.locations enable row level security;
alter table public.ads enable row level security;
alter table public.ad_images enable row level security;
alter table public.favorites enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.ad_promotions enable row level security;
alter table public.moderation_events enable row level security;

create policy profiles_read on public.profiles for select using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy settings_owner on public.user_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy roles_read on public.user_roles for select to authenticated using (user_id = (select auth.uid()));
create policy categories_read on public.categories for select using (true);
create policy categories_admin on public.categories for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy locations_read on public.locations for select using (true);
create policy locations_admin on public.locations for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy ads_read on public.ads for select using (status = 'active' or seller_id = (select auth.uid()) or private.is_admin());
create policy ads_insert on public.ads for insert to authenticated with check (seller_id = (select auth.uid()) and status = 'draft');
create policy ads_update on public.ads for update to authenticated using (seller_id = (select auth.uid()) or private.is_admin()) with check (seller_id = (select auth.uid()) or private.is_admin());
create policy images_read on public.ad_images for select using (exists (select 1 from public.ads a where a.id = ad_id));
create policy images_write on public.ad_images for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from public.ads a where a.id = ad_id and a.seller_id = (select auth.uid()) and a.status = 'draft'))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.ads a where a.id = ad_id and a.seller_id = (select auth.uid()) and a.status = 'draft'));
create policy favorites_owner on public.favorites for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy conversations_read on public.conversations for select to authenticated using ((select auth.uid()) in (buyer_id,seller_id));
create policy conversations_create on public.conversations for insert to authenticated with check (
  buyer_id = (select auth.uid()) and exists (select 1 from public.ads a where a.id = conversations.ad_id and a.seller_id = conversations.seller_id and a.status = 'active')
);
create policy messages_read on public.messages for select to authenticated using (exists (select 1 from public.conversations c where c.id = conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id));
create policy reports_read on public.reports for select to authenticated using (reporter_id = (select auth.uid()) or private.is_admin());
create policy reports_create on public.reports for insert to authenticated with check (
  reporter_id = (select auth.uid()) and resolved = false and exists (select 1 from public.ads a where a.id = ad_id and a.status = 'active')
);
create policy reports_admin on public.reports for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy promotions_read on public.ad_promotions for select using (exists (select 1 from public.ads a where a.id = ad_id and a.status = 'active'));
create policy promotions_admin on public.ad_promotions for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy moderation_admin on public.moderation_events for select to authenticated using (private.is_admin());

-- Private bucket: clients later request short-lived signed image URLs.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ad-images','ad-images',false,2097152,array['image/webp']);
create policy ad_objects_read on storage.objects for select using (
  bucket_id = 'ad-images' and exists (select 1 from public.ad_images i where i.storage_path = name)
);
create policy ad_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'ad-images' and exists (
    select 1 from public.ad_images i join public.ads a on a.id = i.ad_id
    where i.storage_path = name and i.owner_id = (select auth.uid()) and a.status = 'draft'
  )
);
create policy ad_objects_delete on storage.objects for delete to authenticated using (
  bucket_id = 'ad-images' and exists (
    select 1 from public.ad_images i join public.ads a on a.id = i.ad_id
    where i.storage_path = name and i.owner_id = (select auth.uid()) and a.status = 'draft'
  )
);
-- No object UPDATE policy: replace photos with a new image ID to avoid stale signed URLs.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_admin() to anon,authenticated;

commit;
