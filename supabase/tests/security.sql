-- TEST ONLY, run after bootstrap + both migrations + seed on the disposable database.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean, label text) returns void
language plpgsql as $$ begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.assert_raises(statement text, expected_state text) returns void
language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if SQLSTATE <> expected_state then raise; end if;
    caught := true;
  end;
  if not caught then raise exception 'FAIL: statement should fail: %',statement; end if;
end $$;

insert into public.profiles(id,display_name) values
('firebase-seller-001','Seller'),
('firebase-buyer-001','Buyer'),
('firebase-outsider-001','Outsider'),
('firebase-admin-001','Admin'),
('firebase-moderator-001','Moderator');
insert into public.user_settings(user_id) values
('firebase-seller-001'),('firebase-buyer-001'),('firebase-outsider-001'),
('firebase-admin-001'),('firebase-moderator-001');
insert into private.user_emails(firebase_uid,email) values
('firebase-seller-001','seller@example.com'),
('firebase-buyer-001','buyer@example.com'),
('firebase-outsider-001','outsider@example.com'),
('firebase-admin-001','admin@example.com'),
('firebase-moderator-001','moderator@example.com');
insert into public.user_roles(user_id,role) values
('firebase-admin-001','admin'),
('firebase-moderator-001','moderator');
select pg_temp.assert_true((select count(*) = 12 from public.categories where parent_id is null),'12 categories');
select pg_temp.assert_true((select count(*) = 8 from public.locations where level = 'division'),'8 divisions');
select pg_temp.assert_true((select count(*) = 1 from public.profiles where id = '90000000-0000-0000-0000-000000000001'),'legacy UUID profile preserved as text');
select pg_temp.assert_true((select count(*) = 1 from public.user_settings where user_id = '90000000-0000-0000-0000-000000000001'),'legacy settings preserved as text');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"firebase-new-user-001","email":"new@example.com","email_verified":true,"role":"authenticated"}',true);
select public.ensure_current_profile();
select pg_temp.assert_true((select count(*) = 1 from public.profiles where id = 'firebase-new-user-001'),'Firebase UID profile provisioned');
select pg_temp.assert_true((select count(*) = 1 from public.user_settings where user_id = 'firebase-new-user-001'),'Firebase UID settings provisioned');
select set_config('request.jwt.claims','{"sub":"firebase-seller-001","email":"seller@example.com","role":"authenticated"}',true);
insert into public.ads(id,seller_id,category_id,location_id,title,description,price,condition)
select '20000000-0000-0000-0000-000000000001',private.current_user_id(),c.id,l.id,
'Phone for sale','A used phone with its original box and charging cable.',55000,'used'
from public.categories c,public.locations l where c.slug = 'mobiles' and l.slug = 'dhaka-mirpur';
select pg_temp.assert_raises($q$update public.profiles set contact_verified = true where id = private.current_user_id()$q$,'42501');
select pg_temp.assert_raises($q$insert into public.user_roles(user_id,role) values(private.current_user_id(),'admin')$q$,'42501');
select pg_temp.assert_raises($q$update public.ads set status = 'active'$q$,'P0001');
select pg_temp.assert_raises($q$update public.user_settings set phone = '01212345678'$q$,'23514');
insert into public.ad_images(id,ad_id,owner_id,position,storage_path) values (
'30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',private.current_user_id(),0,
'firebase-seller-001/20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001.webp');
insert into storage.objects(bucket_id,name) select 'ad-images',storage_path from public.ad_images;
select pg_temp.assert_raises($q$insert into public.ad_images(ad_id,owner_id,position,storage_path) values ('20000000-0000-0000-0000-000000000001',private.current_user_id(),8,'bad')$q$,'23514');
update public.ads set status = 'pending';

set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true((select count(*) = 0 from public.ads),'pending ads hidden from guests');
select pg_temp.assert_true((select count(*) = 0 from storage.objects),'pending photos hidden from guests');
select pg_temp.assert_raises($q$select * from public.user_settings$q$,'42501');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"firebase-moderator-001","email":"moderator@example.com","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*) = 1 from public.ads where status = 'pending'),'moderators can review pending ads');
select pg_temp.assert_raises($q$update public.ads set price = 1$q$,'P0001');
select pg_temp.assert_raises($q$insert into public.user_roles(user_id,role) values('firebase-outsider-001','moderator')$q$,'42501');
select pg_temp.assert_raises($q$select public.admin_list_users()$q$,'42501');
update public.ads set status = 'active';
insert into public.site_issues(reporter_id,title,details,page_path,severity)
values (private.current_user_id(),'Search results broken','Searching a keyword shows no results even when matching listings exist.','/search','high');
update public.site_issues set status = 'resolved';
select pg_temp.assert_true((select count(*) = 1 from public.site_issues where status = 'open'),'moderators can report issues but cannot triage them');
select pg_temp.assert_raises($q$insert into public.reports(ad_id,reporter_id,reason,resolved) values ('20000000-0000-0000-0000-000000000001',private.current_user_id(),'spam',true)$q$,'42501');

