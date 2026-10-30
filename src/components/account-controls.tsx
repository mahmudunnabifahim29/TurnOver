"use client";

import { onAuthStateChanged, signOut } from "@firebase/auth";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

export default function AccountControls() {
  const configured = isFirebaseConfigured();
  const [email, setEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(getFirebaseAuth(), (user) => setEmail(user?.email ?? null));
  }, [configured]);

  if (!configured) {
    return <span aria-label={authError} className="hidden text-xs font-semibold text-amber-800 sm:inline-flex" title={authError}>Auth setup needed</span>;
  }

  if (!email) {
    return <Link className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-semibold text-slate-700 transition hover:text-emerald-800 sm:text-sm" href="/login">Log in</Link>;
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Link className="hidden text-sm font-semibold text-slate-700 hover:text-emerald-800 sm:inline-flex" href="/admin">Staff workspace</Link>
      <span className="hidden max-w-36 truncate text-xs text-slate-500 md:inline">{email}</span>
      {authError && <span aria-live="assertive" className="text-xs text-rose-700">{authError}</span>}
      <button
        className="min-h-9 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:text-slate-950 sm:text-sm"
        onClick={async () => {
          try {
            await signOut(getFirebaseAuth());
          } catch (error) {
            setAuthError(error instanceof Error ? error.message : "Could not sign out.");
          }
        }}
        type="button"
      >
        Sign out
      </button>
    </div>
  );
}
