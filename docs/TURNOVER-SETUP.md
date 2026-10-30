# TurnOver setup guide

This guide explains how to connect TurnOver to Firebase Authentication and Supabase. The app code is ready, but hosted services are not configured or deployed by this workspace.

## What is connected

- **Next.js + Tailwind CSS:** public marketplace pages and the private `/admin` operations workspace.
- **Firebase Authentication:** Google sign-in and passwordless, one-time email sign-in links. Email links verify inbox ownership; they are not numeric OTP codes.
- **Firebase Cloud Functions:** a small authenticated callable grants the safe `role: authenticated` token claim that Supabase requires for Firebase third-party authentication.
- **Supabase PostgreSQL + Storage:** listings, user profiles, moderator roles, reports, images, and bug findings. Row Level Security (RLS) is the authoritative access control.
- **Vercel:** hosting remains a later deployment step.

Firebase Auth user IDs are strings, not UUIDs. The second database migration converts marketplace user-ID columns to text so RLS can validate the Firebase token subject without unsafe UUID casts. A Firebase user's email is stored only in a private database table; it is returned to the browser only through an Admin-only database function.

## 1. Open the renamed project

Open the `TurnOver` folder in VS Code. In a terminal inside the folder, check that Node.js 22 or newer and npm are available:

```sh
node --version
npm --version
```

Install the application dependencies and start the local app:

```sh
npm ci
npm run dev
```

The local address is normally http://localhost:3000. You can also use http://127.0.0.1:3000 after allowing that domain in Firebase.

## 2. Configure Firebase sign-in

The Firebase Web configuration supplied for project `turnover-d5a51` is already listed in `.env.example`. Copy it to the ignored local environment file:

```sh
cp .env.example .env.local
```

Open `.env.local` and replace the two Supabase placeholders with your Supabase project URL and **publishable** key. Keep private database passwords and service-role/secret keys out of all `NEXT_PUBLIC_` variables. Restart `npm run dev` after changing environment values.

In the Firebase Console for `turnover-d5a51`:

1. Open **Authentication → Sign-in method**.
2. Enable **Google** and configure its support email.
3. Enable **Email/Password**, then enable **Email link (passwordless sign-in)**. Do not select password-only sign-in.
4. Open **Authentication → Settings → Authorized domains**. Confirm both `localhost` and `127.0.0.1` are present. Add your production domain later.
5. Configure the email template and sender details before inviting real users.
6. Restrict the Firebase API key in Google Cloud to the Firebase Authentication API and the site referrers you use. The Web API key is public configuration, not a service-account credential, but it should still have appropriate restrictions.

The login screen supports Google sign-in and a one-time email link. The email link flow asks users to enter their email, then open the emailed link to finish signing in; it does not send a numeric OTP code. The website does not load Firebase Analytics in this phase.

## 3. Connect Firebase to Supabase

In the Supabase dashboard:

1. Open the project for TurnOver, or create a new development project.
2. Open **Authentication → Third-Party Auth** and add **Firebase**.
3. Enter Firebase project ID `turnover-d5a51` and save the integration. This makes Supabase verify identity tokens issued by this Firebase project.
4. Do not disable RLS. The Firebase integration trusts this Firebase project, while each table policy still decides which rows a user may read or change.

The app's authenticated Firebase callable sets only the standard `role: authenticated` claim. Admin and moderator privileges are stored separately in `public.user_roles`; users cannot assign or change those roles from the browser.

The site header has an **EN / বাংলা** switch. The selected language is saved in a secure, same-site cookie and applied to the storefront and shared navigation.

## 4. Apply the database schema

Use a new/empty Supabase project for a first setup. If you have existing production data, take a database backup and review the ID conversion before applying the second migration. Do not paste the test bootstrap scripts into Supabase.

In Supabase **SQL Editor**, run each file as a separate query, in this order:

1. `supabase/migrations/202610300001_initial_schema.sql`
2. `supabase/migrations/202610300002_firebase_moderation.sql`
3. `supabase/seed.sql`

The seed adds the 12 main categories, eight divisions, and demo-only sample Dhaka locations. It creates no ads. The storefront intentionally shows an empty state until real listings have been approved.

