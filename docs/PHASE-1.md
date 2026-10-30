# Phase 1: project foundation (historical setup notes)

The project is now named **TurnOver**. This document describes the original foundation; follow [TURNOVER-SETUP.md](TURNOVER-SETUP.md) for the current Firebase + Supabase setup, database migrations, and admin bootstrap instructions.

## 1. Understand the architecture

Your browser displays a Next.js application. Firebase verifies email-link sign-ins. The browser sends Firebase ID tokens to Supabase, where PostgreSQL Row Level Security decides which records the user can access. Vercel will host Next.js in a later phase.

- Next.js App Router + React + TypeScript: pages and application logic.
- Tailwind CSS v4: responsive styling through CSS utility classes.
- The dev/build scripts explicitly use Next.js's Webpack option because this workspace blocks a local worker port needed by Turbopack. This keeps the application on Next.js without that environment dependency.
- Supabase PostgreSQL: relational data, constraints, indexes, triggers, and Row Level Security (RLS).
- Firebase Auth: passwordless email sign-in links; this is not a numeric email OTP.
- Firebase Cloud Functions: safely adds the standard authenticated claim required by Supabase's Firebase integration.
- Supabase Storage: a private `ad-images` bucket, restricted to WebP files up to 2 MiB each.
- Supabase Realtime: reserved for Phase 7; no tables are added to a realtime publication yet.

RLS means the database checks who is requesting each row. Hiding a button in React does not secure the data; database rules do.

The current `/` page is an English-first storefront with no sample ads. Localized routes, live search, and readable listing URLs remain future work. The CSS currently uses a local Bengali-capable font fallback.

## 2. Install the tools

Install Node.js 24 LTS from https://nodejs.org/ and VS Code from https://code.visualstudio.com/. Open Terminal on your Mac and run:

```sh
node --version
npm --version
```

You should see version numbers. This project requires Node 22 or newer. Node runs the development tools; npm installs the packages listed in `package.json`.

The project folder is named:

```text
/Users/fahim/Desktop/VSCode/ChatGPT/TurnOver
```

In VS Code, choose **File → Open Folder** and open `TurnOver`. Then choose **Terminal → New Terminal**. It should open in that folder.

To enter the folder manually:

```sh
cd /Users/fahim/Desktop/VSCode/ChatGPT/TurnOver
```

If recreating elsewhere, make an empty `TurnOver` directory and use [PHASE-3-CODE.md](PHASE-3-CODE.md) for the current complete application source. Do not run create-next-app over this existing project.

## 3. Install dependencies and start Next.js

Dependencies are already installed in this workspace. On another machine, run:

```sh
npm ci
```

`npm ci` uses the exact versions in the included `package-lock.json`. If you are recreating from only the code companion and do not have that generated lockfile yet, run `npm install` once instead. Keep the resulting lockfile in version control.

Start the app:

```sh
npm run dev
```

Open http://localhost:3000. You should see the TurnOver marketplace. Stop the server with **Control+C**. If port 3000 is busy, Next.js may print a different URL; use the printed URL and update the site URL accordingly.

The public storefront works before Supabase is configured. Sign-in and the admin workspace require the configuration in [TURNOVER-SETUP.md](TURNOVER-SETUP.md).

## 4. Create a Supabase project

1. Visit https://supabase.com/dashboard and create an account or sign in.
2. Create a new project in your organization. Name it `TurnOver`.
3. Generate a strong database password and store it in a password manager. You do not need to paste it into this app.
4. Choose a nearby available region, such as Singapore, and the plan suitable for development.
5. Wait until the database is ready.
6. Find the project URL and **publishable key** under the project's connection/API settings.

Dashboard labels can change. You need a URL shaped like `https://<project-ref>.supabase.co` and the publishable key, usually beginning `sb_publishable_`. Never use an `sb_secret_` or service-role key in browser code.

## 5. Add environment variables

From the `TurnOver` terminal:

```sh
cp .env.example .env.local
```

