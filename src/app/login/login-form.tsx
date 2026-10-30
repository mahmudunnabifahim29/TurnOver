"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getRedirectResult, GoogleAuthProvider, onAuthStateChanged, sendSignInLinkToEmail, signInWithEmailLink, signInWithPopup, signInWithRedirect, signOut, type User } from "@firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { prepareUserForMarketplace } from "@/lib/firebase/prepare-user";

function messageForError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    switch (error.code) {
      case "auth/operation-not-allowed":
        return "Google sign-in is not enabled for this Firebase project yet. Enable Google under Firebase Authentication → Sign-in method.";
      case "auth/unauthorized-domain":
        return "This website domain is not authorized in Firebase Authentication. Add it under Authentication → Settings → Authorized domains.";
      case "auth/popup-blocked":
        return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
      case "auth/popup-closed-by-user":
        return "The Google sign-in window was closed before sign-in finished. You can try again.";
      case "auth/account-exists-with-different-credential":
        return "An account already exists with this email. Sign in using the provider you originally used.";
      case "auth/cancelled-popup-request":
        return "A Google sign-in attempt is already open. Finish that window or close it before trying again.";
    }
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function getAuthErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configured = isFirebaseConfigured();
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const requestedPath = searchParams.get("next");
  const nextPath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
  const isLink = searchParams.get("mode") === "signIn" && Boolean(searchParams.get("oobCode"));

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(getFirebaseAuth(), (signedInUser) => {
      setUser(signedInUser);
      const savedEmail = window.localStorage.getItem("turnover-signin-email");
      if (savedEmail) setEmail((current) => current || savedEmail);
    });
  }, [configured]);

  useEffect(() => {
    if (!configured || window.sessionStorage.getItem("turnover-google-redirect") !== "pending") return;
    let active = true;
    window.sessionStorage.removeItem("turnover-google-redirect");
    getRedirectResult(getFirebaseAuth())
      .then(async (result) => {
        if (!result || !active) return;
        setUser(result.user);
        await prepareUserForMarketplace(result.user);
        if (active) router.replace(nextPath);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageForError(caught));
      });
    return () => {
      active = false;
    };
  }, [configured, nextPath, router]);

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!configured) throw new Error("Firebase is not configured. Copy .env.example to .env.local and restart the app.");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const auth = getFirebaseAuth();
      const signedIn = await signInWithPopup(auth, provider);
      setUser(signedIn.user);
      await prepareUserForMarketplace(signedIn.user);
      router.replace(nextPath);
    } catch (caught) {
      if (getAuthErrorCode(caught) === "auth/popup-blocked") {
        try {
          window.sessionStorage.setItem("turnover-google-redirect", "pending");
          await signInWithRedirect(getFirebaseAuth(), new GoogleAuthProvider());
          return;
        } catch (redirectError) {
          window.sessionStorage.removeItem("turnover-google-redirect");
          setError(messageForError(redirectError));
          return;
        }
      }
      setError(messageForError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!configured) throw new Error("Firebase is not configured. Copy .env.example to .env.local and restart the app.");
      const auth = getFirebaseAuth();
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) throw new Error("Enter your email address.");

      if (isLink) {
        const signedIn = await signInWithEmailLink(auth, normalizedEmail, window.location.href);
        window.localStorage.removeItem("turnover-signin-email");
        setUser(signedIn.user);
        await prepareUserForMarketplace(signedIn.user);
        router.replace(nextPath);
        return;
      }

      await sendSignInLinkToEmail(auth, normalizedEmail, {
        url: `${window.location.origin}/login?next=${encodeURIComponent(nextPath)}`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem("turnover-signin-email", normalizedEmail);
      setNotice("Check your inbox for your secure sign-in link. Keep this page open, then open the link on this device.");
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function finishMarketplaceSetup() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await prepareUserForMarketplace(user);
      router.replace(nextPath);
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function leaveAccount() {
    try {
      await signOut(getFirebaseAuth());
      setNotice("You have signed out.");
      setError("");
    } catch (caught) {
      setError(messageForError(caught));
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-6xl items-center px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto grid w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 md:grid-cols-[1fr_0.85fr]">
        <div className="p-6 sm:p-10 lg:p-14">
          <p className="text-sm font-bold text-emerald-800">TurnOver account</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
            {isLink ? "Finish signing in" : "Welcome to TurnOver"}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
            New here or returning? Continue with Google or use a one-time email link. First-time sign-in creates your account automatically.
          </p>

          {user ? (
            <div className="mt-8 space-y-4">
              <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
                Signed in as <span className="font-semibold">{user.email}</span>.
              </p>
              {error && <p aria-live="assertive" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">{error}</p>}
              <button className="min-h-12 w-full rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60" disabled={busy} onClick={finishMarketplaceSetup} type="button">
                {busy ? "Connecting your account…" : "Continue to TurnOver"}
              </button>
              <p className="text-center text-xs leading-5 text-slate-500">First time here? Google sign-in creates your account automatically.</p>
              <button className="w-full py-2 text-sm font-semibold text-slate-600 hover:text-slate-900" onClick={leaveAccount} type="button">
                Use another account
              </button>
            </div>
          ) : (
            <>
              {!configured && <p className="mt-6 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">Firebase is not configured yet. Copy `.env.example` to `.env.local`, then restart the development server.</p>}
              <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                <button
                  className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy || !configured || isLink}
                  onClick={signInWithGoogle}
                  type="button"
                >
                  <svg aria-hidden="true" height="18" viewBox="0 0 48 48" width="18">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.93 46.98 31.84 46.98 24.55Z" />
                    <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                  </svg>
                  Continue with Google to sign up or log in
                </button>
                <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  OR USE EMAIL
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <label className="block text-sm font-semibold text-slate-800" htmlFor="email">Email address</label>
                <input
                  autoComplete="email"
                  className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
                <button className="min-h-12 w-full rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy} type="submit">
                  {busy ? "Please wait…" : isLink ? "Verify email and sign in" : "Email me a sign-in link"}
                </button>
                {notice && <p aria-live="polite" className="rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{notice}</p>}
                {error && <p aria-live="assertive" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">{error}</p>}
              </form>
            </>
          )}

          <p className="mt-6 text-xs leading-5 text-slate-500">
            By continuing, you agree to use TurnOver safely and honestly. Your email link verifies control of your inbox.
          </p>
        </div>
        <aside className="hidden flex-col justify-between bg-emerald-800 p-10 text-white md:flex lg:p-14">
          <div>
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-2xl" aria-hidden="true">↗</span>
            <h2 className="mt-8 text-2xl font-bold">A little more local. A lot more useful.</h2>
            <p className="mt-3 text-sm leading-6 text-emerald-100">One account to find great local listings and, when you’re ready, post your own.</p>
          </div>
          <p className="text-xs text-emerald-200">TurnOver · Bangladesh</p>
        </aside>
      </section>
    </main>
  );
}
