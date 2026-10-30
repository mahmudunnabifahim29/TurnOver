-- Safe to rerun. Production reference data, plus explicitly marked demo locations.
begin;
insert into public.categories (slug,name_en,name_bn,icon,sort_order,field_definitions) values
('mobiles','Mobiles','মোবাইল','smartphone',1,'[{"key":"brand","type":"text","required":true},{"key":"model","type":"text","required":true}]'),
('electronics','Electronics','ইলেকট্রনিক্স','monitor',2,'[]'),
('vehicles','Vehicles','যানবাহন','car',3,'[{"key":"brand","type":"text","required":true},{"key":"model","type":"text","required":true},{"key":"year","type":"integer","required":true},{"key":"mileage","type":"integer","required":true}]'),
('property','Property','প্রপার্টি','building',4,'[]'),
('home-living','Home & Living','ঘর ও গৃহস্থালি','house',5,'[]'),
('fashion','Fashion','ফ্যাশন','shirt',6,'[]'),
('furniture','Furniture','আসবাবপত্র','armchair',7,'[]'),
('jobs','Jobs','চাকরি','briefcase',8,'[]'),
('services','Services','সেবা','wrench',9,'[]'),
('pets','Pets','পোষা প্রাণী','paw-print',10,'[]'),
('sports-hobbies','Sports & Hobbies','খেলাধুলা ও শখ','bike',11,'[]'),
('books-education','Books & Education','বই ও শিক্ষা','book-open',12,'[]')
on conflict (slug) do nothing;

insert into public.categories (parent_id,slug,name_en,name_bn,icon)
select id,'mobile-phones','Mobile Phones','মোবাইল ফোন','smartphone'
from public.categories where slug = 'mobiles' on conflict (slug) do nothing;
insert into public.categories (parent_id,slug,name_en,name_bn,icon)
select id,'cars','Cars','গাড়ি','car'
from public.categories where slug = 'vehicles' on conflict (slug) do nothing;

insert into public.locations (slug,level,name_en,name_bn) values
('dhaka-division','division','Dhaka','ঢাকা'),
('chattogram-division','division','Chattogram','চট্টগ্রাম'),
('rajshahi-division','division','Rajshahi','রাজশাহী'),
('khulna-division','division','Khulna','খুলনা'),
('barishal-division','division','Barishal','বরিশাল'),
('sylhet-division','division','Sylhet','সিলেট'),
('rangpur-division','division','Rangpur','রংপুর'),
('mymensingh-division','division','Mymensingh','ময়মনসিংহ')
on conflict (slug) do nothing;

-- DEMO ONLY: this is not a complete district/area dataset for Bangladesh.
insert into public.locations (parent_id,slug,level,name_en,name_bn)
select id,'dhaka-district','district','Dhaka','ঢাকা'
from public.locations where slug = 'dhaka-division' on conflict (slug) do nothing;
insert into public.locations (parent_id,slug,level,name_en,name_bn)
select id,'dhaka-mirpur','area','Mirpur','মিরপুর'
from public.locations where slug = 'dhaka-district' on conflict (slug) do nothing;
insert into public.locations (parent_id,slug,level,name_en,name_bn)
select id,'dhaka-dhanmondi','area','Dhanmondi','ধানমন্ডি'
from public.locations where slug = 'dhaka-district' on conflict (slug) do nothing;
commit;