Open `.env.local` and replace the two placeholders:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Save it. Restart `npm run dev` after changing environment variables. `.env.local` is ignored by Git. The publishable key is designed for public clients; RLS is what limits its access. Keep private database passwords and secret keys out of `NEXT_PUBLIC_` variables.

## 6. Create the database tables and security rules

Use a **new, empty Supabase project** for initial setup. The current setup requires both migrations, in order; see [TURNOVER-SETUP.md](TURNOVER-SETUP.md) for Firebase integration and production data warnings.

1. Open Supabase **SQL Editor** and start a new query.
2. Open `supabase/migrations/202610300001_initial_schema.sql` in VS Code.
3. Copy the **entire file** into SQL Editor and click **Run**.
4. Run `supabase/migrations/202610300002_firebase_moderation.sql` in a new query.
5. Once it succeeds, open another query and run `supabase/seed.sql`.

The seed can be rerun safely. It adds 12 main categories, two example subcategories, all eight divisions, and **sample-only** Dhaka/Mirpur/Dhanmondi locations. It creates no sample ads and does not include all 64 districts or every upazila/area.

Do **not** run anything from `supabase/tests/` in Supabase. Those scripts create fake Auth/Storage contracts for a disposable local test database only. SQL Editor manual execution does not automatically record Supabase CLI migration history; if adopting the CLI later, baseline this migration before using `db push`.

## 7. Verify setup in Supabase

Run this read-only query in SQL Editor:

```sql
select 'main_categories' as item, count(*) as total
from public.categories where parent_id is null
union all
select 'divisions', count(*) from public.locations where level = 'division';
```

Expected results: `main_categories = 12`, `divisions = 8`.

Confirm RLS is enabled on every application table:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Every marketplace table should have `rowsecurity = true`. Open Storage and confirm `ad-images` exists with public access **off**. Do not switch it to a public bucket: public buckets would expose draft photos.

SQL Editor normally uses an elevated role that bypasses RLS. These checks confirm objects exist; they do not prove user permissions. The included isolated SQL tests exercise permissions using `anon` and `authenticated` roles. Repeat integration checks against the configured Firebase third-party integration and Supabase Storage when those flows are implemented.

## 8. Configure Firebase authentication

The current app uses Firebase passwordless email links and a small Firebase Cloud Function to connect signed Firebase identities to Supabase. It does not use Supabase Auth for application sign-in and does not send numeric email OTPs. Follow the complete instructions in [TURNOVER-SETUP.md](TURNOVER-SETUP.md), including enabling Firebase email-link sign-in, authorizing `localhost` and `127.0.0.1`, connecting Firebase under Supabase Third-Party Auth, and deploying the authenticated-claim function.

## 9. Current folder structure

```text
TurnOver/
├── .env.example                   # safe environment template
├── .env.local                     # your values; not committed
├── .firebaserc                    # Firebase project selection
├── firebase.json
├── functions/                     # authenticated Firebase claim bridge
├── package.json                   # dependencies and commands
├── package-lock.json              # exact installed dependency versions
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs             # Tailwind v4 PostCSS integration
├── eslint.config.mjs
├── src/
│   ├── app/
│   │   ├── layout.tsx             # root HTML and metadata
│   │   ├── globals.css
│   │   ├── page.tsx               # storefront without sample ads
│   │   ├── login/                 # Firebase email-link sign-in
│   │   └── admin/                 # role-protected operations workspace
│   └── lib/
│       ├── format.ts              # BDT formatting and phone normalization
│       ├── format.test.ts
│       ├── firebase/              # Firebase Auth and Functions clients
│       └── supabase/
│           ├── env.ts             # helpful missing-configuration errors
│           └── client.ts          # browser Supabase client with Firebase token
├── supabase/
│   ├── migrations/
│   │   ├── 202610300001_initial_schema.sql
│   │   └── 202610300002_firebase_moderation.sql
│   ├── seed.sql
│   └── tests/
│       ├── bootstrap.sql          # isolated test contracts only
│       └── security.sql           # SQL permission assertions
├── scripts/export-code.mjs
└── docs/
    ├── TURNOVER-SETUP.md          # current service setup instructions
    └── PHASE-3-CODE.md            # current source, grouped by file path
```

