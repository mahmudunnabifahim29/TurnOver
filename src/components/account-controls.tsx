"use client";

import { onIdTokenChanged, signOut } from "@firebase/auth";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "./locale-switcher";

export default function AccountControls({ locale }: { locale: Locale }) {
  const configured = isFirebaseConfigured();
  const [email, setEmail] = useState<string | null>(null);
  const [staffHref, setStaffHref] = useState<"/admin" | "/moderation" | null>(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!configured) return;
    let active = true;
    const unsubscribe = onIdTokenChanged(getFirebaseAuth(), async (user) => {
      if (!active) return;
      setEmail(user?.email ?? null);
      setStaffHref(null);
      setAuthError("");
      if (!user) return;
      try {
        const { data, error } = await createClient()
          .from("user_roles")
          .select("role")
          .eq("user_id", user.uid)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (active && (data?.role === "admin" || data?.role === "moderator")) {
          setStaffHref(data.role === "admin" ? "/admin" : "/moderation");
        }
      } catch (caught) {
        if (active) setAuthError(caught instanceof Error ? caught.message : "Could not check your staff access.");
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [configured]);

  if (!configured) {
    return <span aria-label={authError} className="hidden text-xs font-semibold text-amber-800 sm:inline-flex" title={authError}>Auth setup needed</span>;
  }

  if (!email) {
    return <Link className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-semibold text-slate-700 transition hover:text-emerald-800 sm:text-sm" href="/login">{locale === "bn" ? "লগ ইন" : "Log in"}</Link>;
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {staffHref && <Link className="hidden text-sm font-semibold text-slate-700 hover:text-emerald-800 sm:inline-flex" href={staffHref}>{staffHref === "/admin" ? (locale === "bn" ? "অ্যাডমিন" : "Admin") : (locale === "bn" ? "মডারেশন" : "Moderation")}</Link>}
      <span className="hidden max-w-36 truncate text-xs text-slate-500 md:inline">{email}</span>
      {authError && <span aria-live="assertive" className="max-w-40 text-xs text-rose-700">{authError}</span>}
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
        {locale === "bn" ? "লগ আউট" : "Sign out"}
      </button>
    </div>
  );
}
