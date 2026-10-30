-- TEST ONLY. Run after the initial schema to confirm UUID-based legacy profiles survive migration 002.
\set ON_ERROR_STOP on
insert into auth.users(id) values ('90000000-0000-0000-0000-000000000001');