Ad posting, browsing, chat, and other business tools will be added in later phases.

## 10. Database tables and relationships

Content IDs are UUIDs except Firebase user IDs, which are strings; the internal moderation audit ID is a sequence. Money uses `numeric(14,2)`, never floating-point columns. Time columns use timezone-aware timestamps; display will use Bangladesh time in the UI.

| Table | Purpose and relationships |
| --- | --- |
| `profiles` | Public seller name/avatar and contact badge; primary key is the Firebase UID. A restricted RPC creates the profile after verified sign-in. |
| `user_settings` | Private canonical +880 phone, contact preferences, language; one row per profile. |
| `user_roles` | Protected `admin`/`moderator` membership; browser clients cannot assign Admins. |
| `categories` | English/Bangla labels, URL slug, icon key, parent category, and field definitions. |
| `locations` | English/Bangla labels and parent hierarchy. A trigger enforces division → district → area. |
| `ads` | Seller, category, area, description, fixed-precision BDT price, new/used condition, JSON attributes, timestamps, and status. |
| `ad_images` | Ad and owner references; positions 0–7 enforce eight photos maximum. Canonical storage paths bind each file to Firebase UID/ad/image ID. |
| `favorites` | User/ad composite primary key prevents duplicate favorites. |
| `conversations` | One buyer conversation per ad; a composite foreign key ensures the seller really owns that ad. |
| `messages` | Sender and conversation; immutable after sending. |
| `reports` | Reporter, ad, reason, details, and resolution flag; one report per user/ad. |
| `ad_promotions` | Admin-created featured time windows; no payments or payment credentials. |
| `moderation_events` | Trigger-written status history, actor, and timestamp; admins can read it. |
| `site_issues` | Bug and service findings with severity, page path, and triage status. |

Jobs, property, and services will reuse the base ad schema; later category validators will interpret price and category-specific fields appropriately. The base condition field currently remains required, with the form adapting how it is presented for non-product categories.

Ad lifecycle:

```text
draft → pending → active → sold
            └──→ rejected → draft
owner editing active content → draft → pending → active
owner removing an ad → deleted (soft deletion)
```

Admins and moderators can set `active` or `rejected` on pending ads. Moderators may change only the review status; owners can withdraw to draft or soft-delete. Approved content edits return to draft so changes need another review. Physical ad deletion is deliberately not granted to browser clients: reports and chat need stable references. A later maintenance job will clean unused Storage files and implement retention rules. Delete the Storage object before its metadata row when removing a draft photo.

Search indexes support category/location/date/price filtering and PostgreSQL full-text search using the `simple` dictionary, which does not apply English stemming to Bangla. Bangla partial-word matching, transliteration, ranking, and query normalization remain Phase 5 work; this is not yet a complete search implementation. Parent location filtering will expand descendant areas in that phase.

## 11. Security rules and boundaries