## 5. Deploy the Firebase-to-Supabase claim function

The browser must never be able to set Firebase custom claims. This project includes a callable Cloud Function that verifies the caller's Firebase session and adds only `role: authenticated`. Supabase checks that signed claim before applying RLS policies.

Install the Firebase CLI if you do not already have it:

```sh
npm install -g firebase-tools
firebase login
```

From the TurnOver project root, install the isolated function dependencies and deploy:

```sh
cd functions
npm ci
cd ..
firebase use turnover-d5a51
firebase deploy --only functions:ensureSupabaseAuthenticatedRole
```

Firebase Cloud Functions deployment may require the Firebase **Blaze** billing plan and can incur charges. Review Firebase pricing and enable billing only if you accept those terms. The function uses Google-managed credentials; do not download or commit a service-account JSON file.

If `npm ci` in `functions/` reports that no lockfile exists, run `npm install` once in that folder, then repeat `npm ci`.

## 6. Start the website and sign in

From the project root:

```sh
npm run dev
```

Open http://localhost:3000/login and choose Google or enter your email to receive a one-time sign-in link. After successful sign-in, the app calls the Firebase function, refreshes the ID token, and creates the user's marketplace profile using a restricted Supabase function.

If sign-in succeeds but marketplace setup fails, check:

- The Firebase Cloud Function deployed successfully in `asia-southeast1`.
- Supabase **Third-Party Auth** is connected to Firebase project `turnover-d5a51`.
- `.env.local` contains the correct Supabase URL and publishable key.
- Both local hosts are authorized in Firebase.

## 7. Provision the first administrator

Sign in once with the owner email (`mahmudunnabifahim3579@gmail.com`) so Firebase and Supabase create the profile. Then run this trusted query in the Supabase SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select firebase_uid, 'admin'
from private.user_emails
where lower(email) = lower('mahmudunnabifahim3579@gmail.com')
on conflict (user_id) do update set role = 'admin';
```

Open http://localhost:3000/admin and sign in with that account. The email lookup table is private to the database; the Admin-only RPC supplies the account list for moderator assignment. Do not expose a public endpoint for adding Admins.

The three separate app pages are the public marketplace (`/`), the administrator console (`/admin`), and the moderator review workspace (`/moderation`). Administrators can review ads, reports, bug findings, and account roles; see safe connection/security status; and grant or remove Moderator access. Moderators can use their dedicated review queue to approve/reject pending ads and submit/view bug findings, but cannot manage users, inspect security details, or resolve ad reports. Admins and moderators must sign in and have their respective trusted role provisioned. Secrets and raw security tokens are never displayed.

## 8. Create and approve listings

Signed-in users can open `/post`, add an item description, price, area, condition, and up to eight photos. Photos are converted to WebP in the browser and uploaded to the private `ad-images` bucket. The form creates a private draft and submits it to the pending review queue. New ads are forced to `draft` on insert; guests cannot read pending ads or their photos. Only an Admin or Moderator can change a pending ad to `active` or `rejected`; the status change is audited. Moderators can change only the status, not title, price, or other listing content. Approved listings and their photos appear on the public homepage.

The sample seed includes only a few Dhaka areas. Add the complete division/district/area hierarchy before opening listings to all of Bangladesh; the posting form intentionally requires an area-level location.

## 9. Hosting and custom domain

The app is responsive and can be deployed to Vercel. Create a Vercel project from the GitHub repository, add the same Firebase and Supabase environment variables from `.env.local` to the Vercel project settings, and deploy. Add the selected production hostname to Firebase Authentication's authorized domains and to the Firebase API key's referrer restrictions.

`TurnOver` is the current product name. A domain such as `bsturnover.org` must be checked for availability and registered separately; it is not included or live by default. After registration, configure its DNS records with the hosting provider and add that domain as a Vercel domain before sharing the site.

## 10. Run application checks

Run application checks:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The SQL security tests run only against a disposable local PostgreSQL database. The test scripts create mock Supabase `auth` and `storage` schemas; never run them against a real project.

## Current scope

The home page has no fake ads. Public browsing/search, authenticated ad posting, and admin/moderator review are implemented. Listing detail pages, customer messaging, and paid promotions remain future work.
