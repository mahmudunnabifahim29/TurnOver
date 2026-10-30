# TurnOver

A Bangladesh classifieds marketplace, built in user-controlled phases.

**Current milestone: Google and passwordless email-link sign-in, seller ad submissions, and Supabase-backed moderation.**

Start with the beginner [TurnOver setup guide](docs/TURNOVER-SETUP.md). The full current source, with copy-paste code grouped by file path, is in [the source companion](docs/PHASE-3-CODE.md).

```sh
npm ci
npm run dev
```

The public storefront has no fake ads. Signed-in users can submit ads at `/post`; approved listings appear in search and on the homepage. Firebase sign-in and `/admin` or `/moderation` require the setup steps in the guide, including Supabase Third-Party Auth and deployment of the Firebase claim function. Never commit `.env.local` or service-account credentials.

New listings must be approved before they become public. Admins manage the business workspace and staff roles; Moderators can review ad submissions and report bugs.