- Guests can read active ads and their image metadata. Draft, pending, sold, rejected, and deleted ads are hidden from guests.
- A seller can read their own ads in any status. Admins and moderators can review pending ads.
- Firebase UID strings are used in user identity columns. The Supabase Firebase integration must be configured for the correct Firebase project, and the callable must set the standard `authenticated` role claim before protected queries are made.
- Verified account email addresses are kept in a private schema table. Only an Admin-authorized database function can return them for staff management.
- Phone numbers live in private settings. No phone-reveal endpoint exists yet. Phase 6 will add a controlled reveal action that respects preferences and limits abuse.
- Profiles only expose public fields. Users can change their own name/avatar, but column grants prevent changing `contact_verified`.
- The badge means verified contact, not identity. Its verification workflow will be implemented later through trusted server logic. It defaults to false.
- Sellers cannot approve ads, alter staff roles, or feature themselves. Admin membership must be provisioned through trusted SQL/server administration. Admins can assign/revoke moderators; moderators can only review ads and report/view bugs.
- Photos use a private bucket and RLS. Phase 4 will compress to WebP before upload. Storage enforces a 2 MiB limit; metadata positions enforce eight photos per ad.
- Draft image metadata must exist before uploading its matching file. Submission requires at least one uploaded object and an area location. Complete category validation and file content inspection belong in the posting workflow.
- Signed URLs will be short-lived. An already-issued URL can remain readable until it expires after an ad becomes private; use a short expiry in Phase 4.
- Only buyer/seller conversation participants can read messages; the sender ID must match the logged-in user. Admins do not automatically get access to private chat.
- Reports cannot be submitted already resolved. Only admins can inspect or resolve reports.
- Bug findings can be submitted by signed-in users; moderators can review them, while only admins can change triage status.
- Duplicate pending/active ads with identical normalized title and description are blocked per seller. This is a basic duplicate check, not similarity detection.
- Rate limits, profanity filtering, account suspension, CAPTCHA, category validation, full location data, and content moderation UI are later implementation work. RLS does not replace those controls. No unrestricted publish endpoint exists in this phase.

After signing in once with the owner email, provision the initial admin through trusted Supabase SQL Editor. The complete copy-paste command is in [TURNOVER-SETUP.md](TURNOVER-SETUP.md). Admin assignment is never available to a browser client.

```sql
insert into public.user_roles(user_id,role)
select firebase_uid,'admin'
from private.user_emails
where lower(email) = lower('owner@example.com')
on conflict (user_id) do update set role = 'admin';
```

Replace the example address with the verified Firebase email. Never expose an endpoint that lets arbitrary users create admin memberships. Firebase account blocking/deletion requires trusted Firebase Admin operations in a later phase.

## 12. Run local checks

```sh
npm run typecheck
npm test
npm run build
```

The small format tests cover Bangladesh number grouping, Bengali digits, invalid money values, and canonical mobile number validation. The schema tests cover real security behavior rather than only checking SQL text.

For database tests, use a disposable local PostgreSQL instance with no existing `anon` or `authenticated` roles. Create a database named **exactly** `turnover_phase3_test`, then run these files in order with `psql -v ON_ERROR_STOP=1`:

```sh
createdb turnover_phase3_test
psql -d turnover_phase3_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/bootstrap.sql \
  -f supabase/migrations/202610300001_initial_schema.sql \
  -f supabase/tests/migration_fixture.sql \
  -f supabase/migrations/202610300002_firebase_moderation.sql \
  -f supabase/seed.sql \
  -f supabase/tests/security.sql
```

Only run that command against your disposable instance. The test bootstrap intentionally creates simplified `auth` and `storage` schemas; these are not replacements for the real Supabase services. The test user needs permission to create roles. The security assertions roll back their fixture data.

If `npm run dev` says a service is not configured, check `.env.local` and restart the dev server. If seed results are zero, check the migrations succeeded in the same project. New profiles are created from a verified Firebase sign-in, not by manually inserting arbitrary seller IDs.

## 13. Full copy-paste source

Open [PHASE-1-CODE.md](PHASE-1-CODE.md) for the original foundation snapshot. The current complete source is in [PHASE-3-CODE.md](PHASE-3-CODE.md). Both companions list each file with its exact relative path. Use the source files directly if you are working in this existing folder. To refresh the current companion after editing files:

```sh
npm run docs:code
```

## Official setup references

- Next.js installation: https://nextjs.org/docs/app/getting-started/installation
- Tailwind with Next.js: https://tailwindcss.com/docs/installation/framework-guides/nextjs
- Supabase Next.js quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
- Supabase data security: https://supabase.com/docs/guides/database/secure-data
- Supabase server-side Auth: https://supabase.com/docs/guides/auth/server-side

The current TurnOver setup, authentication, and initial operations workspace are documented in [TURNOVER-SETUP.md](TURNOVER-SETUP.md).
