# TurnOver

A Bangladesh classifieds marketplace, built in user-controlled phases.

**Current milestone: Firebase Authentication and Firestore, Cloudflare R2 listing photos, and Firebase-backed moderation.**

Start with the beginner [TurnOver setup guide](docs/TURNOVER-SETUP.md). The full current source, with copy-paste code grouped by file path, is in [the source companion](docs/PHASE-3-CODE.md).

```sh
npm ci
npm run dev
```

The public storefront has no fake ads. Signed-in users can submit ads at `/post`; approved listings appear in search and on the homepage. Firebase sign-in, Firestore access, and `/admin` or `/moderation` require the setup steps in the guide. Never commit `.env.local`, Cloudflare secrets, or service-account credentials.

New listings must be approved before they become public. Photos stay in a private Cloudflare R2 bucket and are delivered through authenticated app routes until listing approval. Admins manage the business workspace and staff roles; Moderators can review ad submissions and report bugs. Cloudflare Workers hosting is configured with OpenNext.
