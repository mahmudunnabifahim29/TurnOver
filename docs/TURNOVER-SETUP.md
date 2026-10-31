# TurnOver setup guide

TurnOver uses Firebase for sign-in, marketplace data, and trusted staff functions; Cloudflare R2 stores listing photos, and Cloudflare Workers hosts the Next.js app.

## 1. Install and configure the local app

Use Node.js 22 or newer. In the project folder run:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`.env.example` contains the public Firebase Web app configuration for project `turnover-f8f7d`. It is not a service-account credential. Do not commit `.env.local` or any Firebase service account, Cloudflare API token, or secret.

In Firebase Console:

1. Enable **Google** and **Email/Password** in Authentication. Keep both password sign-in and **Email link (passwordless sign-in)** enabled.
2. Under **Authentication → Settings → Password policy**, set minimum length to 8 and require uppercase, lowercase, numeric, and non-alphanumeric characters.
3. Add `localhost` and your production host to Authentication's authorized domains.
4. Configure the email template and sender details before inviting users.
5. Create Firestore in `asia-southeast1` to align the database with the marketplace Functions. Existing databases cannot change region.
6. Restrict the Firebase Web API key to the Identity Toolkit API and Cloud Firestore API. Do not add a service-account key to any `NEXT_PUBLIC_` variable.

The login flow supports Google, email/password, and passwordless email links. Password sign-up checks the required character classes in the app, while Firebase's password policy enforces them for all clients. Email must be verified to create a marketplace profile or post an ad.

## 2. Create the private photo bucket

In Cloudflare, create an R2 bucket named `turnover-listing-images`. Keep public access disabled. The Worker accesses it through the `LISTING_IMAGES` binding in `wrangler.jsonc`; photos are served by the app so pending/draft photos remain private.

Sign in to Wrangler and deploy the Firebase backend:

```sh
npx wrangler login
npx firebase-tools login
npx firebase-tools use turnover-f8f7d
cd functions
npm install
cd ..
npx firebase-tools deploy --only firestore,functions
```

The first Firebase Functions deployment may require the Blaze billing plan. Review Firebase pricing before enabling billing. Functions use Google-managed service credentials; do not download or commit a service-account file. Firestore rules deny browser access to user-role profiles; staff roles are assigned only by trusted Functions.

The first verified user seeds the default categories and Bangladesh area list. To create the first administrator, sign in with `mahmudunnabifahim3579@gmail.com`, open `/admin`, and use **Set up first administrator**. This one-time action fails after an administrator already exists. The administrator can then add moderators from **Users & moderators**.

## 3. Local development and role-separated pages

Run `npm run dev`, then open `http://localhost:3000`. The app has three separate surfaces:

- `/` — public marketplace and approved listings.
- `/admin` — administrator console for reports, categories, users, and all listing operations.
- `/moderation` — moderator queue for approving/rejecting ads and reviewing bug findings.

`/post` is for signed-in sellers. New listings remain drafts while photos upload, then enter the private pending queue. Only approved listings and their photos become public.

## 4. Deploy to Cloudflare Workers

The Worker config is in `wrangler.jsonc`; it expects the R2 bucket created above. In Cloudflare Workers settings, add the Firebase Web app values from `.env.example` as variables: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, and `NEXT_PUBLIC_FIREBASE_APP_ID`. Set the same values in `.env.local` before the build so Next.js can include its public Firebase configuration.

Then build and deploy:

```sh
npx wrangler login
npm run deploy:cloudflare
```

For a local Worker preview, use `npm run build:cloudflare` followed by `npm run preview:cloudflare`. Deploy Firestore rules and indexes whenever they change:

```sh
npx firebase-tools deploy --only firestore
```

Set the production host as a Firebase Authentication authorized domain. Configure a custom domain in Cloudflare Workers if needed. The R2 bucket must remain private; do not enable its public development URL.

## 5. Troubleshooting

- **Firebase setup notice:** confirm all Firebase values are present and restart the app.
- **Profile or role setup fails:** deploy `functions` to `asia-southeast1`, enable the verified sign-in provider, and check Firebase Function logs.
- **Firestore permission error:** deploy `firestore.rules` and ensure the signed-in user completed the callable profile setup.
- **No area choices:** sign in with a verified email once; profile setup seeds the initial categories and areas.
- **Photo upload or display fails:** confirm the `turnover-listing-images` R2 bucket and `LISTING_IMAGES` binding exist, then check Worker logs. Pending photos are intentionally unavailable to public visitors.
- **Admin bootstrap is rejected:** only the verified owner email can claim the first administrator, and it is blocked once another administrator exists.

Never paste passwords, ID tokens, API tokens, private keys, or service credentials into issue reports.