set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true((select count(*) = 1 from public.ads),'approved ad visible to guests');
select pg_temp.assert_true((select count(*) = 1 from storage.objects),'approved photo visible to guests');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"firebase-admin-001","email":"admin@example.com","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*) = 6 from public.admin_list_users()),'admin can view user directory');
select pg_temp.assert_true((select email = 'new@example.com' from public.admin_list_users() where user_id = 'firebase-new-user-001'),'admin can resolve private account email');
select pg_temp.assert_true((select count(*) = 1 from public.moderation_events where actor_id = 'firebase-moderator-001'),'moderation audit records Firebase UID');
select public.admin_set_moderator('firebase-outsider-001',true);
select pg_temp.assert_true((select role = 'moderator' from public.user_roles where user_id = 'firebase-outsider-001'),'admin can assign moderator role');
select public.admin_set_moderator('firebase-outsider-001',false);
select pg_temp.assert_true((select count(*) = 0 from public.user_roles where user_id = 'firebase-outsider-001'),'admin can revoke moderator role');
select pg_temp.assert_raises($q$select public.admin_set_moderator('firebase-admin-001',false)$q$,'P0001');
update public.site_issues set status = 'resolved';
select pg_temp.assert_true((select count(*) = 1 from public.site_issues where status = 'resolved'),'admin can resolve issues');
select pg_temp.assert_true((select count(*) = 2 from public.moderation_events),'admin can inspect moderation audit');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"firebase-buyer-001","email":"buyer@example.com","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*) = 1 from public.user_settings),'settings owner only');
select pg_temp.assert_raises($q$select * from private.user_emails$q$,'42501');
select pg_temp.assert_raises($q$insert into public.reports(ad_id,reporter_id,reason,resolved) values ('20000000-0000-0000-0000-000000000001',private.current_user_id(),'spam',true)$q$,'42501');
insert into public.reports(ad_id,reporter_id,reason) values ('20000000-0000-0000-0000-000000000001',private.current_user_id(),'spam');
insert into public.conversations(id,ad_id,buyer_id,seller_id) values (
'40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',private.current_user_id(),'firebase-seller-001');
insert into public.messages(conversation_id,sender_id,body) values ('40000000-0000-0000-0000-000000000001',private.current_user_id(),'Is this available?');
select pg_temp.assert_raises($q$insert into public.messages(conversation_id,sender_id,body) values ('40000000-0000-0000-0000-000000000001','firebase-seller-001','Forged message')$q$,'42501');

select set_config('request.jwt.claims','{"sub":"firebase-outsider-001","email":"outsider@example.com","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*) = 0 from public.messages),'outsider cannot read chat');
select pg_temp.assert_true((select count(*) = 0 from public.conversations),'outsider cannot read conversations');
select pg_temp.assert_raises($q$insert into public.messages(conversation_id,sender_id,body) values ('40000000-0000-0000-0000-000000000001',private.current_user_id(),'Intrusion')$q$,'42501');

select set_config('request.jwt.claims','{"sub":"firebase-seller-001","email":"seller@example.com","role":"authenticated"}',true);
select pg_temp.assert_raises($q$insert into storage.objects(bucket_id,name) select 'ad-images',storage_path from public.ad_images$q$,'42501');
delete from public.ad_images;
select pg_temp.assert_true((select count(*) = 1 from public.ad_images),'published photo cannot be removed');
update public.ads set price = 54000;
select pg_temp.assert_true((select status = 'draft' from public.ads limit 1),'editing published content requires reapproval');
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true((select count(*) = 0 from public.ads),'edited ad becomes private');
select pg_temp.assert_true((select count(*) = 0 from storage.objects),'edited photos become private');
rollback;
\echo 'All TurnOver database security checks passed.'
